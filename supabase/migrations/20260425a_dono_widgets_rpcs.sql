-- Fase 2 bloco 4: RPCs para DonoDashboard widgets (Dono)
-- Inclui: revenue_mom_yoy, customer_retention, top_referrers, risk_concentration, quality_score_global
-- Convenção: Todas usam Fase 1 dialeto p_date_start/p_date_end (TIMESTAMPTZ), RLS via requesting_org_id()

-- ============================================
-- RPC: analytics_revenue_mom_yoy
-- Retorna receita do mês atual, anterior e há um ano atrás
-- Dialeto Fase 1: p_date_start/p_date_end TIMESTAMPTZ
-- ============================================
CREATE OR REPLACE FUNCTION public.analytics_revenue_mom_yoy(
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
  p_date_end TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_current_month NUMERIC;
  v_prev_month NUMERIC;
  v_year_ago NUMERIC;
  v_current_date_start DATE;
  v_current_month_start DATE;
  v_prev_month_start DATE;
  v_year_ago_start DATE;
BEGIN
  -- Obter primeiro dia do mês da data_end
  v_current_month_start := DATE_TRUNC('month', p_date_end)::DATE;
  v_prev_month_start := (v_current_month_start - INTERVAL '1 month')::DATE;
  v_year_ago_start := (v_current_month_start - INTERVAL '12 months')::DATE;

  -- Mês atual (primeira dia até final do mês)
  SELECT COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado, 0)), 0) INTO v_current_month
  FROM cards c
  WHERE c.org_id = v_org
    AND c.ganho_planner = TRUE
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND (p_owner_id IS NULL OR c.vendas_owner_id = p_owner_id)
    AND c.ganho_planner_at >= v_current_month_start
    AND c.ganho_planner_at < (v_current_month_start + INTERVAL '1 month');

  -- Mês anterior
  SELECT COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado, 0)), 0) INTO v_prev_month
  FROM cards c
  WHERE c.org_id = v_org
    AND c.ganho_planner = TRUE
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND (p_owner_id IS NULL OR c.vendas_owner_id = p_owner_id)
    AND c.ganho_planner_at >= v_prev_month_start
    AND c.ganho_planner_at < v_current_month_start;

  -- Ano anterior (mesmo mês)
  SELECT COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado, 0)), 0) INTO v_year_ago
  FROM cards c
  WHERE c.org_id = v_org
    AND c.ganho_planner = TRUE
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND (p_owner_id IS NULL OR c.vendas_owner_id = p_owner_id)
    AND c.ganho_planner_at >= v_year_ago_start
    AND c.ganho_planner_at < (v_year_ago_start + INTERVAL '1 month');

  RETURN jsonb_build_object(
    'current_month_receita', v_current_month,
    'prev_month_receita', v_prev_month,
    'year_ago_receita', v_year_ago,
    'mom_change_pct', CASE WHEN v_prev_month > 0 THEN ((v_current_month - v_prev_month) / v_prev_month) * 100 ELSE 0 END,
    'yoy_change_pct', CASE WHEN v_year_ago > 0 THEN ((v_current_month - v_year_ago) / v_year_ago) * 100 ELSE 0 END
  );
END
$$;

-- ============================================
-- RPC: analytics_customer_retention
-- Retorna taxa de retorno de clientes (% com >1 ganho)
-- Dialeto Fase 2: p_from/p_to DATE
-- ============================================
CREATE OR REPLACE FUNCTION public.analytics_customer_retention(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_ids UUID[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_total BIGINT;
  v_returning BIGINT;
BEGIN
  WITH customer_wins AS (
    SELECT c.contato_id, COUNT(*) AS win_count
    FROM cards c
    WHERE
      c.org_id = v_org
      AND c.ganho_planner = TRUE
      AND c.ganho_planner_at >= p_from
      AND c.ganho_planner_at < (p_to + INTERVAL '1 day')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.vendas_owner_id = p_owner_id)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND _a_owner_ok(c.vendas_owner_id, p_owner_ids, NULL)
      AND (p_tag_ids IS NULL OR c.card_tags_ids && p_tag_ids)
    GROUP BY c.contato_id
  )
  SELECT COUNT(*), COUNT(*) FILTER (WHERE win_count > 1)
  INTO v_total, v_returning
  FROM customer_wins;

  RETURN jsonb_build_object(
    'total_customers', COALESCE(v_total, 0),
    'returning_customers', COALESCE(v_returning, 0),
    'retention_pct', CASE WHEN v_total > 0 THEN (v_returning::NUMERIC / v_total) * 100 ELSE 0 END
  );
END
$$;

-- ============================================
-- RPC: analytics_top_referrers
-- Retorna top 10 clientes que mais trouxeram referrals
-- Dialeto Fase 2: p_from/p_to DATE
-- ============================================
CREATE OR REPLACE FUNCTION public.analytics_top_referrers(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_ids UUID[] DEFAULT NULL
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
  SELECT jsonb_build_object(
    'referrers',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'contato_id', contato_id::TEXT,
          'contato_nome', contato_nome,
          'total_referred', total_referred,
          'total_revenue', total_revenue
        ) ORDER BY total_revenue DESC
      ),
      '[]'::JSONB
    )
  ) INTO v_result
  FROM (
    SELECT
      c.origem_contato_id AS contato_id,
      cto.nome AS contato_nome,
      COUNT(*) AS total_referred,
      SUM(COALESCE(c.valor_final, c.valor_estimado, 0)) AS total_revenue
    FROM cards c
    LEFT JOIN contatos cto ON cto.id = c.origem_contato_id
    WHERE
      c.org_id = v_org
      AND c.ganho_planner = TRUE
      AND c.lead_entry_path = 'referred'
      AND c.ganho_planner_at >= p_from
      AND c.ganho_planner_at < (p_to + INTERVAL '1 day')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.vendas_owner_id, p_owner_ids, NULL)
    GROUP BY c.origem_contato_id, cto.nome
    ORDER BY total_revenue DESC
    LIMIT p_limit
  ) t;

  RETURN v_result;
END
$$;

-- ============================================
-- RPC: analytics_risk_concentration
-- Retorna concentração de receita em top 3 destinos e origens
-- Dialeto Fase 2: p_from/p_to DATE
-- ============================================
CREATE OR REPLACE FUNCTION public.analytics_risk_concentration(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_total_rev NUMERIC;
  v_top3_dest_rev NUMERIC;
  v_top3_orig_rev NUMERIC;
BEGIN
  -- Total receita no período
  SELECT COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado, 0)), 0) INTO v_total_rev
  FROM cards c
  WHERE
    c.org_id = v_org
    AND c.ganho_planner = TRUE
    AND c.ganho_planner_at >= p_from
    AND c.ganho_planner_at < (p_to + INTERVAL '1 day')
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND (p_owner_id IS NULL OR c.vendas_owner_id = p_owner_id)
    AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs);

  -- Top 3 destinos
  SELECT COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado, 0)), 0) INTO v_top3_dest_rev
  FROM cards c
  WHERE
    c.org_id = v_org
    AND c.ganho_planner = TRUE
    AND c.ganho_planner_at >= p_from
    AND c.ganho_planner_at < (p_to + INTERVAL '1 day')
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND (p_owner_id IS NULL OR c.vendas_owner_id = p_owner_id)
    AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
    AND c.destino IN (
      SELECT c2.destino FROM cards c2
      WHERE
        c2.org_id = v_org
        AND c2.ganho_planner = TRUE
        AND c2.ganho_planner_at >= p_from
        AND c2.ganho_planner_at < (p_to + INTERVAL '1 day')
        AND (p_product IS NULL OR c2.produto::TEXT = p_product)
        AND (p_owner_id IS NULL OR c2.vendas_owner_id = p_owner_id)
      GROUP BY c2.destino
      ORDER BY SUM(COALESCE(c2.valor_final, c2.valor_estimado, 0)) DESC
      LIMIT 3
    );

  -- Top 3 origens
  SELECT COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado, 0)), 0) INTO v_top3_orig_rev
  FROM cards c
  WHERE
    c.org_id = v_org
    AND c.ganho_planner = TRUE
    AND c.ganho_planner_at >= p_from
    AND c.ganho_planner_at < (p_to + INTERVAL '1 day')
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND (p_owner_id IS NULL OR c.vendas_owner_id = p_owner_id)
    AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
    AND c.origem IN (
      SELECT c2.origem FROM cards c2
      WHERE
        c2.org_id = v_org
        AND c2.ganho_planner = TRUE
        AND c2.ganho_planner_at >= p_from
        AND c2.ganho_planner_at < (p_to + INTERVAL '1 day')
        AND (p_product IS NULL OR c2.produto::TEXT = p_product)
        AND (p_owner_id IS NULL OR c2.vendas_owner_id = p_owner_id)
      GROUP BY c2.origem
      ORDER BY SUM(COALESCE(c2.valor_final, c2.valor_estimado, 0)) DESC
      LIMIT 3
    );

  RETURN jsonb_build_object(
    'total_receita', v_total_rev,
    'top3_destinos_receita', v_top3_dest_rev,
    'top3_destinos_pct', CASE WHEN v_total_rev > 0 THEN (v_top3_dest_rev / v_total_rev) * 100 ELSE 0 END,
    'top3_origem_receita', v_top3_orig_rev,
    'top3_origem_pct', CASE WHEN v_total_rev > 0 THEN (v_top3_orig_rev / v_total_rev) * 100 ELSE 0 END
  );
END
$$;

-- ============================================
-- RPC: analytics_quality_score_global
-- Retorna quality score médio global de todos os cards
-- Dialeto Fase 1: p_date_start/p_date_end TIMESTAMPTZ
-- ============================================
CREATE OR REPLACE FUNCTION public.analytics_quality_score_global(
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
  p_date_end TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_avg_score NUMERIC;
  v_total BIGINT;
  v_high_quality BIGINT;
BEGIN
  SELECT
    ROUND(COALESCE(AVG(c.quality_score_pct), 0)::NUMERIC, 1),
    COUNT(*),
    COUNT(*) FILTER (WHERE c.quality_score_pct >= 80)
  INTO v_avg_score, v_total, v_high_quality
  FROM cards c
  WHERE
    c.org_id = v_org
    AND c.deleted_at IS NULL
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND (p_owner_id IS NULL OR c.vendas_owner_id = p_owner_id)
    AND c.created_at >= p_date_start
    AND c.created_at <= p_date_end;

  RETURN jsonb_build_object(
    'avg_quality_score', COALESCE(v_avg_score, 0),
    'total_cards', COALESCE(v_total, 0),
    'high_quality_count', COALESCE(v_high_quality, 0),
    'high_quality_pct', CASE WHEN v_total > 0 THEN ROUND((v_high_quality::NUMERIC / v_total) * 100, 1) ELSE 0 END
  );
END
$$;
