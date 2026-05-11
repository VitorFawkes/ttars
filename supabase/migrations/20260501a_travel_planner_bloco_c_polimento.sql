-- ============================================================
-- Travel Planner — Bloco C: polimento da experiência cliente
--
-- 1. get_viagem_by_token retorna telefone/email do TP/PV
--    → permite botão WhatsApp real no ContactCard
-- 2. Tabela trip_checklist_progress
--    → cliente marca "passaporte ok", "moeda ok" por passageiro
--    (lista fixa no frontend, só armazena progresso)
-- 3. Tabela trip_photos
--    → passageiro sobe foto durante a viagem; visível a todos
--    os passageiros daquela viagem; base do álbum permanente
-- 4. RPCs públicas para:
--    - marcar_checklist / desmarcar_checklist
--    - get_checklist (com agregado de progresso)
--    - compartilhar_foto / listar_fotos
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. get_viagem_by_token — adicionar telefone/email de TP/PV
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

  SELECT id, nome, avatar_url, email, phone INTO v_tp
  FROM profiles WHERE id = v_viagem.tp_owner_id;

  SELECT id, nome, avatar_url, email, phone INTO v_pv
  FROM profiles WHERE id = v_viagem.pos_owner_id;

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
      'id', v_tp.id, 'nome', v_tp.nome, 'avatar_url', v_tp.avatar_url,
      'email', v_tp.email, 'telefone', v_tp.phone
    ) ELSE NULL END,
    'pv', CASE WHEN v_pv IS NOT NULL THEN jsonb_build_object(
      'id', v_pv.id, 'nome', v_pv.nome, 'avatar_url', v_pv.avatar_url,
      'email', v_pv.email, 'telefone', v_pv.phone
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

-- ────────────────────────────────────────────────────────────
-- 2. trip_checklist_progress
--    Cada passageiro marca itens do checklist pré-embarque.
--    item_key é uma string curta definida pelo frontend
--    (ex: 'passaporte', 'moeda', 'seguro_viagem').
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_checklist_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id       UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  participant_id  UUID NOT NULL REFERENCES public.trip_participants(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES public.organizations(id),
  item_key        TEXT NOT NULL,
  checked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (viagem_id, participant_id, item_key)
);

ALTER TABLE public.trip_checklist_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_checklist_progress_org_all ON public.trip_checklist_progress;
CREATE POLICY trip_checklist_progress_org_all ON public.trip_checklist_progress
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS trip_checklist_progress_service_all ON public.trip_checklist_progress;
CREATE POLICY trip_checklist_progress_service_all ON public.trip_checklist_progress
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.auto_set_trip_checklist_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_org UUID;
BEGIN
  SELECT org_id INTO v_org FROM viagens WHERE id = NEW.viagem_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Viagem % não encontrada', NEW.viagem_id;
  END IF;
  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_org;
  ELSIF NEW.org_id <> v_org THEN
    RAISE EXCEPTION 'org_id não bate com viagem';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_trip_checklist_org ON public.trip_checklist_progress;
CREATE TRIGGER trg_trip_checklist_org
  BEFORE INSERT OR UPDATE ON public.trip_checklist_progress
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_trip_checklist_org();

-- ────────────────────────────────────────────────────────────
-- 3. trip_photos
--    Foto que o passageiro sobe durante a viagem. Pública entre
--    passageiros da mesma viagem. Base do álbum permanente.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trip_photos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id       UUID NOT NULL REFERENCES public.viagens(id) ON DELETE CASCADE,
  participant_id  UUID REFERENCES public.trip_participants(id) ON DELETE SET NULL,
  org_id          UUID NOT NULL REFERENCES public.organizations(id),
  file_url        TEXT NOT NULL,
  caption         TEXT,
  width           INT,
  height          INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_photos_viagem
  ON public.trip_photos (viagem_id, created_at DESC);

ALTER TABLE public.trip_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trip_photos_org_all ON public.trip_photos;
CREATE POLICY trip_photos_org_all ON public.trip_photos
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS trip_photos_service_all ON public.trip_photos;
CREATE POLICY trip_photos_service_all ON public.trip_photos
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.auto_set_trip_photos_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE v_org UUID;
BEGIN
  SELECT org_id INTO v_org FROM viagens WHERE id = NEW.viagem_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Viagem % não encontrada', NEW.viagem_id;
  END IF;
  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_org;
  ELSIF NEW.org_id <> v_org THEN
    RAISE EXCEPTION 'org_id não bate com viagem';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_trip_photos_org ON public.trip_photos;
CREATE TRIGGER trg_trip_photos_org
  BEFORE INSERT OR UPDATE ON public.trip_photos
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_trip_photos_org();

-- ────────────────────────────────────────────────────────────
-- 4. RPC marcar_checklist: cliente identificado marca ou desmarca
--    Upsert: se já existe, mantém; se toggle=true e existe, remove.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.marcar_checklist(
  p_token           TEXT,
  p_participant_id  UUID,
  p_item_key        TEXT,
  p_checked         BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_part_ok UUID;
BEGIN
  SELECT id, org_id INTO v_viagem FROM viagens WHERE public_token = p_token;
  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id INTO v_part_ok FROM trip_participants
  WHERE id = p_participant_id AND viagem_id = v_viagem.id;
  IF v_part_ok IS NULL THEN
    RAISE EXCEPTION 'Passageiro não pertence a esta viagem' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_checked THEN
    INSERT INTO trip_checklist_progress (viagem_id, participant_id, org_id, item_key)
    VALUES (v_viagem.id, p_participant_id, v_viagem.org_id, p_item_key)
    ON CONFLICT (viagem_id, participant_id, item_key) DO UPDATE
      SET checked_at = now();
  ELSE
    DELETE FROM trip_checklist_progress
    WHERE viagem_id = v_viagem.id
      AND participant_id = p_participant_id
      AND item_key = p_item_key;
  END IF;

  RETURN jsonb_build_object('ok', true, 'checked', p_checked);
END
$fn$;

GRANT EXECUTE ON FUNCTION public.marcar_checklist(TEXT, UUID, TEXT, BOOLEAN) TO anon;
GRANT EXECUTE ON FUNCTION public.marcar_checklist(TEXT, UUID, TEXT, BOOLEAN) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. RPC get_checklist: retorna progresso do passageiro atual + agregado
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_checklist(
  p_token           TEXT,
  p_participant_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_meu JSONB;
  v_total JSONB;
BEGIN
  SELECT id INTO v_viagem FROM viagens WHERE public_token = p_token;
  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Itens que o passageiro atual marcou
  SELECT COALESCE(jsonb_agg(item_key), '[]'::jsonb) INTO v_meu
  FROM trip_checklist_progress
  WHERE viagem_id = v_viagem.id AND participant_id = p_participant_id;

  -- Agregado: quantos passageiros marcaram cada item
  SELECT COALESCE(jsonb_object_agg(item_key, qtd), '{}'::jsonb) INTO v_total
  FROM (
    SELECT item_key, COUNT(DISTINCT participant_id) AS qtd
    FROM trip_checklist_progress
    WHERE viagem_id = v_viagem.id
    GROUP BY item_key
  ) t;

  RETURN jsonb_build_object(
    'meu', v_meu,
    'agregado', v_total
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.get_checklist(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_checklist(TEXT, UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. RPC compartilhar_foto: passageiro sobe foto no álbum
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compartilhar_foto(
  p_token           TEXT,
  p_participant_id  UUID,
  p_file_url        TEXT,
  p_caption         TEXT DEFAULT NULL,
  p_width           INT DEFAULT NULL,
  p_height          INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_part_ok UUID;
  v_photo_id UUID;
BEGIN
  SELECT id, org_id INTO v_viagem FROM viagens WHERE public_token = p_token;
  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id INTO v_part_ok FROM trip_participants
  WHERE id = p_participant_id AND viagem_id = v_viagem.id;
  IF v_part_ok IS NULL THEN
    RAISE EXCEPTION 'Passageiro não pertence a esta viagem' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_file_url IS NULL OR TRIM(p_file_url) = '' THEN
    RAISE EXCEPTION 'URL da foto é obrigatória' USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO trip_photos (viagem_id, participant_id, org_id, file_url, caption, width, height)
  VALUES (v_viagem.id, p_participant_id, v_viagem.org_id, p_file_url, NULLIF(TRIM(COALESCE(p_caption, '')), ''), p_width, p_height)
  RETURNING id INTO v_photo_id;

  INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
  VALUES (v_viagem.id, v_viagem.org_id, 'foto_compartilhada',
    jsonb_build_object('photo_id', v_photo_id, 'participant_id', p_participant_id));

  RETURN jsonb_build_object('ok', true, 'photo_id', v_photo_id);
END
$fn$;

GRANT EXECUTE ON FUNCTION public.compartilhar_foto(TEXT, UUID, TEXT, TEXT, INT, INT) TO anon;
GRANT EXECUTE ON FUNCTION public.compartilhar_foto(TEXT, UUID, TEXT, TEXT, INT, INT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 7. RPC listar_fotos: todos passageiros veem o álbum
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.listar_fotos(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_fotos JSONB;
BEGIN
  SELECT id INTO v_viagem FROM viagens WHERE public_token = p_token;
  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'file_url', f.file_url,
      'caption', f.caption,
      'width', f.width,
      'height', f.height,
      'created_at', f.created_at,
      'autor_id', f.participant_id,
      'autor_nome', p.nome,
      'autor_relacao', p.relacao
    ) ORDER BY f.created_at DESC
  ), '[]'::jsonb)
  INTO v_fotos
  FROM trip_photos f
  LEFT JOIN trip_participants p ON p.id = f.participant_id
  WHERE f.viagem_id = v_viagem.id;

  RETURN v_fotos;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.listar_fotos(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.listar_fotos(TEXT) TO authenticated;
