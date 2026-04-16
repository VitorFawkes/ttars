-- ============================================================
-- Marco 1 — Travel Planner: RPCs Públicas (SECURITY DEFINER)
-- Acessíveis por anon via public_token (cliente sem JWT)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. get_viagem_by_token — leitura completa para o cliente
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
  -- Buscar viagem
  SELECT * INTO v_viagem
  FROM viagens
  WHERE public_token = p_token;

  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Buscar TP owner (nome e foto para exibir ao cliente)
  SELECT id, nome, avatar_url INTO v_tp
  FROM profiles
  WHERE id = v_viagem.tp_owner_id;

  -- Buscar PV owner
  SELECT id, nome, avatar_url INTO v_pv
  FROM profiles
  WHERE id = v_viagem.pos_owner_id;

  -- Itens: exclui rascunho, ordena por parent/ordem
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

  -- Comentários: exclui internos
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'item_id', c.item_id,
      'autor', c.autor,
      'texto', c.texto,
      'created_at', c.created_at
    ) ORDER BY c.created_at
  ), '[]'::jsonb)
  INTO v_comments
  FROM trip_comments c
  WHERE c.viagem_id = v_viagem.id
    AND c.interno = false;

  -- Eventos
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'tipo', e.tipo,
      'payload', e.payload,
      'created_at', e.created_at
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

  -- Registrar evento de abertura (primeira vez)
  IF v_viagem.estado = 'em_recomendacao' THEN
    UPDATE viagens SET estado = 'em_aprovacao' WHERE id = v_viagem.id;
    INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
    VALUES (v_viagem.id, v_viagem.org_id, 'aberta', jsonb_build_object('at', now()));
    v_result := jsonb_set(v_result, '{estado}', '"em_aprovacao"');
  END IF;

  RETURN v_result;
END
$fn$;

-- Permitir acesso anon
GRANT EXECUTE ON FUNCTION public.get_viagem_by_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.get_viagem_by_token(TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. aprovar_item — cliente aprova um item
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aprovar_item(p_token TEXT, p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_item RECORD;
  v_result JSONB;
BEGIN
  -- Validar token
  SELECT id, org_id, estado INTO v_viagem
  FROM viagens
  WHERE public_token = p_token;

  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Viagem deve estar em fase de aprovação
  IF v_viagem.estado NOT IN ('em_recomendacao', 'em_aprovacao') THEN
    RAISE EXCEPTION 'Viagem não está em fase de aprovação (estado: %)', v_viagem.estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Buscar item
  SELECT * INTO v_item
  FROM trip_items
  WHERE id = p_item_id AND viagem_id = v_viagem.id AND deleted_at IS NULL;

  IF v_item IS NULL THEN
    RAISE EXCEPTION 'Item não encontrado nesta viagem'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Status deve ser 'proposto'
  IF v_item.status <> 'proposto' THEN
    RAISE EXCEPTION 'Item não está em status proposto (status: %)', v_item.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Aprovar
  UPDATE trip_items
  SET status = 'aprovado',
      aprovado_em = now(),
      aprovado_por = 'client'
  WHERE id = p_item_id;

  -- Evento
  INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
  VALUES (v_viagem.id, v_viagem.org_id, 'item_aprovado',
    jsonb_build_object('item_id', p_item_id, 'tipo', v_item.tipo::text));

  -- Retornar item atualizado
  SELECT jsonb_build_object(
    'id', id, 'status', status::text, 'aprovado_em', aprovado_em, 'aprovado_por', aprovado_por
  )
  INTO v_result
  FROM trip_items WHERE id = p_item_id;

  RETURN v_result;
END
$fn$;

GRANT EXECUTE ON FUNCTION public.aprovar_item(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.aprovar_item(TEXT, UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. escolher_alternativa — cliente escolhe entre opções
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.escolher_alternativa(
  p_token TEXT,
  p_item_id UUID,
  p_alternativa_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_item RECORD;
  v_alts JSONB;
  v_found BOOLEAN := false;
  v_new_alts JSONB := '[]'::jsonb;
  alt JSONB;
  i INT;
BEGIN
  -- Validar token
  SELECT id, org_id, estado INTO v_viagem
  FROM viagens WHERE public_token = p_token;

  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_viagem.estado NOT IN ('em_recomendacao', 'em_aprovacao') THEN
    RAISE EXCEPTION 'Viagem não está em fase de aprovação' USING ERRCODE = 'check_violation';
  END IF;

  -- Buscar item
  SELECT * INTO v_item
  FROM trip_items
  WHERE id = p_item_id AND viagem_id = v_viagem.id AND deleted_at IS NULL;

  IF v_item IS NULL THEN
    RAISE EXCEPTION 'Item não encontrado' USING ERRCODE = 'no_data_found';
  END IF;

  v_alts := v_item.alternativas;

  -- Marcar alternativa escolhida
  FOR i IN 0..jsonb_array_length(v_alts) - 1 LOOP
    alt := v_alts->i;
    IF alt->>'id' = p_alternativa_id THEN
      alt := jsonb_set(alt, '{escolhido_em}', to_jsonb(now()));
      v_found := true;
    ELSE
      -- Limpar escolhas anteriores
      alt := alt - 'escolhido_em';
    END IF;
    v_new_alts := v_new_alts || jsonb_build_array(alt);
  END LOOP;

  IF NOT v_found THEN
    RAISE EXCEPTION 'Alternativa % não encontrada no item', p_alternativa_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE trip_items
  SET alternativas = v_new_alts
  WHERE id = p_item_id;

  -- Evento
  INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
  VALUES (v_viagem.id, v_viagem.org_id, 'item_escolhido',
    jsonb_build_object('item_id', p_item_id, 'alternativa_id', p_alternativa_id));

  RETURN jsonb_build_object('item_id', p_item_id, 'alternativas', v_new_alts);
END
$fn$;

GRANT EXECUTE ON FUNCTION public.escolher_alternativa(TEXT, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.escolher_alternativa(TEXT, UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. comentar_item — cliente comenta em item ou viagem
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.comentar_item(
  p_token TEXT,
  p_item_id UUID,  -- NULL = comentário na viagem inteira
  p_texto TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_comment_id UUID;
BEGIN
  -- Validar token
  SELECT id, org_id INTO v_viagem
  FROM viagens WHERE public_token = p_token;

  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  -- Se item_id fornecido, validar que pertence à viagem
  IF p_item_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM trip_items
      WHERE id = p_item_id AND viagem_id = v_viagem.id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Item não encontrado nesta viagem' USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- Inserir comentário
  INSERT INTO trip_comments (viagem_id, item_id, org_id, autor, texto, interno)
  VALUES (v_viagem.id, p_item_id, v_viagem.org_id, 'client', p_texto, false)
  RETURNING id INTO v_comment_id;

  -- Evento
  INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
  VALUES (v_viagem.id, v_viagem.org_id, 'comentario_cliente',
    jsonb_build_object('comment_id', v_comment_id, 'item_id', p_item_id));

  RETURN jsonb_build_object(
    'id', v_comment_id,
    'viagem_id', v_viagem.id,
    'item_id', p_item_id,
    'autor', 'client',
    'texto', p_texto,
    'created_at', now()
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.comentar_item(TEXT, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.comentar_item(TEXT, UUID, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. confirmar_viagem — cliente confirma a viagem (handoff TP → PV)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirmar_viagem(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
BEGIN
  SELECT * INTO v_viagem
  FROM viagens WHERE public_token = p_token;

  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_viagem.estado NOT IN ('em_aprovacao', 'em_recomendacao') THEN
    RAISE EXCEPTION 'Viagem não pode ser confirmada neste estado (%)', v_viagem.estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Confirmar
  UPDATE viagens
  SET estado = 'confirmada',
      confirmada_em = now()
  WHERE id = v_viagem.id;

  -- Aprovar automaticamente todos itens propostos
  UPDATE trip_items
  SET status = 'aprovado',
      aprovado_em = now(),
      aprovado_por = 'client'
  WHERE viagem_id = v_viagem.id
    AND status = 'proposto'
    AND deleted_at IS NULL;

  -- Evento
  INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
  VALUES (v_viagem.id, v_viagem.org_id, 'viagem_confirmada',
    jsonb_build_object('confirmada_em', now()));

  RETURN jsonb_build_object(
    'id', v_viagem.id,
    'estado', 'confirmada',
    'confirmada_em', now()
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.confirmar_viagem(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.confirmar_viagem(TEXT) TO authenticated;
