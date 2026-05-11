-- ============================================================
-- Travel Planner — Bloco F1: Identificação leve de passageiros
--
-- Cada pessoa da viagem se identifica na primeira abertura do portal
-- (/v/:token). Sem login ainda — só nome + email/telefone + relação
-- (marido, esposa, filho, outro). Cookie persistente lembra nas próximas
-- visitas. Comentários passam a mostrar "João (marido)" em vez de
-- "Cliente" genérico.
--
-- 1. Tabela trip_participants
-- 2. RPC identificar_participante(token, nome, email, telefone, relacao)
-- 3. RPC comentar_item estendida com p_participant_id
-- 4. RPC get_viagem_by_token retorna autor_nome e autor_relacao nos
--    comentários de cliente
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. trip_participants
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_participants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id       UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES public.organizations(id),
  nome            TEXT NOT NULL,
  email           TEXT,
  telefone        TEXT,
  relacao         TEXT CHECK (relacao IN ('marido','esposa','companheiro','filho','filha','pai','mae','amigo','outro')),
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.trip_participants IS
  'Passageiros identificados no portal /v/:token. Sem login — identificação leve por nome+email/telefone, cookie persistente.';

-- Dedup (viagem + email) e (viagem + telefone)
CREATE UNIQUE INDEX IF NOT EXISTS ux_trip_participants_viagem_email
  ON public.trip_participants (viagem_id, lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_trip_participants_viagem_telefone
  ON public.trip_participants (viagem_id, telefone)
  WHERE telefone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trip_participants_viagem
  ON public.trip_participants (viagem_id);

ALTER TABLE public.trip_participants ENABLE ROW LEVEL SECURITY;

-- Org members leem e gerenciam
DROP POLICY IF EXISTS trip_participants_org_all ON public.trip_participants;
CREATE POLICY trip_participants_org_all ON public.trip_participants
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS trip_participants_service_all ON public.trip_participants;
CREATE POLICY trip_participants_service_all ON public.trip_participants
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Trigger: auto-setar org_id a partir da viagem (tanto anon via RPC quanto
-- org member inserindo direto). Cobre caso de requesting_org_id() NULL.
CREATE OR REPLACE FUNCTION public.auto_set_trip_participants_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem_org UUID;
BEGIN
  IF NEW.viagem_id IS NULL THEN
    RAISE EXCEPTION 'trip_participants.viagem_id obrigatório';
  END IF;
  SELECT org_id INTO v_viagem_org FROM viagens WHERE id = NEW.viagem_id;
  IF v_viagem_org IS NULL THEN
    RAISE EXCEPTION 'Viagem % não encontrada', NEW.viagem_id;
  END IF;
  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_viagem_org;
  ELSIF NEW.org_id <> v_viagem_org THEN
    RAISE EXCEPTION 'trip_participants.org_id (%) não bate com viagem.org_id (%)', NEW.org_id, v_viagem_org;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_trip_participants_org ON public.trip_participants;
CREATE TRIGGER trg_trip_participants_org
  BEFORE INSERT OR UPDATE ON public.trip_participants
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_trip_participants_org();

-- ────────────────────────────────────────────────────────────
-- 2. RPC identificar_participante
--    Upsert por (viagem + email) ou (viagem + telefone). Retorna id
--    para o frontend salvar em cookie.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.identificar_participante(
  p_token     TEXT,
  p_nome      TEXT,
  p_email     TEXT DEFAULT NULL,
  p_telefone  TEXT DEFAULT NULL,
  p_relacao   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_part RECORD;
  v_part_id UUID;
  v_novo BOOLEAN := false;
  v_email_norm TEXT;
  v_tel_norm TEXT;
BEGIN
  -- Validação básica
  IF p_nome IS NULL OR TRIM(p_nome) = '' THEN
    RAISE EXCEPTION 'Nome é obrigatório' USING ERRCODE = 'check_violation';
  END IF;
  v_email_norm := NULLIF(LOWER(TRIM(COALESCE(p_email, ''))), '');
  v_tel_norm   := NULLIF(REGEXP_REPLACE(COALESCE(p_telefone, ''), '[^0-9+]', '', 'g'), '');

  IF v_email_norm IS NULL AND v_tel_norm IS NULL THEN
    RAISE EXCEPTION 'Informe email ou telefone' USING ERRCODE = 'check_violation';
  END IF;

  -- Token
  SELECT id, org_id INTO v_viagem FROM viagens WHERE public_token = p_token;
  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Localizar por email, depois telefone
  IF v_email_norm IS NOT NULL THEN
    SELECT * INTO v_part FROM trip_participants
    WHERE viagem_id = v_viagem.id AND lower(email) = v_email_norm
    LIMIT 1;
  END IF;

  IF v_part IS NULL AND v_tel_norm IS NOT NULL THEN
    SELECT * INTO v_part FROM trip_participants
    WHERE viagem_id = v_viagem.id AND telefone = v_tel_norm
    LIMIT 1;
  END IF;

  IF v_part IS NULL THEN
    -- Novo
    INSERT INTO trip_participants (viagem_id, org_id, nome, email, telefone, relacao)
    VALUES (
      v_viagem.id, v_viagem.org_id, TRIM(p_nome),
      v_email_norm, v_tel_norm,
      NULLIF(LOWER(TRIM(COALESCE(p_relacao, ''))), '')
    )
    RETURNING id INTO v_part_id;
    v_novo := true;

    -- Evento (só para passageiros novos)
    INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
    VALUES (
      v_viagem.id, v_viagem.org_id, 'participante_identificado',
      jsonb_build_object('participant_id', v_part_id, 'nome', TRIM(p_nome), 'relacao', p_relacao)
    );
  ELSE
    -- Existente: atualizar last_seen, preencher campos vazios com dados novos
    UPDATE trip_participants
    SET last_seen_at = now(),
        nome = COALESCE(NULLIF(TRIM(p_nome), ''), nome),
        email = COALESCE(email, v_email_norm),
        telefone = COALESCE(telefone, v_tel_norm),
        relacao = COALESCE(relacao, NULLIF(LOWER(TRIM(COALESCE(p_relacao, ''))), ''))
    WHERE id = v_part.id
    RETURNING id INTO v_part_id;
  END IF;

  RETURN jsonb_build_object(
    'participant_id', v_part_id,
    'novo', v_novo,
    'nome', TRIM(p_nome),
    'relacao', p_relacao
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.identificar_participante(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.identificar_participante(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.identificar_participante(TEXT, TEXT, TEXT, TEXT, TEXT) IS
  'Passageiro se identifica no portal. Upsert por (viagem + email) ou (viagem + telefone). Retorna participant_id para cookie.';

-- ────────────────────────────────────────────────────────────
-- 3. RPC comentar_item — aceitar p_participant_id opcional
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.comentar_item(
  p_token          TEXT,
  p_item_id        UUID,
  p_texto          TEXT,
  p_participant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_comment_id UUID;
  v_part_ok UUID;
BEGIN
  SELECT id, org_id INTO v_viagem FROM viagens WHERE public_token = p_token;
  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_item_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM trip_items
      WHERE id = p_item_id AND viagem_id = v_viagem.id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Item não encontrado nesta viagem' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- Validar que participant pertence à viagem (se informado)
  IF p_participant_id IS NOT NULL THEN
    SELECT id INTO v_part_ok FROM trip_participants
    WHERE id = p_participant_id AND viagem_id = v_viagem.id;
    IF v_part_ok IS NULL THEN
      RAISE EXCEPTION 'Passageiro não encontrado nesta viagem' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  INSERT INTO trip_comments (viagem_id, item_id, org_id, autor, autor_id, texto, interno)
  VALUES (v_viagem.id, p_item_id, v_viagem.org_id, 'client', p_participant_id, p_texto, false)
  RETURNING id INTO v_comment_id;

  INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
  VALUES (v_viagem.id, v_viagem.org_id, 'comentario_cliente',
    jsonb_build_object('comment_id', v_comment_id, 'item_id', p_item_id, 'participant_id', p_participant_id));

  RETURN jsonb_build_object(
    'id', v_comment_id,
    'viagem_id', v_viagem.id,
    'item_id', p_item_id,
    'autor', 'client',
    'autor_id', p_participant_id,
    'texto', p_texto,
    'created_at', now()
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.comentar_item(TEXT, UUID, TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.comentar_item(TEXT, UUID, TEXT, UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. get_viagem_by_token retorna autor_nome + autor_relacao nos
--    comentários de cliente
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_viagem_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_result JSONB;
  v_items JSONB;
  v_comments JSONB;
  v_events JSONB;
  v_tp RECORD;
  v_pv RECORD;
BEGIN
  SELECT * INTO v_viagem FROM viagens WHERE public_token = p_token;
  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id, nome, avatar_url INTO v_tp FROM profiles WHERE id = v_viagem.tp_owner_id;
  SELECT id, nome, avatar_url INTO v_pv FROM profiles WHERE id = v_viagem.pos_owner_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'parent_id', i.parent_id,
      'tipo', i.tipo::text,
      'status', i.status::text,
      'ordem', i.ordem,
      'comercial', i.comercial,
      'operacional', CASE
        WHEN i.status IN ('operacional', 'vivido', 'arquivado')
        THEN i.operacional
        ELSE '{}'::jsonb
      END,
      'alternativas', i.alternativas,
      'aprovado_em', i.aprovado_em,
      'aprovado_por', i.aprovado_por
    ) ORDER BY i.parent_id NULLS FIRST, i.ordem
  ), '[]'::jsonb)
  INTO v_items
  FROM trip_items i
  WHERE i.viagem_id = v_viagem.id
    AND i.status <> 'rascunho'
    AND i.deleted_at IS NULL;

  -- Comentários: exclui internos, enriquece com nome do passageiro
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'item_id', c.item_id,
      'autor', c.autor,
      'autor_id', c.autor_id,
      'autor_nome', p.nome,
      'autor_relacao', p.relacao,
      'texto', c.texto,
      'created_at', c.created_at
    ) ORDER BY c.created_at
  ), '[]'::jsonb)
  INTO v_comments
  FROM trip_comments c
  LEFT JOIN trip_participants p
    ON p.id = c.autor_id AND c.autor = 'client'
  WHERE c.viagem_id = v_viagem.id
    AND c.interno = false;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', e.id, 'tipo', e.tipo, 'payload', e.payload, 'created_at', e.created_at
    ) ORDER BY e.created_at
  ), '[]'::jsonb)
  INTO v_events
  FROM trip_events e
  WHERE e.viagem_id = v_viagem.id;

  v_result := jsonb_build_object(
    'id', v_viagem.id,
    'estado', v_viagem.estado::text,
    'titulo', v_viagem.titulo,
    'subtitulo', v_viagem.subtitulo,
    'capa_url', v_viagem.capa_url,
    'total_estimado', v_viagem.total_estimado,
    'total_aprovado', v_viagem.total_aprovado,
    'enviada_em', v_viagem.enviada_em,
    'confirmada_em', v_viagem.confirmada_em,
    'tp', CASE WHEN v_tp IS NOT NULL THEN jsonb_build_object(
      'id', v_tp.id, 'nome', v_tp.nome, 'avatar_url', v_tp.avatar_url
    ) ELSE NULL END,
    'pv', CASE WHEN v_pv IS NOT NULL THEN jsonb_build_object(
      'id', v_pv.id, 'nome', v_pv.nome, 'avatar_url', v_pv.avatar_url
    ) ELSE NULL END,
    'items', v_items,
    'comments', v_comments,
    'events', v_events
  );

  IF v_viagem.estado = 'em_recomendacao' THEN
    UPDATE viagens SET estado = 'em_aprovacao' WHERE id = v_viagem.id;
    INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
    VALUES (v_viagem.id, v_viagem.org_id, 'aberta', jsonb_build_object('at', now()));
    v_result := jsonb_set(v_result, '{estado}', '"em_aprovacao"');
  END IF;

  RETURN v_result;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.get_viagem_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_viagem_by_token(TEXT) TO authenticated;
