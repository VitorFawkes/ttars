-- analytics_financeiro_overview: hub financeiro (receita, faturamento, margem, breakdown)

CREATE OR REPLACE FUNCTION public.analytics_financeiro_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_result JSONB;
BEGIN
    WITH
    ganhos AS (
        SELECT
            c.id,
            c.valor_final,
            c.receita,
            c.origem,
            c.data_fechamento,
            c.vendas_owner_id,
            c.dono_atual_id
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'ganho'
          AND c.data_fechamento >= p_date_start
          AND c.data_fechamento < p_date_end
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    kpis AS (
        SELECT
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(receita), 0)::NUMERIC AS receita,
            CASE WHEN SUM(valor_final) > 0
                 THEN ROUND(SUM(receita) / SUM(valor_final) * 100, 1)
                 ELSE 0 END AS margem_pct,
            CASE WHEN COUNT(*) > 0
                 THEN ROUND(SUM(valor_final) / COUNT(*), 0)
                 ELSE 0 END::NUMERIC AS ticket_medio
        FROM ganhos
    ),
    -- Faturamento + receita por mês (sparkline 12m)
    serie_mensal AS (
        SELECT
            DATE_TRUNC('month', c.data_fechamento)::DATE AS mes,
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(c.valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(c.receita), 0)::NUMERIC AS receita
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'ganho'
          AND c.data_fechamento >= DATE_TRUNC('month', NOW() - INTERVAL '11 months')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
        GROUP BY 1
        ORDER BY 1
    ),
    -- Por origem
    por_origem AS (
        SELECT
            COALESCE(origem::TEXT, 'sem_origem') AS origem,
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(receita), 0)::NUMERIC AS receita,
            CASE WHEN SUM(valor_final) > 0
                 THEN ROUND(SUM(receita) / SUM(valor_final) * 100, 1)
                 ELSE 0 END AS margem_pct
        FROM ganhos
        GROUP BY 1
        ORDER BY faturamento DESC
    ),
    -- Por consultor (vendas_owner_id ou dono_atual_id)
    por_consultor AS (
        SELECT
            COALESCE(g.vendas_owner_id, g.dono_atual_id) AS user_id,
            prof.nome AS user_nome,
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(g.valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(g.receita), 0)::NUMERIC AS receita
        FROM ganhos g
        LEFT JOIN profiles prof ON prof.id = COALESCE(g.vendas_owner_id, g.dono_atual_id)
        WHERE COALESCE(g.vendas_owner_id, g.dono_atual_id) IS NOT NULL
        GROUP BY 1, prof.nome
        ORDER BY faturamento DESC
        LIMIT 20
    ),
    -- Pendente: cards abertos com data_prevista_fechamento dentro do período
    pendente AS (
        SELECT
            COUNT(*)::BIGINT AS qtd_pendente,
            COALESCE(SUM(_extract_orcamento_numeric(c.produto_data)), 0)::NUMERIC AS valor_pendente
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'aberto'
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND (c.produto_data->>'data_prevista_fechamento')::DATE BETWEEN p_date_start::DATE AND p_date_end::DATE
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT row_to_json(k.*) FROM kpis k),
        'pendente', (SELECT row_to_json(p.*) FROM pendente p),
        'serie_mensal', COALESCE((SELECT jsonb_agg(row_to_json(s.*)) FROM serie_mensal s), '[]'::jsonb),
        'por_origem', COALESCE((SELECT jsonb_agg(row_to_json(o.*)) FROM por_origem o), '[]'::jsonb),
        'por_consultor', COALESCE((SELECT jsonb_agg(row_to_json(p.*)) FROM por_consultor p), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_financeiro_overview TO authenticated;
