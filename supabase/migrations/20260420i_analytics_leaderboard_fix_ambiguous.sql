-- Fix: analytics_team_leaderboard tinha "column reference user_id is ambiguous"
-- PL/pgSQL trata colunas de RETURNS TABLE como variáveis; as CTEs tinham coluna user_id
-- homônima. Renomeia para u_id dentro das CTEs.

DROP FUNCTION IF EXISTS analytics_team_leaderboard(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID[]);

CREATE FUNCTION analytics_team_leaderboard(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    user_id             UUID,
    user_nome           TEXT,
    user_avatar_url     TEXT,
    fases               TEXT[],
    cards_envolvidos    BIGINT,
    cards_ganhos        BIGINT,
    cards_perdidos      BIGINT,
    cards_abertos       BIGINT,
    win_rate            NUMERIC,
    receita_total       NUMERIC,
    ticket_medio        NUMERIC,
    tarefas_abertas     BIGINT,
    tarefas_vencidas    BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH card_base AS (
        SELECT c.id, c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id,
               c.status_comercial, c.valor_final, c.receita
        FROM cards c
        WHERE c.org_id = v_org AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.created_at >= p_date_start AND c.created_at < p_date_end
          AND _a_tag_ok(c.id, p_tag_ids)
    ),
    envolvimentos AS (
        SELECT cb.id AS card_id, cb.sdr_owner_id AS u_id, 'sdr'::TEXT AS fase,
               cb.status_comercial, cb.valor_final, cb.receita
        FROM card_base cb WHERE cb.sdr_owner_id IS NOT NULL
        UNION ALL
        SELECT cb.id, cb.vendas_owner_id, 'planner',
               cb.status_comercial, cb.valor_final, cb.receita
        FROM card_base cb WHERE cb.vendas_owner_id IS NOT NULL
        UNION ALL
        SELECT cb.id, cb.pos_owner_id, 'pos_venda',
               cb.status_comercial, cb.valor_final, cb.receita
        FROM card_base cb WHERE cb.pos_owner_id IS NOT NULL
    ),
    envolvimentos_dedup AS (
        SELECT DISTINCT ON (e.card_id, e.u_id)
            e.card_id, e.u_id, e.status_comercial, e.valor_final, e.receita
        FROM envolvimentos e
        WHERE (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
               OR e.u_id = ANY(p_owner_ids))
    ),
    fases_por_pessoa AS (
        SELECT e.u_id, ARRAY_AGG(DISTINCT e.fase ORDER BY e.fase) AS fases
        FROM envolvimentos e
        WHERE (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
               OR e.u_id = ANY(p_owner_ids))
        GROUP BY e.u_id
    ),
    por_pessoa AS (
        SELECT
            ed.u_id,
            fp.fases,
            COUNT(*)::BIGINT AS cards_envolvidos,
            COUNT(*) FILTER (WHERE ed.status_comercial = 'ganho')::BIGINT AS cards_ganhos,
            COUNT(*) FILTER (WHERE ed.status_comercial = 'perdido')::BIGINT AS cards_perdidos,
            COUNT(*) FILTER (WHERE ed.status_comercial NOT IN ('ganho', 'perdido'))::BIGINT AS cards_abertos,
            COALESCE(SUM(ed.receita) FILTER (WHERE ed.status_comercial = 'ganho'), 0)::NUMERIC AS receita_total,
            COUNT(*) FILTER (WHERE ed.status_comercial = 'ganho')::BIGINT AS ganhos_n,
            COALESCE(SUM(ed.valor_final) FILTER (WHERE ed.status_comercial = 'ganho'), 0)::NUMERIC AS valor_won
        FROM envolvimentos_dedup ed
        JOIN fases_por_pessoa fp ON fp.u_id = ed.u_id
        GROUP BY ed.u_id, fp.fases
    ),
    tarefas_counts AS (
        SELECT
            t.responsavel_id AS u_id,
            COUNT(*) FILTER (WHERE t.concluida = false) AS tarefas_abertas,
            COUNT(*) FILTER (
                WHERE t.concluida = false
                  AND t.data_vencimento IS NOT NULL
                  AND t.data_vencimento < NOW()
            ) AS tarefas_vencidas
        FROM tarefas t
        WHERE t.org_id = v_org AND t.deleted_at IS NULL AND t.responsavel_id IS NOT NULL
        GROUP BY t.responsavel_id
    )
    SELECT
        pp.u_id,
        pr.nome AS user_nome,
        pr.avatar_url AS user_avatar_url,
        pp.fases,
        pp.cards_envolvidos,
        pp.cards_ganhos,
        pp.cards_perdidos,
        pp.cards_abertos,
        CASE WHEN (pp.cards_ganhos + pp.cards_perdidos) > 0
            THEN ROUND(pp.cards_ganhos::NUMERIC / (pp.cards_ganhos + pp.cards_perdidos)::NUMERIC * 100, 1)
            ELSE 0
        END AS win_rate,
        pp.receita_total,
        CASE WHEN pp.ganhos_n > 0
            THEN ROUND(pp.valor_won / pp.ganhos_n, 0)
            ELSE 0
        END AS ticket_medio,
        COALESCE(tc.tarefas_abertas, 0)::BIGINT,
        COALESCE(tc.tarefas_vencidas, 0)::BIGINT
    FROM por_pessoa pp
    JOIN profiles pr ON pr.id = pp.u_id
    LEFT JOIN tarefas_counts tc ON tc.u_id = pp.u_id
    ORDER BY pp.receita_total DESC, pp.cards_ganhos DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_team_leaderboard TO authenticated;
