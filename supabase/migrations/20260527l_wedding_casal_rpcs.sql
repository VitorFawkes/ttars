-- Feature: Lista de Convidados — RPCs (Marco 1.4)
--
-- RPCs SECURITY DEFINER usadas em dois contextos:
--
-- A) Públicas (chamadas pelo edge function `wedding-lista-publica` usando
--    service_role). Recebem `p_codigo` como token. Bypassam RLS via SECURITY
--    DEFINER e validam acesso pelo código. Atualizam ultima_edicao_casal_em.
--
-- B) Admin (chamadas via supabase-js autenticado). Respeitam org_id do JWT.
--
-- Todas as funções têm prefixo `wedding_casal_*` (públicas) ou
-- `wedding_casal_admin_*` (admin) para clareza.

BEGIN;

-- ========================================================================
-- HELPERS internos
-- ========================================================================

-- Tira o casal pelo código. Falha se não existir ou estiver encerrado.
CREATE OR REPLACE FUNCTION public._wedding_casal_by_codigo(p_codigo TEXT)
RETURNS public.wedding_casais
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_casal public.wedding_casais;
BEGIN
  SELECT * INTO v_casal FROM public.wedding_casais WHERE codigo = p_codigo;
  IF v_casal.id IS NULL THEN
    RAISE EXCEPTION 'Casal não encontrado para código %', p_codigo
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_casal.encerrado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Acesso encerrado para código %', p_codigo
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_casal;
END
$fn$;

-- Marca última edição do casal (atualiza ultima_edicao_casal_em).
CREATE OR REPLACE FUNCTION public._wedding_casal_touch(p_casal_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  UPDATE public.wedding_casais
  SET ultima_edicao_casal_em = now()
  WHERE id = p_casal_id;
END
$fn$;

-- ========================================================================
-- PÚBLICAS — chamadas pelo edge function com p_codigo
-- ========================================================================

-- GET — retorna casal + convites + pessoas (resolved) como JSONB.
CREATE OR REPLACE FUNCTION public.wedding_casal_get_by_codigo(p_codigo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_casal public.wedding_casais;
  v_result JSONB;
BEGIN
  v_casal := public._wedding_casal_by_codigo(p_codigo);

  SELECT jsonb_build_object(
    'casal', jsonb_build_object(
      'id', v_casal.id,
      'codigo', v_casal.codigo,
      'nome_casal', v_casal.nome_casal,
      'whatsapp_digits', v_casal.whatsapp_digits,
      'card_id', v_casal.card_id,
      'criado_em', v_casal.criado_em,
      'ultima_edicao_casal_em', v_casal.ultima_edicao_casal_em
    ),
    'convites', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', cv.id,
        'nome', cv.nome,
        'posicao', cv.posicao,
        'pessoas', cv.pessoas
      ) ORDER BY cv.posicao
    ) FILTER (WHERE cv.id IS NOT NULL), '[]'::jsonb)
  ) INTO v_result
  FROM (
    SELECT
      c.id,
      c.nome,
      c.posicao,
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', g.id,
              'nome_raw', g.nome_raw,
              'telefone_raw', g.telefone_raw,
              'email_raw', g.email_raw,
              'faixa', g.faixa,
              'lado', g.lado,
              'tipo', g.tipo,
              'observacoes', g.observacoes,
              'posicao', g.posicao,
              'status_rsvp', g.status_rsvp
            ) ORDER BY g.posicao, g.created_at
          )
          FROM public.wedding_guests g
          WHERE g.convite_id = c.id
        ),
        '[]'::jsonb
      ) AS pessoas
    FROM public.wedding_convites c
    WHERE c.casal_id = v_casal.id
  ) cv;

  RETURN v_result;
END
$fn$;

-- UPSERT convite — cria ou atualiza nome/posicao.
CREATE OR REPLACE FUNCTION public.wedding_casal_upsert_convite(
  p_codigo TEXT,
  p_convite_id UUID,
  p_nome TEXT,
  p_posicao INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_casal public.wedding_casais;
  v_id UUID;
BEGIN
  v_casal := public._wedding_casal_by_codigo(p_codigo);

  IF p_convite_id IS NULL THEN
    INSERT INTO public.wedding_convites (casal_id, nome, posicao, org_id)
    VALUES (v_casal.id, COALESCE(p_nome, 'Convite sem nome'), COALESCE(p_posicao, 0), v_casal.org_id)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.wedding_convites
    SET nome = COALESCE(p_nome, nome),
        posicao = COALESCE(p_posicao, posicao)
    WHERE id = p_convite_id AND casal_id = v_casal.id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Convite % não encontrado para casal', p_convite_id
        USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  PERFORM public._wedding_casal_touch(v_casal.id);
  RETURN v_id;
END
$fn$;

-- DELETE convite
CREATE OR REPLACE FUNCTION public.wedding_casal_delete_convite(
  p_codigo TEXT,
  p_convite_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_casal public.wedding_casais;
  v_deleted INTEGER;
BEGIN
  v_casal := public._wedding_casal_by_codigo(p_codigo);
  DELETE FROM public.wedding_convites
  WHERE id = p_convite_id AND casal_id = v_casal.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    RETURN false;
  END IF;
  PERFORM public._wedding_casal_touch(v_casal.id);
  RETURN true;
END
$fn$;

-- REORDER convites — recebe array de UUIDs na nova ordem.
CREATE OR REPLACE FUNCTION public.wedding_casal_reorder_convites(
  p_codigo TEXT,
  p_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_casal public.wedding_casais;
  i INTEGER;
BEGIN
  v_casal := public._wedding_casal_by_codigo(p_codigo);
  FOR i IN 1..array_length(p_ids, 1) LOOP
    UPDATE public.wedding_convites
    SET posicao = i - 1
    WHERE id = p_ids[i] AND casal_id = v_casal.id;
  END LOOP;
  PERFORM public._wedding_casal_touch(v_casal.id);
END
$fn$;

-- UPSERT pessoa
CREATE OR REPLACE FUNCTION public.wedding_casal_upsert_pessoa(
  p_codigo TEXT,
  p_convite_id UUID,
  p_guest_id UUID,
  p_nome TEXT,
  p_telefone TEXT,
  p_email TEXT,
  p_faixa TEXT,
  p_lado TEXT,
  p_tipo TEXT,
  p_observacoes TEXT,
  p_posicao INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_casal public.wedding_casais;
  v_convite_exists BOOLEAN;
  v_id UUID;
BEGIN
  v_casal := public._wedding_casal_by_codigo(p_codigo);

  -- Valida que o convite pertence ao casal
  SELECT EXISTS(
    SELECT 1 FROM public.wedding_convites
    WHERE id = p_convite_id AND casal_id = v_casal.id
  ) INTO v_convite_exists;
  IF NOT v_convite_exists THEN
    RAISE EXCEPTION 'Convite % não pertence ao casal', p_convite_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF p_guest_id IS NULL THEN
    INSERT INTO public.wedding_guests (
      casal_id, convite_id, card_id,
      nome_raw, telefone_raw, email_raw,
      faixa, lado, tipo, observacoes, posicao,
      org_id
    )
    VALUES (
      v_casal.id, p_convite_id, v_casal.card_id,
      NULLIF(p_nome, ''), NULLIF(p_telefone, ''), NULLIF(p_email, ''),
      COALESCE(p_faixa, 'adulto'),
      NULLIF(p_lado, ''),
      NULLIF(p_tipo, ''),
      NULLIF(p_observacoes, ''),
      COALESCE(p_posicao, 0),
      v_casal.org_id
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.wedding_guests
    SET nome_raw = COALESCE(NULLIF(p_nome, ''), nome_raw),
        telefone_raw = CASE WHEN p_telefone IS NULL THEN telefone_raw ELSE NULLIF(p_telefone, '') END,
        email_raw = CASE WHEN p_email IS NULL THEN email_raw ELSE NULLIF(p_email, '') END,
        faixa = COALESCE(p_faixa, faixa),
        lado = CASE WHEN p_lado IS NULL THEN lado ELSE NULLIF(p_lado, '') END,
        tipo = CASE WHEN p_tipo IS NULL THEN tipo ELSE NULLIF(p_tipo, '') END,
        observacoes = CASE WHEN p_observacoes IS NULL THEN observacoes ELSE NULLIF(p_observacoes, '') END,
        posicao = COALESCE(p_posicao, posicao),
        convite_id = COALESCE(p_convite_id, convite_id),
        updated_at = now()
    WHERE id = p_guest_id AND casal_id = v_casal.id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Pessoa % não encontrada para casal', p_guest_id
        USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  PERFORM public._wedding_casal_touch(v_casal.id);
  RETURN v_id;
END
$fn$;

-- DELETE pessoa
CREATE OR REPLACE FUNCTION public.wedding_casal_delete_pessoa(
  p_codigo TEXT,
  p_guest_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_casal public.wedding_casais;
  v_deleted INTEGER;
BEGIN
  v_casal := public._wedding_casal_by_codigo(p_codigo);
  DELETE FROM public.wedding_guests
  WHERE id = p_guest_id AND casal_id = v_casal.id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RETURN false; END IF;
  PERFORM public._wedding_casal_touch(v_casal.id);
  RETURN true;
END
$fn$;

-- ========================================================================
-- ADMIN — autenticadas (respeitam org_id do JWT via RLS)
-- ========================================================================

-- Lista casais da org com counts agregados
CREATE OR REPLACE FUNCTION public.wedding_casal_admin_list()
RETURNS TABLE (
  id UUID,
  codigo TEXT,
  nome_casal TEXT,
  whatsapp_digits TEXT,
  card_id UUID,
  card_titulo TEXT,
  criado_em TIMESTAMPTZ,
  ultima_edicao_casal_em TIMESTAMPTZ,
  encerrado_em TIMESTAMPTZ,
  total_convites INTEGER,
  total_pessoas INTEGER,
  pessoas_sem_telefone INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.codigo,
    c.nome_casal,
    c.whatsapp_digits,
    c.card_id,
    cd.titulo AS card_titulo,
    c.criado_em,
    c.ultima_edicao_casal_em,
    c.encerrado_em,
    COALESCE(cnt.total_convites, 0)::INTEGER AS total_convites,
    COALESCE(cnt.total_pessoas, 0)::INTEGER AS total_pessoas,
    COALESCE(cnt.pessoas_sem_telefone, 0)::INTEGER AS pessoas_sem_telefone
  FROM public.wedding_casais c
  LEFT JOIN public.cards cd ON cd.id = c.card_id
  LEFT JOIN LATERAL (
    SELECT
      (SELECT COUNT(*) FROM public.wedding_convites WHERE casal_id = c.id) AS total_convites,
      (SELECT COUNT(*) FROM public.wedding_guests WHERE casal_id = c.id) AS total_pessoas,
      (SELECT COUNT(*) FROM public.wedding_guests
        WHERE casal_id = c.id
          AND faixa IN ('adulto','idoso')
          AND COALESCE(telefone_raw, '') = ''
      ) AS pessoas_sem_telefone
  ) cnt ON true
  WHERE c.org_id = v_org
  ORDER BY c.criado_em DESC;
END
$fn$;

-- Cria casal (admin)
CREATE OR REPLACE FUNCTION public.wedding_casal_admin_create(
  p_nome_casal TEXT,
  p_whatsapp_digits TEXT,
  p_codigo TEXT,
  p_card_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_id UUID;
  v_org UUID := requesting_org_id();
  v_user UUID := auth.uid();
  v_card_org UUID;
BEGIN
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Sem org_id no JWT';
  END IF;

  -- Se card_id veio, valida org
  IF p_card_id IS NOT NULL THEN
    SELECT org_id INTO v_card_org FROM public.cards WHERE id = p_card_id;
    IF v_card_org IS NULL THEN
      RAISE EXCEPTION 'card_id % não encontrado', p_card_id;
    END IF;
    IF v_card_org <> v_org THEN
      RAISE EXCEPTION 'card_id % é de outra org', p_card_id;
    END IF;
  END IF;

  INSERT INTO public.wedding_casais (
    codigo, nome_casal, whatsapp_digits, card_id,
    org_id, criado_por
  ) VALUES (
    UPPER(p_codigo), p_nome_casal, p_whatsapp_digits, p_card_id,
    v_org, v_user
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$fn$;

-- Vincula casal a um card WEDDING
CREATE OR REPLACE FUNCTION public.wedding_casal_admin_vincular_card(
  p_casal_id UUID,
  p_card_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org UUID := requesting_org_id();
  v_card_org UUID;
BEGIN
  SELECT org_id INTO v_card_org FROM public.cards WHERE id = p_card_id;
  IF v_card_org IS NULL OR v_card_org <> v_org THEN
    RAISE EXCEPTION 'card_id % inválido para sua org', p_card_id;
  END IF;

  UPDATE public.wedding_casais
  SET card_id = p_card_id
  WHERE id = p_casal_id AND org_id = v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'casal_id % não encontrado na sua org', p_casal_id;
  END IF;

  -- Trigger trg_wedding_casais_propagate_card propaga pra convites + guests
END
$fn$;

-- Desvincula casal de card
CREATE OR REPLACE FUNCTION public.wedding_casal_admin_desvincular_card(
  p_casal_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  UPDATE public.wedding_casais
  SET card_id = NULL
  WHERE id = p_casal_id AND org_id = v_org;
END
$fn$;

-- Encerra (soft-delete) acesso pelo código
CREATE OR REPLACE FUNCTION public.wedding_casal_admin_encerrar(
  p_casal_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  UPDATE public.wedding_casais
  SET encerrado_em = now()
  WHERE id = p_casal_id AND org_id = v_org;
END
$fn$;

-- Hard delete casal (e cascade pra convites/guests via FK)
CREATE OR REPLACE FUNCTION public.wedding_casal_admin_delete(
  p_casal_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  DELETE FROM public.wedding_casais
  WHERE id = p_casal_id AND org_id = v_org;
END
$fn$;

-- Atualiza nome / whatsapp
CREATE OR REPLACE FUNCTION public.wedding_casal_admin_update(
  p_casal_id UUID,
  p_nome_casal TEXT,
  p_whatsapp_digits TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  UPDATE public.wedding_casais
  SET
    nome_casal = COALESCE(p_nome_casal, nome_casal),
    whatsapp_digits = COALESCE(p_whatsapp_digits, whatsapp_digits)
  WHERE id = p_casal_id AND org_id = v_org;
END
$fn$;

-- Lista cards WEDDING da org SEM casal vinculado (pra picker do Vincular)
CREATE OR REPLACE FUNCTION public.wedding_casal_admin_cards_disponiveis()
RETURNS TABLE (id UUID, titulo TEXT, wedding_date DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN QUERY
  SELECT c.id, c.titulo, NULLIF(c.produto_data->>'data_viagem_inicio', '')::DATE AS wedding_date
  FROM public.cards c
  WHERE c.org_id = v_org
    AND c.produto = 'WEDDING'
    AND NOT EXISTS (
      SELECT 1 FROM public.wedding_casais wc
      WHERE wc.card_id = c.id AND wc.encerrado_em IS NULL
    )
  ORDER BY c.titulo;
END
$fn$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.wedding_casal_get_by_codigo(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.wedding_casal_upsert_convite(TEXT, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.wedding_casal_delete_convite(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.wedding_casal_reorder_convites(TEXT, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.wedding_casal_upsert_pessoa(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.wedding_casal_delete_pessoa(TEXT, UUID) TO service_role;

GRANT EXECUTE ON FUNCTION public.wedding_casal_admin_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_casal_admin_create(TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_casal_admin_vincular_card(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_casal_admin_desvincular_card(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_casal_admin_encerrar(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_casal_admin_delete(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_casal_admin_update(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wedding_casal_admin_cards_disponiveis() TO authenticated;

COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='wedding_casal_get_by_codigo') THEN
    RAISE EXCEPTION 'RPC wedding_casal_get_by_codigo não criada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='wedding_casal_admin_list') THEN
    RAISE EXCEPTION 'RPC wedding_casal_admin_list não criada';
  END IF;
  RAISE NOTICE 'Wedding casal RPCs OK';
END $$;
