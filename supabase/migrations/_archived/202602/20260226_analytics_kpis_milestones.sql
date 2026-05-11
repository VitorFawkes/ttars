-- ============================================================
-- Analytics: Milestone rates no analytics_overview_kpis
--
-- Novos campos:
--   - taxa_paga_rate: % dos leads que estão em/após "Taxa Paga"
--   - briefing_agendado_rate: % em/após "Briefing Agendado"
--   - proposta_enviada_rate: % em/após "Proposta Enviada"
--   - viagem_confirmada_rate: % em/após "Viagem Confirmada"
--
-- Lógica: usa posição atual do card no pipeline (global_order)
-- para determinar se atingiu cada milestone. Cards ganhos
-- (status_comercial = 'ganho') contam como tendo atingido
-- todos os milestones.
-- ============================================================

DROP FUNCTION IF EXISTS analytics_overview_kpis(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION analytics_overview_kpis(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
    v_taxa_paga_order INT;
    v_briefing_order INT;
    v_proposta_order INT;
    v_viagem_order INT;
BEGIN
    -- Compute global ordering for milestone stages
    SELECT MIN(pp.order_index * 100 + s.ordem)
    INTO v_taxa_paga_order
    FROM pipeline_stages s JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE s.ativo = true AND s.nome ILIKE 'Taxa Paga%';

    SELECT MIN(pp.order_index * 100 + s.ordem)
    INTO v_briefing_order
    FROM pipeline_stages s JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE s.ativo = true AND s.nome ILIKE 'Briefing Agendado%';

    SELECT MIN(pp.order_index * 100 + s.ordem)
    INTO v_proposta_order
    FROM pipeline_stages s JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE s.ativo = true AND s.nome ILIKE 'Proposta Enviada%';

    SELECT MIN(pp.order_index * 100 + s.ordem)
    INTO v_viagem_order
    FROM pipeline_stages s JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE s.ativo = true AND s.nome ILIKE 'Viagem Confirmada%';

    WITH leads_pool AS (
        SELECT c.*, pp2.order_index * 100 + s2.ordem AS card_global_order
        FROM cards c
        LEFT JOIN pipeline_stages s2 ON s2.id = c.pipeline_stage_id
        LEFT JOIN pipeline_phases pp2 ON pp2.id = s2.phase_id
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
              ELSE
                  c.created_at >= p_date_start AND c.created_at < p_date_end
          END
    ),
    outcomes_pool AS (
        SELECT c.*
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial IN ('ganho', 'perdido')
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
              ELSE
                  c.created_at >= p_date_start AND c.created_at < p_date_end
          END
    )
    SELECT json_build_object(
        'total_leads', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool),
        'total_won', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'total_lost', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'perdido'),
        'total_open', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool WHERE status_comercial NOT IN ('ganho', 'perdido')),
        'conversao_venda_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0
            THEN ROUND(
                (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho')::NUMERIC
                / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END,
        'receita_total', (SELECT COALESCE(SUM(valor_final), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'margem_total', (SELECT COALESCE(SUM(receita), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'ticket_medio', CASE
            WHEN (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho') > 0
            THEN (SELECT ROUND(SUM(valor_final) / COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho')
            ELSE 0
        END,
        'ciclo_medio_dias', (
            SELECT COALESCE(ROUND(AVG(
                EXTRACT(EPOCH FROM (o.data_fechamento::TIMESTAMPTZ - o.created_at)) / 86400
            ), 1), 0)
            FROM outcomes_pool o
            WHERE o.status_comercial = 'ganho'
              AND o.data_fechamento IS NOT NULL
              AND o.data_fechamento::TIMESTAMPTZ > o.created_at
        ),
        'viagens_vendidas', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        -- Milestone rates: card at/past milestone OR ganho (ganho implies all milestones reached)
        'taxa_paga_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_taxa_paga_order IS NOT NULL
            THEN ROUND(
                (SELECT COUNT(*) FROM leads_pool WHERE card_global_order >= v_taxa_paga_order OR status_comercial = 'ganho')::NUMERIC
                / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END,
        'briefing_agendado_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_briefing_order IS NOT NULL
            THEN ROUND(
                (SELECT COUNT(*) FROM leads_pool WHERE card_global_order >= v_briefing_order OR status_comercial = 'ganho')::NUMERIC
                / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END,
        'proposta_enviada_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_proposta_order IS NOT NULL
            THEN ROUND(
                (SELECT COUNT(*) FROM leads_pool WHERE card_global_order >= v_proposta_order OR status_comercial = 'ganho')::NUMERIC
                / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END,
        'viagem_confirmada_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0 AND v_viagem_order IS NOT NULL
            THEN ROUND(
                (SELECT COUNT(*) FROM leads_pool WHERE card_global_order >= v_viagem_order OR status_comercial = 'ganho')::NUMERIC
                / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_overview_kpis TO authenticated;
