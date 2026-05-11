-- ============================================================
-- Hotfix: get_viagem_by_token retorna tp/pv = null quando o profile
-- existe mas tem algum campo nulo (ex: avatar_url).
--
-- Causa: a cláusula `CASE WHEN v_tp IS NOT NULL` num RECORD PostgreSQL
-- só é true se TODOS os campos do record são não-nulos. Basta um
-- avatar_url NULL e o objeto tp inteiro vira null no JSON, escondendo
-- os contatos do time do cliente.
--
-- Fix: checar v_tp.id IS NOT NULL (id vem do SELECT e é sempre non-null
-- se o profile foi encontrado).
-- ============================================================

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
    -- FIX: usar v_tp.id IS NOT NULL em vez de v_tp IS NOT NULL
    'tp', CASE WHEN v_tp.id IS NOT NULL THEN jsonb_build_object(
      'id', v_tp.id, 'nome', v_tp.nome, 'avatar_url', v_tp.avatar_url,
      'email', v_tp.email, 'telefone', v_tp.phone
    ) ELSE NULL END,
    'pv', CASE WHEN v_pv.id IS NOT NULL THEN jsonb_build_object(
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
