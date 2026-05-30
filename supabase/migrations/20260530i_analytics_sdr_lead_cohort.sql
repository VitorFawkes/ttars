-- Nova RPC: analytics_sdr_lead_cohort — evolução dos leads (jornada SDR → venda) por coorte de ENTRADA.
-- Responde: "dos N leads que entraram no mês X, quantos viraram venda / foram perdidos / seguem abertos,
-- qual a conversão, e em quanto tempo fecham". Tudo count-based (confiável) + conversão por origem.
--
-- Decisões de dados (validadas contra prod em 2026-05-30):
--  - Coorte por created_at (entrada). ganho_sdr_at é populado de forma esparsa em prod → NÃO ancorar nele.
--  - "Ganho" = status_comercial='ganho' (confiável). Valor = COALESCE(valor_final, valor_estimado, 0).
--  - Tempo até fechar (data_fechamento - created_at): ~85% caem "no mesmo dia" (importação/fechamento
--    rápido). Por isso a mediana de ciclo só conta deals com cycle real (>0); os buckets mostram o
--    "mesmo dia" separado, pra o gestor enxergar a realidade do dado sem ser enganado.
--  - Isolamento: org_id = requesting_org_id(), produto::TEXT, exclui sub_card e deleted/archived.

CREATE OR REPLACE FUNCTION public.analytics_sdr_lead_cohort(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '6 months'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT   DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_origens    TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_org UUID := requesting_org_id();
    v_result JSONB;
    v_has_owner   BOOLEAN := p_owner_ids IS NOT NULL AND array_length(p_owner_ids, 1) > 0;
    v_has_origens BOOLEAN := p_origens IS NOT NULL AND array_length(p_origens, 1) > 0;
BEGIN
    WITH base AS (
        SELECT
            c.id,
            c.created_at,
            c.origem,
            c.ganho_sdr_at,
            c.data_fechamento,
            c.status_comercial,
            COALESCE(c.valor_final, c.valor_estimado, 0) AS valor,
            DATE_TRUNC('month', c.created_at)::DATE AS cohort_mes
        FROM cards c
        WHERE c.org_id = v_org
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.created_at >= p_date_start AND c.created_at < p_date_end
          AND (NOT v_has_owner OR c.sdr_owner_id = ANY(p_owner_ids) OR c.dono_atual_id = ANY(p_owner_ids))
          AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
    ),
    cohort AS (
        SELECT
            cohort_mes,
            COUNT(*)::BIGINT AS leads,
            COUNT(*) FILTER (WHERE status_comercial = 'ganho')::BIGINT AS ganhos,
            COUNT(*) FILTER (WHERE status_comercial = 'perdido')::BIGINT AS perdidos,
            COUNT(*) FILTER (WHERE status_comercial NOT IN ('ganho','perdido'))::BIGINT AS abertos,
            COUNT(*) FILTER (WHERE ganho_sdr_at IS NOT NULL)::BIGINT AS qualificados_sdr,
            COALESCE(SUM(valor) FILTER (WHERE status_comercial = 'ganho'), 0)::NUMERIC AS ganhos_valor,
            CASE WHEN COUNT(*) > 0
                 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status_comercial = 'ganho') / COUNT(*), 1)
                 ELSE 0 END AS conv_pct,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (data_fechamento - created_at)) / 86400.0)
                FILTER (WHERE status_comercial = 'ganho' AND data_fechamento IS NOT NULL
                            AND data_fechamento > created_at))::NUMERIC AS mediana_dias_ganho
        FROM base
        GROUP BY cohort_mes
        ORDER BY cohort_mes
    ),
    tempo AS (
        SELECT
            COUNT(*) FILTER (WHERE d < 1)::BIGINT                  AS mesmo_dia,
            COUNT(*) FILTER (WHERE d >= 1  AND d < 7)::BIGINT       AS d1_7,
            COUNT(*) FILTER (WHERE d >= 7  AND d < 30)::BIGINT      AS d7_30,
            COUNT(*) FILTER (WHERE d >= 30 AND d < 60)::BIGINT      AS d30_60,
            COUNT(*) FILTER (WHERE d >= 60 AND d < 90)::BIGINT      AS d60_90,
            COUNT(*) FILTER (WHERE d >= 90)::BIGINT                 AS d90_mais
        FROM (
            SELECT EXTRACT(EPOCH FROM (data_fechamento - created_at)) / 86400.0 AS d
            FROM base
            WHERE status_comercial = 'ganho' AND data_fechamento IS NOT NULL
        ) t
    ),
    por_origem AS (
        SELECT
            COALESCE(origem::TEXT, 'sem_origem') AS origem,
            COUNT(*)::BIGINT AS leads,
            COUNT(*) FILTER (WHERE status_comercial = 'ganho')::BIGINT AS ganhos,
            COALESCE(SUM(valor) FILTER (WHERE status_comercial = 'ganho'), 0)::NUMERIC AS ganhos_valor,
            CASE WHEN COUNT(*) > 0
                 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status_comercial = 'ganho') / COUNT(*), 1)
                 ELSE 0 END AS conv_pct
        FROM base
        GROUP BY 1
        ORDER BY leads DESC
    ),
    kpis AS (
        SELECT
            COUNT(*)::BIGINT AS total_leads,
            COUNT(*) FILTER (WHERE status_comercial = 'ganho')::BIGINT AS total_ganhos,
            COUNT(*) FILTER (WHERE status_comercial = 'perdido')::BIGINT AS total_perdidos,
            COUNT(*) FILTER (WHERE status_comercial NOT IN ('ganho','perdido'))::BIGINT AS total_abertos,
            CASE WHEN COUNT(*) > 0
                 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status_comercial = 'ganho') / COUNT(*), 1)
                 ELSE 0 END AS conv_pct,
            ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (data_fechamento - created_at)) / 86400.0)
                FILTER (WHERE status_comercial = 'ganho' AND data_fechamento IS NOT NULL
                            AND data_fechamento > created_at))::NUMERIC AS mediana_dias_ganho
        FROM base
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT row_to_json(k.*) FROM kpis k),
        'cohort', COALESCE((SELECT jsonb_agg(row_to_json(c.*)) FROM cohort c), '[]'::jsonb),
        'tempo_buckets', (SELECT row_to_json(t.*) FROM tempo t),
        'por_origem', COALESCE((SELECT jsonb_agg(row_to_json(o.*)) FROM por_origem o), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.analytics_sdr_lead_cohort TO authenticated;