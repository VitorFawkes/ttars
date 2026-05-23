-- Modo individual em Equipe: evolução mês a mês de receita, win rate, ticket e ciclo
-- para um consultor específico. Responde a pergunta "como o João vai evoluindo?".
--
-- Também: analytics_team_ticket_variation — min/avg/max de ticket por consultor no
-- período (responde "alguém puxa muito a média?").

CREATE OR REPLACE FUNCTION public.analytics_team_individual_evolution(
    p_user_id   UUID,
    p_months    INT  DEFAULT 6
)
RETURNS TABLE(
    mes              DATE,
    cards_ganhos     BIGINT,
    cards_perdidos   BIGINT,
    cards_envolvidos BIGINT,
    win_rate         NUMERIC,
    receita_total    NUMERIC,
    ticket_medio     NUMERIC,
    ciclo_medio_dias NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH meses AS (
        SELECT generate_series(
            DATE_TRUNC('month', NOW()) - ((p_months - 1) || ' months')::INTERVAL,
            DATE_TRUNC('month', NOW()),
            '1 month'::INTERVAL
        )::DATE AS mes_inicio
    ),
    cards_user AS (
        SELECT
            c.id,
            c.status_comercial,
            c.data_fechamento,
            c.created_at,
            c.valor_final,
            c.receita,
            -- Determina mês de "atividade" do card: data_fechamento se houver, senão updated_at
            DATE_TRUNC('month', COALESCE(c.data_fechamento, c.updated_at))::DATE AS mes_atividade
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (c.sdr_owner_id = p_user_id
               OR c.vendas_owner_id = p_user_id
               OR c.pos_owner_id = p_user_id
               OR c.concierge_owner_id = p_user_id
               OR c.dono_atual_id = p_user_id)
    ),
    por_mes AS (
        SELECT
            m.mes_inicio AS mes,
            COUNT(cu.id) FILTER (WHERE cu.status_comercial = 'ganho' AND cu.mes_atividade = m.mes_inicio)::BIGINT AS g,
            COUNT(cu.id) FILTER (WHERE cu.status_comercial = 'perdido' AND cu.mes_atividade = m.mes_inicio)::BIGINT AS p,
            COUNT(cu.id) FILTER (WHERE cu.mes_atividade = m.mes_inicio)::BIGINT AS env,
            COALESCE(SUM(cu.receita) FILTER (WHERE cu.status_comercial = 'ganho' AND cu.mes_atividade = m.mes_inicio), 0)::NUMERIC AS receita,
            COALESCE(SUM(cu.valor_final) FILTER (WHERE cu.status_comercial = 'ganho' AND cu.mes_atividade = m.mes_inicio), 0)::NUMERIC AS fat,
            COALESCE(AVG(EXTRACT(EPOCH FROM (cu.data_fechamento::TIMESTAMPTZ - cu.created_at)) / 86400.0)
                FILTER (WHERE cu.status_comercial = 'ganho' AND cu.data_fechamento IS NOT NULL AND cu.mes_atividade = m.mes_inicio), 0)::NUMERIC AS ciclo
        FROM meses m
        LEFT JOIN cards_user cu ON TRUE
        GROUP BY m.mes_inicio
    )
    SELECT
        pm.mes,
        pm.g AS cards_ganhos,
        pm.p AS cards_perdidos,
        pm.env AS cards_envolvidos,
        CASE WHEN (pm.g + pm.p) > 0
             THEN ROUND(pm.g::NUMERIC / (pm.g + pm.p) * 100, 1)
             ELSE 0
        END AS win_rate,
        pm.receita AS receita_total,
        CASE WHEN pm.g > 0
             THEN ROUND(pm.fat / pm.g, 0)
             ELSE 0
        END AS ticket_medio,
        ROUND(pm.ciclo, 1) AS ciclo_medio_dias
    FROM por_mes pm
    ORDER BY pm.mes ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_team_individual_evolution TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- analytics_team_ticket_variation
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.analytics_team_ticket_variation(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    user_id          UUID,
    user_nome        TEXT,
    cards_ganhos     BIGINT,
    ticket_min       NUMERIC,
    ticket_medio     NUMERIC,
    ticket_max       NUMERIC,
    receita_total    NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH cards_ganhos AS (
        SELECT
            COALESCE(c.vendas_owner_id, c.dono_atual_id) AS user_id,
            c.valor_final,
            c.receita
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial = 'ganho'
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.data_fechamento >= p_date_start
          AND c.data_fechamento < p_date_end
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND COALESCE(c.vendas_owner_id, c.dono_atual_id) IS NOT NULL
    )
    SELECT
        cg.user_id,
        prof.nome AS user_nome,
        COUNT(*)::BIGINT AS cards_ganhos,
        MIN(cg.valor_final)::NUMERIC AS ticket_min,
        ROUND(AVG(cg.valor_final), 0)::NUMERIC AS ticket_medio,
        MAX(cg.valor_final)::NUMERIC AS ticket_max,
        COALESCE(SUM(cg.receita), 0)::NUMERIC AS receita_total
    FROM cards_ganhos cg
    JOIN profiles prof ON prof.id = cg.user_id
    GROUP BY cg.user_id, prof.nome
    ORDER BY receita_total DESC, COUNT(*) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_team_ticket_variation TO authenticated;
