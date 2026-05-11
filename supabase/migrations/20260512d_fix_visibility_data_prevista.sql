-- ============================================================================
-- MIGRATION: Fix de visibilidade do campo "Data Prevista de Fechamento"
-- Date: 2026-05-12
--
-- PROBLEMA
-- A migration 20260512a inseriu o campo data_prevista_fechamento em
-- section_field_config com is_visible=true. Combinado com:
--
-- (a) o "phase-aware fallback" do useFieldConfig (src/hooks/useFieldConfig.ts
--     linhas 147-174): quando uma etapa não tem stage_field_config próprio
--     para um campo, ele herda dos siblings da mesma fase SE todos os siblings
--     concordam — caso da fase T. Planner onde "Proposta Enviada" e "Reservas
--     e Fechamento" têm is_visible=true (criadas pela 20260512b).
--
-- (b) o fallback de section_default (linha 186): quando nem stage nem siblings
--     resolvem, usa section_field_config.is_visible (que estava true).
--
-- Resultado: o campo aparecia em TODAS as etapas T. Planner (Oportunidade,
-- Proposta em Construção, etc.) e em qualquer outra etapa via section default.
-- O Vitor queria visibilidade apenas onde a regra dispara (Proposta Enviada
-- em diante).
--
-- FIX
-- 1. Marcar section_default como is_visible=false → campo oculto por padrão.
-- 2. Inserir stage_field_config explícito com is_visible=false em todas as
--    etapas T. Planner anteriores ao gatilho ("Proposta Enviada%") — assim
--    o phase-aware fallback NÃO herda is_visible=true dos siblings (siblings
--    divergem → fallback é skipado e cai no section_default=false).
-- 3. As 7 etapas onde quality gate dispara continuam com is_visible=true
--    explícito (criadas pela 20260512b) — campo visível e obrigatório lá.
--
-- O admin pode mudar visibilidade via Pipeline Studio → Aba "Campos" da etapa.
-- ============================================================================

BEGIN;

-- ─── 1. section_field_config: campo oculto por padrão ─────────────────────

UPDATE section_field_config
SET is_visible = false
WHERE field_key = 'data_prevista_fechamento'
  AND section_key = 'trip_info';

-- ─── 2. stage_field_config: invisível explícito em etapas T. Planner ────────
--      ANTERIORES ao gatilho "Proposta Enviada%"
--
-- Por org TRIPS: pega phase_id da T. Planner (via etapa-gatilho) e marca
-- is_visible=false em todas as etapas dessa fase com ordem < ordem do gatilho.

DO $$
DECLARE
    v_pipeline RECORD;
    v_proposta_stage RECORD;
    v_stage_id UUID;
BEGIN
    FOR v_pipeline IN
        SELECT id, org_id FROM pipelines WHERE produto::TEXT = 'TRIPS' AND ativo = TRUE
    LOOP
        -- Acha etapa-gatilho (mesma lógica de 20260512b)
        SELECT id, ordem, phase_id INTO v_proposta_stage
        FROM pipeline_stages
        WHERE pipeline_id = v_pipeline.id
          AND ativo = TRUE
          AND nome ILIKE 'proposta enviada%'
        ORDER BY ordem ASC LIMIT 1;

        IF v_proposta_stage.id IS NULL THEN CONTINUE; END IF;

        -- Itera etapas da MESMA fase do gatilho com ordem < ordem do gatilho
        -- (inclui inativas — admin pode reativar amanhã e fica consistente)
        FOR v_stage_id IN
            SELECT id FROM pipeline_stages
            WHERE pipeline_id = v_pipeline.id
              AND phase_id = v_proposta_stage.phase_id
              AND ordem < v_proposta_stage.ordem
        LOOP
            INSERT INTO stage_field_config (
                stage_id, field_key, is_visible, is_required, is_blocking,
                requirement_type, org_id
            )
            VALUES (
                v_stage_id, 'data_prevista_fechamento',
                FALSE, FALSE, FALSE,
                NULL,  -- não é requirement, é só visibilidade explícita
                v_pipeline.org_id
            )
            ON CONFLICT (stage_id, field_key) DO UPDATE SET
                is_visible = FALSE,
                updated_at = NOW();
        END LOOP;
    END LOOP;
END $$;

COMMIT;
