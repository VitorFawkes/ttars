-- ════════════════════════════════════════════════════════════════════════
-- Lente safra↔atividade no placar da EQUIPE (leaderboard + KPIs agregados)
--
-- Adiciona p_date_ref TEXT DEFAULT 'created' (no FIM da assinatura). DEFAULT
-- 'created' = comportamento ATUAL byte-a-byte (ambas as RPCs já filtravam a
-- população por created_at — safra). Chamadas antigas de 4 args continuam
-- idênticas → zero regressão nos números que a Equipe vê hoje.
--   • 'created' (Por safra)     = cards CRIADOS no período (atual; inclui abertos).
--   • 'stage'   (Por atividade) = cards que FECHARAM (data_fechamento) no período
--                                  → win_rate sobre fechados, abertos≈0. Coerente.
--
-- Só o predicado de período da CTE-base de cada função muda (card_base /
-- cards_periodo); todo o resto é o corpo VIGENTE em produção, preservado verbatim
-- (leaderboard: pg_get_functiondef ao vivo; aggregate: 20260524b sem duplicar owners).
-- Branch usa `p_date_ref <> 'stage'` p/ o ramo safra → qualquer valor inesperado
-- (NULL incluso) cai no comportamento histórico (fail-safe).
-- ════════════════════════════════════════════════════════════════════════

-- ═══ 1. analytics_team_leaderboard + p_date_ref ═════════════════════════
DROP FUNCTION IF EXISTS public.analytics_team_leaderboard(timestamptz, timestamptz, uuid[], uuid[]);

CREATE FUNCTION public.analytics_team_leaderboard(
    p_date_start timestamptz DEFAULT (now() - '90 days'::interval),
    p_date_end   timestamptz DEFAULT now(),
    p_owner_ids  uuid[]      DEFAULT NULL::uuid[],
    p_tag_ids    uuid[]      DEFAULT NULL::uuid[],
    p_date_ref   text        DEFAULT 'created'   -- 'created'=safra (atual) | 'stage'=atividade (data_fechamento)
)
RETURNS TABLE(user_id uuid, user_nome text, user_avatar_url text, fases text[], cards_envolvidos bigint, cards_ganhos bigint, cards_perdidos bigint, cards_abertos bigint, win_rate numeric, receita_total numeric, ticket_medio numeric, tarefas_abertas bigint, tarefas_vencidas bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
          AND (
            (p_date_ref =  'stage' AND c.data_fechamento >= p_date_start AND c.data_fechamento < p_date_end)
            OR
            (p_date_ref <> 'stage' AND c.created_at      >= p_date_start AND c.created_at      < p_date_end)
          )
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
$function$;

GRANT EXECUTE ON FUNCTION public.analytics_team_leaderboard(timestamptz, timestamptz, uuid[], uuid[], text) TO authenticated, anon, service_role;


-- ═══ 2. analytics_team_aggregate_kpis + p_date_ref ══════════════════════
-- Preserva o fix de NÃO duplicar owners (cards DISTINTOS). Base 20260524b.
DROP FUNCTION IF EXISTS public.analytics_team_aggregate_kpis(timestamptz, timestamptz, uuid[], uuid[]);

CREATE FUNCTION public.analytics_team_aggregate_kpis(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL,
    p_date_ref   text   DEFAULT 'created'   -- 'created'=safra (atual) | 'stage'=atividade (data_fechamento)
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
          AND (
            (p_date_ref =  'stage' AND c.data_fechamento >= p_date_start AND c.data_fechamento < p_date_end)
            OR
            (p_date_ref <> 'stage' AND c.created_at      >= p_date_start AND c.created_at      < p_date_end)
          )
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

GRANT EXECUTE ON FUNCTION public.analytics_team_aggregate_kpis(timestamptz, timestamptz, uuid[], uuid[], text) TO authenticated, anon, service_role;
