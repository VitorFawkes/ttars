-- ============================================================================
-- MIGRATION: Esconder data_prevista_fechamento em etapas ANTES de
-- "Proposta Enviada" — em todos os pipelines TRIPS
-- Date: 2026-05-12
--
-- CONTEXTO
-- A 20260512d esconde só etapas T. Planner antes do gatilho. Mas section_field_config
-- tem UNIQUE (section_key, field_key) sem org_id (legado), então a entry de
-- 20260512a só foi gravada em uma org (2e8f0cee) — pras outras orgs (incluindo
-- Welcome Trips real, b0000000), o fallback de section_default é `true` e o
-- campo aparece nas etapas SDR também via fallback do useFieldConfig.
--
-- FIX DETERMINÍSTICO
-- Inserir stage_field_config explícito com is_visible=false em TODAS as etapas
-- que estão ANTES da etapa-gatilho na linha do tempo do funil, em cada
-- pipeline TRIPS. "Antes" significa:
--   (a) etapa está numa FASE com order_index < order_index da fase do gatilho;
--   (b) ou etapa está na MESMA FASE do gatilho mas com ordem < ordem do gatilho.
-- Fases após o gatilho (Pós-venda) mantém visibilidade já configurada por
-- 20260512b (is_visible=true) — não toca nelas.
--
-- O admin pode mudar via Pipeline Studio em qualquer momento (UPSERT preservado
-- pelos triggers updated_at em stage_field_config).
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_pipeline RECORD;
    v_proposta_stage RECORD;
    v_gatilho_phase_order INT;
    v_stage_id UUID;
    v_total INT := 0;
BEGIN
    FOR v_pipeline IN
        SELECT id, org_id FROM pipelines WHERE produto::TEXT = 'TRIPS' AND ativo = TRUE
    LOOP
        -- Acha etapa-gatilho + order_index da fase dela
        SELECT s.id, s.ordem, s.phase_id, ph.order_index AS phase_order
        INTO v_proposta_stage
        FROM pipeline_stages s
        JOIN pipeline_phases ph ON ph.id = s.phase_id
        WHERE s.pipeline_id = v_pipeline.id
          AND s.ativo = TRUE
          AND s.nome ILIKE 'proposta enviada%'
        ORDER BY s.ordem ASC LIMIT 1;

        IF v_proposta_stage.id IS NULL THEN CONTINUE; END IF;
        v_gatilho_phase_order := v_proposta_stage.phase_order;

        -- Etapas pré-gatilho:
        --   (a) fase com order_index < fase do gatilho, ou
        --   (b) mesma fase do gatilho com ordem < ordem do gatilho.
        FOR v_stage_id IN
            SELECT s.id
            FROM pipeline_stages s
            JOIN pipeline_phases ph ON ph.id = s.phase_id
            WHERE s.pipeline_id = v_pipeline.id
              AND s.id != v_proposta_stage.id
              AND (
                  ph.order_index < v_gatilho_phase_order
                  OR (ph.order_index = v_gatilho_phase_order AND s.ordem < v_proposta_stage.ordem)
              )
        LOOP
            INSERT INTO stage_field_config (
                stage_id, field_key, is_visible, is_required, is_blocking,
                requirement_type, org_id
            )
            VALUES (
                v_stage_id, 'data_prevista_fechamento',
                FALSE, FALSE, FALSE, NULL, v_pipeline.org_id
            )
            ON CONFLICT (stage_id, field_key) DO UPDATE SET
                is_visible = FALSE,
                updated_at = NOW();
            v_total := v_total + 1;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'data_prevista_fechamento marcado invisible em % etapas pre-gatilho', v_total;
END $$;

COMMIT;
