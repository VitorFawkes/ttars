-- ============================================================================
-- MIGRATION: Quality Gate — Orçamento Previsto e Data Prevista de Fechamento
-- obrigatórios a partir da etapa "Proposta Enviada" em pipelines TRIPS
-- Date: 2026-05-12
--
-- CONTEXTO
-- A partir do momento em que o Travel Planner começa a trabalhar a venda
-- (etapa "Proposta Enviada" e seguintes na fase Planner + toda a fase
-- Pós-venda), é obrigatório que:
-- 1. orcamento (smart_budget em produto_data) esteja preenchido — Orçamento Previsto
-- 2. data_prevista_fechamento (date em produto_data) esteja preenchida
--
-- Ambos campos vivem em cards.produto_data (JSONB). A função SQL
-- validate_stage_requirements (migration 20260406) já lê produto_data->>key,
-- então não há ajuste no SQL backend.
--
-- ESTRATÉGIA
-- Para cada pipeline com produto=TRIPS:
-- (a) localizar etapa-gatilho via nome ILIKE 'proposta enviada%' (variações
--     reais: "Proposta Enviada", "Proposta Enviada ( Ajustes e Refinamentos )",
--     "Proposta Enviada ao Cliente", etc.);
-- (b) aplicar requirements em essa etapa + todas as etapas ativas da MESMA
--     fase (Planner) com ordem >= ordem da etapa-gatilho;
-- (c) aplicar também em todas as etapas ativas da fase Pós-venda da org
--     (slug='pos_venda' ou nome semelhante).
--
-- Idempotente via UPSERT — re-rodar não duplica e atualiza valores existentes.
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_pipeline RECORD;
    v_proposta_stage RECORD;
    v_pos_phase_id UUID;
    v_planner_phase_id UUID;
    v_stage RECORD;
    v_count_pipelines INT := 0;
    v_count_stages INT := 0;
BEGIN
    FOR v_pipeline IN
        SELECT id, org_id FROM pipelines WHERE produto::TEXT = 'TRIPS' AND ativo = TRUE
    LOOP
        v_count_pipelines := v_count_pipelines + 1;

        -- (a) Localizar etapa-gatilho "Proposta Enviada%" ativa, com menor ordem
        SELECT id, ordem, phase_id
        INTO v_proposta_stage
        FROM pipeline_stages
        WHERE pipeline_id = v_pipeline.id
          AND ativo = TRUE
          AND nome ILIKE 'proposta enviada%'
        ORDER BY ordem ASC
        LIMIT 1;

        IF v_proposta_stage.id IS NULL THEN
            RAISE NOTICE 'Pipeline % (org %): não tem etapa "Proposta Enviada" — pulando',
                v_pipeline.id, v_pipeline.org_id;
            CONTINUE;
        END IF;

        v_planner_phase_id := v_proposta_stage.phase_id;

        -- Localizar fase Pós-venda da MESMA org
        SELECT id INTO v_pos_phase_id
        FROM pipeline_phases
        WHERE org_id = v_pipeline.org_id
          AND active = TRUE
          AND (
              slug = 'pos_venda'
              OR LOWER(unaccent(name)) LIKE '%pos%venda%'
              OR LOWER(unaccent(label)) LIKE '%pos%venda%'
          )
        ORDER BY order_index ASC
        LIMIT 1;

        -- (b) e (c) Aplicar requirements em:
        --   - Etapa-gatilho e seguintes da fase Planner (ordem >= gatilho)
        --   - Todas as etapas ativas da fase Pós-venda
        FOR v_stage IN
            SELECT id
            FROM pipeline_stages
            WHERE pipeline_id = v_pipeline.id
              AND ativo = TRUE
              AND (
                  (phase_id = v_planner_phase_id AND ordem >= v_proposta_stage.ordem)
                  OR (v_pos_phase_id IS NOT NULL AND phase_id = v_pos_phase_id)
              )
        LOOP
            v_count_stages := v_count_stages + 1;

            -- orcamento (Orçamento Previsto)
            INSERT INTO stage_field_config (
                stage_id, field_key, is_required, is_blocking, requirement_type,
                requirement_label, is_visible, org_id
            )
            VALUES (
                v_stage.id, 'orcamento', TRUE, TRUE, 'field',
                'Orçamento Previsto', TRUE, v_pipeline.org_id
            )
            ON CONFLICT (stage_id, field_key) DO UPDATE SET
                is_required = TRUE,
                is_blocking = TRUE,
                requirement_type = 'field',
                requirement_label = COALESCE(stage_field_config.requirement_label, 'Orçamento Previsto'),
                is_visible = TRUE,
                updated_at = NOW();

            -- data_prevista_fechamento
            INSERT INTO stage_field_config (
                stage_id, field_key, is_required, is_blocking, requirement_type,
                requirement_label, is_visible, org_id
            )
            VALUES (
                v_stage.id, 'data_prevista_fechamento', TRUE, TRUE, 'field',
                'Data Prevista de Fechamento', TRUE, v_pipeline.org_id
            )
            ON CONFLICT (stage_id, field_key) DO UPDATE SET
                is_required = TRUE,
                is_blocking = TRUE,
                requirement_type = 'field',
                requirement_label = COALESCE(stage_field_config.requirement_label, 'Data Prevista de Fechamento'),
                is_visible = TRUE,
                updated_at = NOW();
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Quality gate aplicado em % pipelines TRIPS, % etapas-alvo',
        v_count_pipelines, v_count_stages;
END $$;

COMMIT;
