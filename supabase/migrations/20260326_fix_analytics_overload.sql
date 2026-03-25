-- ============================================================================
-- FIX: Remove overload conflict on analytics_operations_summary
-- Problem: Migration 20260326_analytics_sub_card_category created a new
--   overload without p_tag_ids, conflicting with the existing one that has it.
-- Solution: Drop the overload without p_tag_ids, then recreate with p_tag_ids
--   and the new category breakdown fields.
-- Date: 2026-03-26
-- ============================================================================

BEGIN;

-- Drop the overload WITHOUT p_tag_ids (the one we accidentally created)
DROP FUNCTION IF EXISTS analytics_operations_summary(DATE, DATE, TEXT, TEXT, UUID, UUID, UUID[]);

-- Recreate with correct signature INCLUDING p_tag_ids + category breakdown
CREATE OR REPLACE FUNCTION analytics_operations_summary(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSONB;
    v_start DATE := COALESCE(p_date_start, CURRENT_DATE - INTERVAL '90 days');
    v_end   DATE := COALESCE(p_date_end, CURRENT_DATE);
BEGIN
    WITH won_cards AS (
        SELECT c.*
        FROM cards c
        WHERE c.status_comercial = 'ganho'
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND CASE
              WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                  c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(
                      p_stage_id, v_start::TIMESTAMPTZ, (v_end + 1)::TIMESTAMPTZ, p_product
                  ))
              WHEN p_mode = 'ganho_sdr' THEN
                  c.ganho_sdr = true AND c.ganho_sdr_at >= v_start::TIMESTAMPTZ AND c.ganho_sdr_at < (v_end + 1)::TIMESTAMPTZ
              WHEN p_mode = 'ganho_planner' THEN
                  c.ganho_planner = true AND c.ganho_planner_at >= v_start::TIMESTAMPTZ AND c.ganho_planner_at < (v_end + 1)::TIMESTAMPTZ
              WHEN p_mode = 'ganho_total' THEN
                  c.ganho_pos = true AND c.ganho_pos_at >= v_start::TIMESTAMPTZ AND c.ganho_pos_at < (v_end + 1)::TIMESTAMPTZ
              ELSE
                  c.created_at >= v_start::TIMESTAMPTZ AND c.created_at < (v_end + 1)::TIMESTAMPTZ
          END
    ),
    kpis AS (
        SELECT
            COUNT(*) AS viagens_realizadas,
            COALESCE(SUM(valor_final), 0) AS valor_total,
            CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(valor_final), 0) / COUNT(*), 2) ELSE 0 END AS ticket_medio
        FROM won_cards
    ),
    sub_cards AS (
        SELECT sc.*
        FROM cards sc
        JOIN won_cards wc ON sc.parent_card_id = wc.id
        WHERE sc.card_type = 'sub_card' AND sc.deleted_at IS NULL
    ),
    sub_stats AS (
        SELECT
            COUNT(*) AS total_sub_cards,
            COUNT(*) FILTER (WHERE COALESCE(sub_card_category, 'addition') = 'addition') AS additions_count,
            COUNT(*) FILTER (WHERE sub_card_category = 'change') AS changes_count,
            COUNT(DISTINCT parent_card_id) AS cards_with_changes,
            CASE WHEN (SELECT viagens_realizadas FROM kpis) > 0
                 THEN ROUND(COUNT(*)::NUMERIC / (SELECT viagens_realizadas FROM kpis), 2) ELSE 0 END AS changes_per_trip
        FROM sub_cards
    ),
    per_planner AS (
        SELECT p.nome AS planner_nome,
            wc.vendas_owner_id AS planner_id,
            COUNT(DISTINCT wc.id) AS viagens,
            COUNT(sc.id) AS mudancas,
            COUNT(sc.id) FILTER (WHERE COALESCE(sc.sub_card_category, 'addition') = 'addition') AS additions,
            COUNT(sc.id) FILTER (WHERE sc.sub_card_category = 'change') AS changes,
            CASE WHEN COUNT(DISTINCT wc.id) > 0
                 THEN ROUND(COUNT(sc.id)::NUMERIC / COUNT(DISTINCT wc.id), 2) ELSE 0 END AS mudancas_por_viagem,
            COALESCE(SUM(wc.valor_final), 0) AS receita
        FROM won_cards wc
        LEFT JOIN cards sc ON sc.parent_card_id = wc.id AND sc.card_type = 'sub_card' AND sc.deleted_at IS NULL
        LEFT JOIN profiles p ON p.id = wc.vendas_owner_id
        WHERE wc.vendas_owner_id IS NOT NULL
        GROUP BY p.nome, wc.vendas_owner_id ORDER BY viagens DESC
    ),
    timeline AS (
        SELECT TO_CHAR(DATE_TRUNC('week', sc.created_at::TIMESTAMPTZ), 'YYYY-MM-DD') AS week, COUNT(*) AS count
        FROM sub_cards sc GROUP BY 1 ORDER BY 1
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT row_to_json(k) FROM kpis k),
        'sub_card_stats', (SELECT row_to_json(s) FROM sub_stats s),
        'per_planner', (SELECT COALESCE(jsonb_agg(row_to_json(pp)), '[]'::jsonb) FROM per_planner pp),
        'timeline', (SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) FROM timeline t)
    ) INTO result;
    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_operations_summary TO authenticated;

COMMIT;
