-- ============================================================
-- Travel Planner — Marco 2B: Envio ao cliente + NPS
--
-- 1. Colunas de NPS em viagens
-- 2. RPC enviar_viagem_ao_cliente(viagem_id) — TP/PV autenticado
--    - Valida org, estado 'desenho' ou 'em_recomendacao'
--    - Promove itens 'rascunho' → 'proposto'
--    - Muda viagem para 'em_recomendacao'
--    - Registra enviada_em + evento 'enviada'
-- 3. RPC registrar_nps(token, nota, comentario) — cliente anônimo
--    - Valida estado em pos_viagem/concluida
--    - Grava em viagens + trip_events
--    - Idempotente (sobrescreve resposta anterior)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Colunas NPS
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.viagens
  ADD COLUMN IF NOT EXISTS nps_nota         INT CHECK (nps_nota BETWEEN 0 AND 10),
  ADD COLUMN IF NOT EXISTS nps_comentario   TEXT,
  ADD COLUMN IF NOT EXISTS nps_respondida_em TIMESTAMPTZ;

COMMENT ON COLUMN public.viagens.nps_nota IS 'NPS respondido pelo cliente ao fim da viagem (0-10)';

-- ────────────────────────────────────────────────────────────
-- 2. enviar_viagem_ao_cliente
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enviar_viagem_ao_cliente(p_viagem_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
  v_ctx_org UUID;
  v_promovidos INT;
BEGIN
  -- Contexto de org do caller (authenticated)
  v_ctx_org := requesting_org_id();
  IF v_ctx_org IS NULL THEN
    RAISE EXCEPTION 'Sessão sem org_id — login necessário'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Buscar viagem e validar org
  SELECT * INTO v_viagem
  FROM viagens
  WHERE id = p_viagem_id;

  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_viagem.org_id <> v_ctx_org THEN
    RAISE EXCEPTION 'Sem permissão para esta viagem'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Estado elegível
  IF v_viagem.estado NOT IN ('desenho', 'em_recomendacao') THEN
    RAISE EXCEPTION 'Viagem não pode ser enviada no estado atual (%)', v_viagem.estado
      USING ERRCODE = 'check_violation';
  END IF;

  -- Promover itens rascunho para proposto
  -- (dias ficam como rascunho, pois são agrupadores; só itens reais viram visíveis)
  UPDATE trip_items
  SET status = 'proposto'
  WHERE viagem_id = p_viagem_id
    AND status = 'rascunho'
    AND tipo <> 'dia'
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_promovidos = ROW_COUNT;

  -- Dias em rascunho: mantemos rascunho (pois o RPC público filtra rascunho).
  -- Promover dias para proposto para que virem visíveis ao cliente.
  UPDATE trip_items
  SET status = 'proposto'
  WHERE viagem_id = p_viagem_id
    AND status = 'rascunho'
    AND tipo = 'dia'
    AND deleted_at IS NULL;

  -- Mudar estado da viagem
  UPDATE viagens
  SET estado = 'em_recomendacao',
      enviada_em = COALESCE(enviada_em, now()),
      updated_at = now()
  WHERE id = p_viagem_id;

  -- Evento
  INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
  VALUES (
    p_viagem_id,
    v_viagem.org_id,
    'enviada',
    jsonb_build_object(
      'enviada_em', now(),
      'itens_promovidos', v_promovidos,
      'reenvio', v_viagem.enviada_em IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'id', p_viagem_id,
    'estado', 'em_recomendacao',
    'enviada_em', COALESCE(v_viagem.enviada_em, now()),
    'public_token', v_viagem.public_token,
    'itens_promovidos', v_promovidos
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.enviar_viagem_ao_cliente(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enviar_viagem_ao_cliente(UUID) TO authenticated;

COMMENT ON FUNCTION public.enviar_viagem_ao_cliente(UUID) IS
  'TP/PV envia a viagem ao cliente: promove itens rascunho e muda estado para em_recomendacao.';

-- ────────────────────────────────────────────────────────────
-- 3. registrar_nps
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_nps(
  p_token      TEXT,
  p_nota       INT,
  p_comentario TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_viagem RECORD;
BEGIN
  IF p_nota IS NULL OR p_nota < 0 OR p_nota > 10 THEN
    RAISE EXCEPTION 'Nota NPS inválida (deve ser 0-10)'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, org_id, estado, nps_respondida_em INTO v_viagem
  FROM viagens
  WHERE public_token = p_token;

  IF v_viagem IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_viagem.estado NOT IN ('pos_viagem', 'concluida') THEN
    RAISE EXCEPTION 'NPS só pode ser respondido após a viagem (estado atual: %)', v_viagem.estado
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE viagens
  SET nps_nota = p_nota,
      nps_comentario = NULLIF(TRIM(COALESCE(p_comentario, '')), ''),
      nps_respondida_em = now(),
      updated_at = now()
  WHERE id = v_viagem.id;

  INSERT INTO trip_events (viagem_id, org_id, tipo, payload)
  VALUES (
    v_viagem.id,
    v_viagem.org_id,
    'nps_respondido',
    jsonb_build_object(
      'nota', p_nota,
      'comentario', NULLIF(TRIM(COALESCE(p_comentario, '')), ''),
      'reenvio', v_viagem.nps_respondida_em IS NOT NULL
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'nota', p_nota,
    'respondida_em', now()
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.registrar_nps(TEXT, INT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.registrar_nps(TEXT, INT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.registrar_nps(TEXT, INT, TEXT) IS
  'Cliente registra NPS após viagem (pos_viagem/concluida). Idempotente — sobrescreve resposta anterior.';
