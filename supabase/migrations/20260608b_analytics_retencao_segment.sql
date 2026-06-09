-- ════════════════════════════════════════════════════════════════════════
-- Retenção segmentável: analytics_retencao_cohort ganha p_owner_ids + p_origens
--
-- Hoje a tela de Retenção ignora os filtros globais (só month-range + produto).
-- Gestor quer cruzar cenários: "retenção dos clientes de origem X" ou "que o
-- consultor Y fechou". Adiciona 2 params no FIM (default NULL = comportamento atual
-- byte-a-byte). Só a CTE base `cliente_ganhos` ganha 2 filtros opcionais.
-- Versão vigente preservada: 20260523l_analytics_retencao_cohort.sql.
-- DROP do overload (int, text) antes de recriar (int, text, uuid[], text[]).
-- ════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.analytics_retencao_cohort(int, text);

CREATE FUNCTION public.analytics_retencao_cohort(
    p_months_back INT      DEFAULT 12,
    p_product     TEXT     DEFAULT NULL,
    p_owner_ids   UUID[]   DEFAULT NULL,
    p_origens     TEXT[]   DEFAULT NULL
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
    -- Clientes únicos com seus ganhos (segmentável por dono/origem)
    cliente_ganhos AS (
        SELECT
            c.pessoa_principal_id AS cliente_id,
            c.data_fechamento::DATE AS data_ganho,
            c.valor_final,
            c.receita,
            ROW_NUMBER() OVER (PARTITION BY c.pessoa_principal_id ORDER BY c.data_fechamento ASC) AS ordem
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'ganho'
          AND c.data_fechamento IS NOT NULL
          AND c.pessoa_principal_id IS NOT NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND (p_owner_ids IS NULL OR COALESCE(c.vendas_owner_id, c.dono_atual_id) = ANY(p_owner_ids))
          AND (p_origens IS NULL OR COALESCE(c.origem::TEXT, 'sem_origem') = ANY(p_origens))
    ),
    primeiras_compras AS (
        SELECT cliente_id, data_ganho AS primeira_data,
               DATE_TRUNC('month', data_ganho)::DATE AS cohort_mes,
               valor_final AS primeiro_ticket
        FROM cliente_ganhos
        WHERE ordem = 1
          AND data_ganho >= DATE_TRUNC('month', NOW() - (p_months_back || ' months')::INTERVAL)
    ),
    -- Pra cada cliente que comprou de novo, calcula meses de gap
    repeats AS (
        SELECT
            pc.cohort_mes,
            pc.cliente_id,
            pc.primeira_data,
            cg.data_ganho AS data_retorno,
            (EXTRACT(YEAR FROM AGE(cg.data_ganho, pc.primeira_data)) * 12
             + EXTRACT(MONTH FROM AGE(cg.data_ganho, pc.primeira_data)))::INT AS meses_gap,
            cg.valor_final AS ticket_retorno
        FROM primeiras_compras pc
        JOIN cliente_ganhos cg ON cg.cliente_id = pc.cliente_id AND cg.ordem > 1
    ),
    -- KPIs gerais
    kpis AS (
        SELECT
            (SELECT COUNT(DISTINCT cliente_id) FROM primeiras_compras)::BIGINT AS clientes_novos_periodo,
            (SELECT COUNT(DISTINCT cliente_id) FROM repeats)::BIGINT AS clientes_que_voltaram,
            (SELECT COALESCE(AVG(primeiro_ticket), 0)::NUMERIC FROM primeiras_compras) AS ticket_medio_novo,
            (SELECT COALESCE(AVG(ticket_retorno), 0)::NUMERIC FROM repeats) AS ticket_medio_repeat
    ),
    -- Cohort table: por mês de cohort, % e qtd que voltaram
    cohort_table AS (
        SELECT
            pc.cohort_mes,
            COUNT(DISTINCT pc.cliente_id)::BIGINT AS tamanho,
            COUNT(DISTINCT r.cliente_id)::BIGINT AS retornaram,
            CASE WHEN COUNT(DISTINCT pc.cliente_id) > 0
                 THEN ROUND(COUNT(DISTINCT r.cliente_id)::NUMERIC / COUNT(DISTINCT pc.cliente_id) * 100, 1)
                 ELSE 0 END AS taxa_retorno
        FROM primeiras_compras pc
        LEFT JOIN repeats r ON r.cliente_id = pc.cliente_id
        GROUP BY pc.cohort_mes
        ORDER BY pc.cohort_mes DESC
    ),
    -- Tempo até voltar (buckets)
    tempo_para_voltar AS (
        SELECT
            CASE
                WHEN meses_gap <= 3 THEN '0-3m'
                WHEN meses_gap <= 6 THEN '4-6m'
                WHEN meses_gap <= 12 THEN '7-12m'
                WHEN meses_gap <= 24 THEN '13-24m'
                ELSE '24m+'
            END AS bucket,
            COUNT(*)::BIGINT AS qtd
        FROM repeats
        GROUP BY 1
        ORDER BY MIN(meses_gap)
    ),
    -- Top clientes recorrentes
    top_repeats AS (
        SELECT
            cg.cliente_id,
            pe.nome AS cliente_nome,
            COUNT(*)::BIGINT AS total_viagens,
            COALESCE(SUM(cg.valor_final), 0)::NUMERIC AS lifetime_value
        FROM cliente_ganhos cg
        LEFT JOIN contatos pe ON pe.id = cg.cliente_id
        GROUP BY cg.cliente_id, pe.nome
        HAVING COUNT(*) >= 2
        ORDER BY total_viagens DESC, lifetime_value DESC
        LIMIT 20
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT row_to_json(k.*) FROM kpis k),
        'cohort_table', COALESCE((SELECT jsonb_agg(row_to_json(c.*)) FROM cohort_table c), '[]'::jsonb),
        'tempo_para_voltar', COALESCE((SELECT jsonb_agg(row_to_json(t.*)) FROM tempo_para_voltar t), '[]'::jsonb),
        'top_repeats', COALESCE((SELECT jsonb_agg(row_to_json(r.*)) FROM top_repeats r), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_retencao_cohort(int, text, uuid[], text[]) TO authenticated;
