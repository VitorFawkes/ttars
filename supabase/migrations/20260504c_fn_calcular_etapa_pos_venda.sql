-- ============================================================================
-- MIGRATION: fn_calcular_etapa_pos_venda — função utilitária reusável
-- Date: 2026-05-04
--
-- Calcula a etapa correta da fase pos_venda dado um card.
--
-- Lógica (pipeline TRIPS — c8022522-4a1d-411c-9387-efe03ca725ee):
--   - Se data_exata_da_viagem ausente → primeira etapa de pos_venda (fallback)
--   - Se viagem terminou (CURRENT_DATE > end) → "Pós-viagem & Reativação"
--   - Se em viagem (start <= CURRENT_DATE <= end) → "Em Viagem"
--   - Se faltam <=30 dias para start → "Pré-Embarque <<< 30"
--   - Se faltam >30 dias para start → "Pré-embarque >>> 30"
--
-- Outros pipelines: retorna primeira etapa ativa de pos_venda (sem regra de data).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_calcular_etapa_pos_venda(
    p_card_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_pipeline_id UUID;
    v_produto_data JSONB;
    v_pos_phase_id UUID;
    v_first_pos_stage_id UUID;
    v_target_stage_id UUID;
    v_start_date DATE;
    v_end_date DATE;
    v_days_to_start INT;

    -- Stage IDs do pipeline TRIPS (alinhado com fn_roteamento_pos_venda_trips)
    STAGE_APP_CONTEUDO  CONSTANT UUID := 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36';
    STAGE_PRE_30_PLUS   CONSTANT UUID := '1f684773-f8f3-434a-a44d-4994750c41aa';
    STAGE_PRE_30_MINUS  CONSTANT UUID := '3ce80249-b579-4a9c-9b82-f8569735cea9';
    STAGE_EM_VIAGEM     CONSTANT UUID := '0ebab355-6d0e-4b19-af13-b4b31268275f';
    STAGE_POS_VIAGEM    CONSTANT UUID := '2c07134a-cb83-4075-bc86-4750beec9393';
    PIPELINE_TRIPS      CONSTANT UUID := 'c8022522-4a1d-411c-9387-efe03ca725ee';
BEGIN
    SELECT s.pipeline_id, c.produto_data
      INTO v_pipeline_id, v_produto_data
      FROM cards c
      JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
     WHERE c.id = p_card_id;

    IF v_pipeline_id IS NULL THEN
        RAISE EXCEPTION 'Card não encontrado: %', p_card_id;
    END IF;

    SELECT pp.id INTO v_pos_phase_id
      FROM pipeline_phases pp
      JOIN pipeline_stages s2 ON s2.phase_id = pp.id
     WHERE s2.pipeline_id = v_pipeline_id
       AND pp.slug = 'pos_venda'
     LIMIT 1;

    IF v_pos_phase_id IS NULL THEN
        RAISE EXCEPTION 'Fase pos_venda não encontrada para o pipeline %', v_pipeline_id;
    END IF;

    SELECT s.id INTO v_first_pos_stage_id
      FROM pipeline_stages s
     WHERE s.phase_id = v_pos_phase_id
       AND s.ativo = true
       AND COALESCE(s.is_won, false) = false
       AND COALESCE(s.is_lost, false) = false
     ORDER BY s.ordem ASC
     LIMIT 1;

    IF v_first_pos_stage_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma etapa ativa encontrada na fase pos_venda do pipeline %', v_pipeline_id;
    END IF;

    -- Pipelines não-TRIPS: usa primeira etapa (sem regra de data)
    IF v_pipeline_id <> PIPELINE_TRIPS THEN
        RETURN v_first_pos_stage_id;
    END IF;

    -- TRIPS: aplica regra de data
    IF v_produto_data IS NULL
       OR v_produto_data -> 'data_exata_da_viagem' IS NULL
       OR v_produto_data -> 'data_exata_da_viagem' ->> 'start' IS NULL
       OR v_produto_data -> 'data_exata_da_viagem' ->> 'end'   IS NULL
    THEN
        -- Sem data → começa em App & Conteúdo
        RETURN STAGE_APP_CONTEUDO;
    END IF;

    BEGIN
        v_start_date := (v_produto_data -> 'data_exata_da_viagem' ->> 'start')::DATE;
        v_end_date   := (v_produto_data -> 'data_exata_da_viagem' ->> 'end')::DATE;
    EXCEPTION WHEN OTHERS THEN
        RETURN STAGE_APP_CONTEUDO;
    END;

    v_days_to_start := v_start_date - CURRENT_DATE;

    IF CURRENT_DATE > v_end_date THEN
        v_target_stage_id := STAGE_POS_VIAGEM;
    ELSIF CURRENT_DATE >= v_start_date AND CURRENT_DATE <= v_end_date THEN
        v_target_stage_id := STAGE_EM_VIAGEM;
    ELSIF v_days_to_start <= 30 THEN
        v_target_stage_id := STAGE_PRE_30_MINUS;
    ELSE
        v_target_stage_id := STAGE_PRE_30_PLUS;
    END IF;

    RETURN v_target_stage_id;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.fn_calcular_etapa_pos_venda(UUID) TO authenticated;

COMMENT ON FUNCTION public.fn_calcular_etapa_pos_venda(UUID) IS
  'Retorna UUID da etapa correta da fase pos_venda para o card. Para TRIPS usa data_exata_da_viagem; outros pipelines retornam primeira etapa.';

COMMIT;
