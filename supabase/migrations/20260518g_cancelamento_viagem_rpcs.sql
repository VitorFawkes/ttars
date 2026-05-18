-- ============================================================
-- Cancelamento de Viagem Pós-Aceite — RPCs
-- ============================================================
-- RPCs públicas chamadas pelo frontend (TP e PV).
-- SECURITY DEFINER + validação explícita de org_id = requesting_org_id().
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. abrir_cancelamento — TP/PV abre modo cancelamento
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION abrir_cancelamento(
  p_viagem_id UUID,
  p_modo TEXT,
  p_motivo_id UUID DEFAULT NULL,
  p_obs TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_viagem    viagens%ROWTYPE;
  v_motivo    motivos_cancelamento%ROWTYPE;
  v_user_id   uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_modo NOT IN ('total', 'parcial', 'mudanca_brusca') THEN
    RAISE EXCEPTION 'Modo de cancelamento inválido: %', p_modo USING ERRCODE = 'check_violation';
  END IF;

  -- Carregar viagem, validar org
  SELECT * INTO v_viagem FROM viagens WHERE id = p_viagem_id;
  IF v_viagem.id IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_viagem.org_id <> requesting_org_id() THEN
    RAISE EXCEPTION 'Acesso negado à viagem' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_viagem.modo_cancelamento IS NOT NULL AND v_viagem.cancelamento_concluido_em IS NULL THEN
    RAISE EXCEPTION 'Já existe cancelamento em curso para esta viagem' USING ERRCODE = 'unique_violation';
  END IF;

  -- Motivo (opcional, mas se vier deve ser da mesma org)
  IF p_motivo_id IS NOT NULL THEN
    SELECT * INTO v_motivo FROM motivos_cancelamento WHERE id = p_motivo_id;
    IF v_motivo.id IS NULL THEN
      RAISE EXCEPTION 'Motivo de cancelamento não encontrado' USING ERRCODE = 'no_data_found';
    END IF;
    IF v_motivo.org_id <> requesting_org_id() THEN
      RAISE EXCEPTION 'Motivo de outra org' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_motivo.escopo NOT IN ('qualquer', CASE p_modo
                                              WHEN 'total' THEN 'total'
                                              WHEN 'parcial' THEN 'parcial'
                                              WHEN 'mudanca_brusca' THEN 'mudanca'
                                            END) THEN
      RAISE EXCEPTION 'Motivo % não é compatível com modo %', v_motivo.nome, p_modo USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Update viagem
  UPDATE viagens SET
    modo_cancelamento       = p_modo,
    motivo_cancelamento_id  = p_motivo_id,
    motivo_cancelamento_obs = p_obs,
    cancelamento_aberto_em  = now(),
    cancelamento_aberto_por = v_user_id,
    cancelamento_concluido_em = NULL,
    cancelamento_stage_anterior_id = NULL
  WHERE id = p_viagem_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'viagem_id', p_viagem_id,
    'modo', p_modo,
    'aberto_em', now(),
    'aberto_por', v_user_id
  );
END
$fn$;

COMMENT ON FUNCTION abrir_cancelamento IS
  'Abre modo cancelamento (total/parcial/mudanca_brusca) numa viagem. Valida org, motivo compatível, e que não há cancelamento em curso.';

GRANT EXECUTE ON FUNCTION abrir_cancelamento TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 2. cancelar_item_viagem — marca item específico como cancelado
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancelar_item_viagem(
  p_item_id UUID,
  p_motivo TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_item      trip_items%ROWTYPE;
  v_viagem    viagens%ROWTYPE;
  v_user_id   uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_item FROM trip_items WHERE id = p_item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Item não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_item.org_id <> requesting_org_id() THEN
    RAISE EXCEPTION 'Acesso negado ao item' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Viagem precisa estar em modo cancelamento ativo
  SELECT * INTO v_viagem FROM viagens WHERE id = v_item.viagem_id;
  IF v_viagem.modo_cancelamento IS NULL OR v_viagem.cancelamento_concluido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Viagem não está em modo cancelamento ativo' USING ERRCODE = 'check_violation';
  END IF;

  IF v_item.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Item já está cancelado' USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE trip_items SET
    cancelado_em      = now(),
    cancelado_por     = v_user_id,
    cancelado_motivo  = p_motivo,
    status            = 'arquivado',
    editado_por       = v_user_id,
    editado_por_papel = CASE
                          WHEN v_user_id = v_viagem.tp_owner_id THEN 'tp'
                          WHEN v_user_id = v_viagem.pos_owner_id THEN 'pv'
                          ELSE editado_por_papel
                        END
  WHERE id = p_item_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'item_id', p_item_id,
    'cancelado_em', now()
  );
END
$fn$;

COMMENT ON FUNCTION cancelar_item_viagem IS
  'Marca item da viagem como cancelado durante modo cancelamento ativo. Status do item vira arquivado. Trigger propaga para card_financial_items.';

GRANT EXECUTE ON FUNCTION cancelar_item_viagem TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 3. descancelar_item_viagem — desfaz cancelamento de item
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION descancelar_item_viagem(p_item_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_item      trip_items%ROWTYPE;
  v_viagem    viagens%ROWTYPE;
  v_user_id   uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_item FROM trip_items WHERE id = p_item_id;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Item não encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_item.org_id <> requesting_org_id() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_viagem FROM viagens WHERE id = v_item.viagem_id;
  IF v_viagem.modo_cancelamento IS NULL OR v_viagem.cancelamento_concluido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Viagem não está em modo cancelamento ativo' USING ERRCODE = 'check_violation';
  END IF;

  IF v_item.cancelado_em IS NULL THEN
    RAISE EXCEPTION 'Item não está cancelado' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE trip_items SET
    cancelado_em      = NULL,
    cancelado_por     = NULL,
    cancelado_motivo  = NULL,
    status            = 'aprovado',  -- volta ao estado pré-cancelamento padrão pós-aceite
    editado_por       = v_user_id,
    editado_por_papel = CASE
                          WHEN v_user_id = v_viagem.tp_owner_id THEN 'tp'
                          WHEN v_user_id = v_viagem.pos_owner_id THEN 'pv'
                          ELSE editado_por_papel
                        END
  WHERE id = p_item_id;

  -- Limpar data_cancelamento de card_financial_items que tinham archived_reason = cancelamento_viagem
  IF v_viagem.card_id IS NOT NULL THEN
    UPDATE card_financial_items
       SET data_cancelamento = NULL,
           archived_reason = NULL
     WHERE card_id = v_viagem.card_id
       AND archived_reason = 'cancelamento_viagem'
       AND (description ILIKE '%' || COALESCE(v_item.comercial->>'titulo', v_item.tipo::text) || '%');
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'item_id', p_item_id);
END
$fn$;

COMMENT ON FUNCTION descancelar_item_viagem IS
  'Reverte cancelamento de item durante modo ainda aberto. Status volta a aprovado. Reverte card_financial_items relacionados.';

GRANT EXECUTE ON FUNCTION descancelar_item_viagem TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. concluir_cancelamento — encerra o modo, se total move card
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION concluir_cancelamento(p_viagem_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_viagem            viagens%ROWTYPE;
  v_user_id           uuid := auth.uid();
  v_card              cards%ROWTYPE;
  v_stage_cancelada   uuid;
  v_stage_atual       uuid;
  v_pipeline_id       uuid;
  v_phase_id          uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_viagem FROM viagens WHERE id = p_viagem_id;
  IF v_viagem.id IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_viagem.org_id <> requesting_org_id() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_viagem.modo_cancelamento IS NULL THEN
    RAISE EXCEPTION 'Viagem não está em modo cancelamento' USING ERRCODE = 'check_violation';
  END IF;
  IF v_viagem.cancelamento_concluido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Cancelamento já concluído' USING ERRCODE = 'unique_violation';
  END IF;

  -- Se modo total, mover card para etapa terminal "Cancelada"
  IF v_viagem.modo_cancelamento = 'total' AND v_viagem.card_id IS NOT NULL THEN
    SELECT * INTO v_card FROM cards WHERE id = v_viagem.card_id;
    v_stage_atual := v_card.pipeline_stage_id;

    -- Achar pipeline e phase do stage atual
    SELECT pipeline_id, phase_id INTO v_pipeline_id, v_phase_id
      FROM pipeline_stages WHERE id = v_stage_atual;

    -- Achar etapa terminal "Cancelada" no mesmo pipeline+phase
    SELECT id INTO v_stage_cancelada
      FROM pipeline_stages
     WHERE pipeline_id = v_pipeline_id
       AND nome = 'Cancelada'
       AND is_terminal = true
     LIMIT 1;

    IF v_stage_cancelada IS NULL THEN
      RAISE EXCEPTION 'Etapa terminal Cancelada não encontrada no pipeline %. Crie via Pipeline Studio.', v_pipeline_id
        USING ERRCODE = 'no_data_found';
    END IF;

    -- Guarda stage anterior pra reabertura
    UPDATE viagens SET
      cancelamento_stage_anterior_id = v_stage_atual,
      cancelamento_concluido_em = now()
    WHERE id = p_viagem_id;

    -- Move card
    UPDATE cards SET
      pipeline_stage_id = v_stage_cancelada,
      updated_at = now()
    WHERE id = v_viagem.card_id;

  ELSE
    -- Parcial / mudanca_brusca: apenas marca concluído
    UPDATE viagens SET
      cancelamento_concluido_em = now()
    WHERE id = p_viagem_id;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'viagem_id', p_viagem_id,
    'modo', v_viagem.modo_cancelamento,
    'concluido_em', now(),
    'card_movido', v_viagem.modo_cancelamento = 'total'
  );
END
$fn$;

COMMENT ON FUNCTION concluir_cancelamento IS
  'Conclui o modo cancelamento. Se total, move card para etapa terminal Cancelada (preservando stage anterior).';

GRANT EXECUTE ON FUNCTION concluir_cancelamento TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. reabrir_cancelamento — reverte conclusão dentro de 30 dias
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION reabrir_cancelamento(p_viagem_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_viagem    viagens%ROWTYPE;
  v_user_id   uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_viagem FROM viagens WHERE id = p_viagem_id;
  IF v_viagem.id IS NULL THEN
    RAISE EXCEPTION 'Viagem não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_viagem.org_id <> requesting_org_id() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_viagem.cancelamento_concluido_em IS NULL THEN
    RAISE EXCEPTION 'Não há cancelamento concluído pra reabrir' USING ERRCODE = 'check_violation';
  END IF;
  IF v_viagem.cancelamento_concluido_em < now() - interval '30 days' THEN
    RAISE EXCEPTION 'Janela de reabertura (30 dias) expirada' USING ERRCODE = 'check_violation';
  END IF;

  -- Se total, mover card de volta pra etapa anterior
  IF v_viagem.modo_cancelamento = 'total'
     AND v_viagem.card_id IS NOT NULL
     AND v_viagem.cancelamento_stage_anterior_id IS NOT NULL
  THEN
    UPDATE cards SET
      pipeline_stage_id = v_viagem.cancelamento_stage_anterior_id,
      updated_at = now()
    WHERE id = v_viagem.card_id;
  END IF;

  UPDATE viagens SET
    cancelamento_concluido_em = NULL,
    cancelamento_stage_anterior_id = NULL
  WHERE id = p_viagem_id;

  RETURN jsonb_build_object(
    'status', 'ok',
    'viagem_id', p_viagem_id,
    'reaberto_em', now()
  );
END
$fn$;

COMMENT ON FUNCTION reabrir_cancelamento IS
  'Reverte conclusão do cancelamento (válido dentro de 30 dias). Se total, restaura card para etapa anterior.';

GRANT EXECUTE ON FUNCTION reabrir_cancelamento TO authenticated;
