-- Bug Equipe: KPIs do topo somavam duplicado quando card tem múltiplos owners
-- (SDR + Planner + Pós). Ex: card R$ 100k com 3 owners aparecia como R$ 300k
-- na receita total. Em Trips, 53 ganhos viraram 80 (60% inflado).
--
-- Solução: RPC nova que retorna totais distintos (cards únicos), pra usar nos
-- 4 KPIs do topo da Equipe. O leaderboard continua linha por consultor (correto)
-- mas a soma vem dessa nova RPC.

CREATE OR REPLACE FUNCTION public.analytics_team_aggregate_kpis(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    cards_ganhos       BIGINT,
    cards_abertos      BIGINT,
    receita_total      NUMERIC,
    faturamento_total  NUMERIC,
    tarefas_vencidas   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH cards_periodo AS (
        SELECT DISTINCT c.id, c.status_comercial, c.valor_final, c.receita
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.created_at >= p_date_start AND c.created_at < p_date_end
          AND _a_tag_ok(c.id, p_tag_ids)
          -- Se filtro de owners passado, restringe a cards que envolvem essas pessoas
          AND (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
               OR c.sdr_owner_id = ANY(p_owner_ids)
               OR c.vendas_owner_id = ANY(p_owner_ids)
               OR c.pos_owner_id = ANY(p_owner_ids)
               OR c.dono_atual_id = ANY(p_owner_ids))
    ),
    cards_abertos_agora AS (
        -- Snapshot atual: cards abertos org-wide (sem filtro de período pra "Cards abertos")
        SELECT DISTINCT c.id
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND _a_tag_ok(c.id, p_tag_ids)
          AND (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
               OR c.sdr_owner_id = ANY(p_owner_ids)
               OR c.vendas_owner_id = ANY(p_owner_ids)
               OR c.pos_owner_id = ANY(p_owner_ids)
               OR c.dono_atual_id = ANY(p_owner_ids))
    ),
    tarefas_vencidas_count AS (
        SELECT COUNT(*) AS n FROM tarefas t
        JOIN cards c ON c.id = t.card_id
        WHERE t.org_id = v_org
          AND t.concluida = false
          AND t.deleted_at IS NULL
          AND t.data_vencimento IS NOT NULL
          AND t.data_vencimento < NOW()
          AND c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
               OR t.responsavel_id = ANY(p_owner_ids))
    )
    SELECT
        COUNT(*) FILTER (WHERE cp.status_comercial = 'ganho')::BIGINT AS cards_ganhos,
        (SELECT COUNT(*)::BIGINT FROM cards_abertos_agora) AS cards_abertos,
        COALESCE(SUM(cp.receita) FILTER (WHERE cp.status_comercial = 'ganho'), 0)::NUMERIC AS receita_total,
        COALESCE(SUM(cp.valor_final) FILTER (WHERE cp.status_comercial = 'ganho'), 0)::NUMERIC AS faturamento_total,
        COALESCE((SELECT n FROM tarefas_vencidas_count), 0)::BIGINT AS tarefas_vencidas
    FROM cards_periodo cp;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_team_aggregate_kpis TO authenticated;

COMMENT ON FUNCTION public.analytics_team_aggregate_kpis IS
'KPIs do time SEM duplicação (cards distintos no período). Compara com analytics_team_leaderboard que retorna 1 linha por consultor — somar essas linhas no frontend inflacionava por causa de envolvimentos múltiplos.';
