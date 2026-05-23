-- analytics_concierge_overview: RPC unificada pra tela Concierge.
-- Retorna JSON com múltiplos blocos: KPIs, breakdown por tipo/categoria,
-- volume mensal, e performance por concierge (do card.concierge_owner_id).

CREATE OR REPLACE FUNCTION public.analytics_concierge_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW()
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
    atendimentos_periodo AS (
        SELECT ac.*
        FROM atendimentos_concierge ac
        WHERE ac.org_id = v_org
          AND ac.created_at >= p_date_start
          AND ac.created_at < p_date_end
    ),
    kpis AS (
        SELECT
            COUNT(*)::BIGINT AS total,
            COUNT(*) FILTER (WHERE outcome = 'feito')::BIGINT AS feitos,
            COUNT(*) FILTER (WHERE outcome = 'cancelado')::BIGINT AS cancelados,
            COUNT(*) FILTER (WHERE outcome IS NULL)::BIGINT AS pendentes,
            COALESCE(AVG(EXTRACT(EPOCH FROM (outcome_em - created_at)) / 3600.0)
                FILTER (WHERE outcome = 'feito' AND outcome_em IS NOT NULL), 0)::NUMERIC AS tempo_medio_resolucao_horas
        FROM atendimentos_periodo
    ),
    por_tipo AS (
        SELECT
            tipo_concierge AS tipo,
            COUNT(*)::BIGINT AS qtd,
            COUNT(*) FILTER (WHERE outcome = 'feito')::BIGINT AS feitos
        FROM atendimentos_periodo
        GROUP BY tipo_concierge
        ORDER BY qtd DESC
    ),
    por_categoria AS (
        SELECT
            categoria,
            COUNT(*)::BIGINT AS qtd
        FROM atendimentos_periodo
        GROUP BY categoria
        ORDER BY qtd DESC
    ),
    volume_mensal AS (
        SELECT
            DATE_TRUNC('month', created_at)::DATE AS mes,
            COUNT(*)::BIGINT AS qtd
        FROM atendimentos_periodo
        GROUP BY 1
        ORDER BY 1 ASC
    ),
    por_concierge AS (
        -- Por dono do card (cards.concierge_owner_id) — esse é quem "atende" a viagem
        SELECT
            c.concierge_owner_id AS user_id,
            prof.nome AS user_nome,
            COUNT(ac.id)::BIGINT AS atendimentos,
            COUNT(ac.id) FILTER (WHERE ac.outcome = 'feito')::BIGINT AS feitos,
            COUNT(ac.id) FILTER (WHERE ac.outcome IS NULL)::BIGINT AS pendentes,
            COALESCE(AVG(EXTRACT(EPOCH FROM (ac.outcome_em - ac.created_at)) / 3600.0)
                FILTER (WHERE ac.outcome = 'feito' AND ac.outcome_em IS NOT NULL), 0)::NUMERIC AS tempo_medio_h
        FROM atendimentos_periodo ac
        JOIN cards c ON c.id = ac.card_id
        LEFT JOIN profiles prof ON prof.id = c.concierge_owner_id
        WHERE c.concierge_owner_id IS NOT NULL
        GROUP BY c.concierge_owner_id, prof.nome
        ORDER BY atendimentos DESC
        LIMIT 50
    ),
    cobertura AS (
        -- % cards em pos_venda com pelo menos 1 atendimento no período
        SELECT
            COUNT(DISTINCT c.id)::BIGINT AS cards_pos_venda,
            COUNT(DISTINCT c.id) FILTER (
                WHERE EXISTS (SELECT 1 FROM atendimentos_periodo ap WHERE ap.card_id = c.id)
            )::BIGINT AS cards_com_atendimento
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE c.org_id = v_org
          AND pp.slug = 'pos_venda'
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT row_to_json(k.*) FROM kpis k),
        'cobertura', (SELECT row_to_json(c.*) FROM cobertura c),
        'por_tipo', COALESCE((SELECT jsonb_agg(row_to_json(t.*)) FROM por_tipo t), '[]'::jsonb),
        'por_categoria', COALESCE((SELECT jsonb_agg(row_to_json(c.*)) FROM por_categoria c), '[]'::jsonb),
        'volume_mensal', COALESCE((SELECT jsonb_agg(row_to_json(v.*)) FROM volume_mensal v), '[]'::jsonb),
        'por_concierge', COALESCE((SELECT jsonb_agg(row_to_json(p.*)) FROM por_concierge p), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_concierge_overview TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- analytics_concierge_pendentes_criticos
-- Atendimentos pendentes (outcome IS NULL) ordenados por urgência
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.analytics_concierge_pendentes(
    p_limit INT DEFAULT 50
)
RETURNS TABLE(
    atendimento_id   UUID,
    card_id          UUID,
    card_titulo      TEXT,
    tipo_concierge   TEXT,
    categoria        TEXT,
    origem_descricao TEXT,
    concierge_nome   TEXT,
    created_at       TIMESTAMPTZ,
    horas_aberto     NUMERIC,
    total_count      BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH pendentes AS (
        SELECT
            ac.id,
            ac.card_id,
            c.titulo AS card_titulo,
            ac.tipo_concierge,
            ac.categoria,
            ac.origem_descricao,
            prof.nome AS concierge_nome,
            ac.created_at,
            EXTRACT(EPOCH FROM (NOW() - ac.created_at)) / 3600.0 AS horas_aberto
        FROM atendimentos_concierge ac
        JOIN cards c ON c.id = ac.card_id
        LEFT JOIN profiles prof ON prof.id = c.concierge_owner_id
        WHERE ac.org_id = v_org
          AND ac.outcome IS NULL
    ),
    totals AS (SELECT COUNT(*)::BIGINT AS t FROM pendentes)
    SELECT
        p.id AS atendimento_id,
        p.card_id,
        p.card_titulo,
        p.tipo_concierge,
        p.categoria,
        p.origem_descricao,
        p.concierge_nome,
        p.created_at,
        ROUND(p.horas_aberto, 1) AS horas_aberto,
        (SELECT t FROM totals) AS total_count
    FROM pendentes p
    ORDER BY p.created_at ASC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_concierge_pendentes TO authenticated;
