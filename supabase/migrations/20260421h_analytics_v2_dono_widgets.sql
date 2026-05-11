-- =========================================================================
-- Fase 2 Analytics v2 — DonoDashboard (7 widgets)
--
-- 1. analytics_revenue_mom_yoy — Receita MoM e YoY vs períodos anteriores
-- 2. analytics_customer_retention — Taxa de retorno (% clientes com >1 ganho)
-- 3. analytics_top_referrers — Top 10 clientes que mais trouxeram referral
-- 4. analytics_risk_concentration — % receita em top 3 destinos e fontes
-- 5. analytics_quality_score_global — Agregado de quality_score_pct
-- 6. analytics_targets — tabela de metas por métrica/mês
-- 7. AlertsPanel — usa dados das RPCs acima (threshold-based)
-- =========================================================================

-- =========================================================================
-- TABELA: analytics_targets (metas por métrica/período)
-- =========================================================================
CREATE TABLE IF NOT EXISTS analytics_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  produto TEXT NOT NULL, -- 'TRIPS', 'WEDDING', etc (matches pipelines.produto)
  metric_key TEXT NOT NULL, -- 'receita', 'ganhos_planner', 'conversao_total', etc
  month DATE NOT NULL, -- Primeiro dia do mês (YYYY-MM-01)
  target_value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, produto, metric_key, month)
);

COMMENT ON TABLE analytics_targets IS 'Metas editáveis por métrica/período. RLS: org_id = requesting_org_id(). Global allowlist: sim.';

CREATE INDEX idx_analytics_targets_org_produto ON analytics_targets(org_id, produto, month);

ALTER TABLE analytics_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY analytics_targets_org ON analytics_targets TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY analytics_targets_service ON analytics_targets TO service_role
  USING (true) WITH CHECK (true);

-- =========================================================================
-- 1) analytics_revenue_mom_yoy
-- Retorna receita do mês atual, mês anterior e ano anterior para comparação.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.analytics_revenue_mom_yoy(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_current_month_start DATE;
  v_current_month_end DATE;
  v_prev_month_start DATE;
  v_prev_month_end DATE;
  v_year_ago_month_start DATE;
  v_year_ago_month_end DATE;
  v_current_receita NUMERIC;
  v_prev_month_receita NUMERIC;
  v_year_ago_receita NUMERIC;
  v_mom_change NUMERIC;
  v_yoy_change NUMERIC;
BEGIN
  -- Determina primeiro/último dia do período atual
  v_current_month_start := (p_to - INTERVAL '0 days')::date - ((p_to - INTERVAL '0 days')::date - DATE_TRUNC('month', p_to)::date);
  v_current_month_start := DATE_TRUNC('month', p_to)::date;
  v_current_month_end := (DATE_TRUNC('month', p_to) + INTERVAL '1 month' - INTERVAL '1 day')::date;

  -- Mês anterior
  v_prev_month_start := (DATE_TRUNC('month', p_to) - INTERVAL '1 month')::date;
  v_prev_month_end := (DATE_TRUNC('month', p_to) - INTERVAL '1 day')::date;

  -- Mesmo mês ano anterior
  v_year_ago_month_start := (DATE_TRUNC('month', p_to - INTERVAL '12 months'))::date;
  v_year_ago_month_end := ((DATE_TRUNC('month', p_to - INTERVAL '12 months') + INTERVAL '1 month') - INTERVAL '1 day')::date;

  -- Receita atual
  SELECT COALESCE(SUM(c.valor_final), 0)::NUMERIC INTO v_current_receita
  FROM cards c
  WHERE c.org_id = v_org
    AND c.deleted_at IS NULL
    AND c.ganho_planner_at >= v_current_month_start::TIMESTAMPTZ
    AND c.ganho_planner_at <= (v_current_month_end::TIMESTAMPTZ + INTERVAL '1 day')
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND _a_origem_ok(c.origem, p_origem)
    AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
    AND _a_destino_ok(c.produto_data, p_destinos)
    AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
    AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs);

  -- Receita mês anterior
  SELECT COALESCE(SUM(c.valor_final), 0)::NUMERIC INTO v_prev_month_receita
  FROM cards c
  WHERE c.org_id = v_org
    AND c.deleted_at IS NULL
    AND c.ganho_planner_at >= v_prev_month_start::TIMESTAMPTZ
    AND c.ganho_planner_at <= (v_prev_month_end::TIMESTAMPTZ + INTERVAL '1 day')
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND _a_origem_ok(c.origem, p_origem)
    AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
    AND _a_destino_ok(c.produto_data, p_destinos)
    AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
    AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs);

  -- Receita mesmo mês ano anterior
  SELECT COALESCE(SUM(c.valor_final), 0)::NUMERIC INTO v_year_ago_receita
  FROM cards c
  WHERE c.org_id = v_org
    AND c.deleted_at IS NULL
    AND c.ganho_planner_at >= v_year_ago_month_start::TIMESTAMPTZ
    AND c.ganho_planner_at <= (v_year_ago_month_end::TIMESTAMPTZ + INTERVAL '1 day')
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND _a_origem_ok(c.origem, p_origem)
    AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
    AND _a_destino_ok(c.produto_data, p_destinos)
    AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
    AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs);

  -- Calcula variações percentuais
  v_mom_change := CASE WHEN v_prev_month_receita > 0 THEN ((v_current_receita - v_prev_month_receita) / v_prev_month_receita * 100)::NUMERIC ELSE 0 END;
  v_yoy_change := CASE WHEN v_year_ago_receita > 0 THEN ((v_current_receita - v_year_ago_receita) / v_year_ago_receita * 100)::NUMERIC ELSE 0 END;

  RETURN jsonb_build_object(
    'current_month_receita', v_current_receita,
    'prev_month_receita', v_prev_month_receita,
    'year_ago_receita', v_year_ago_receita,
    'mom_change_pct', v_mom_change,
    'yoy_change_pct', v_yoy_change
  );
END;
$$;

-- =========================================================================
-- 2) analytics_customer_retention
-- Taxa de retorno: % de clientes (by contato) com >1 card ganho.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.analytics_customer_retention(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_total_customers INT;
  v_returning_customers INT;
  v_retention_pct NUMERIC;
BEGIN
  WITH customers AS (
    SELECT DISTINCT c.contato_id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.ganho_planner_at >= p_from
      AND c.ganho_planner_at <= (p_to::date + INTERVAL '1 day')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
  ),
  returning_customers AS (
    SELECT c.contato_id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.ganho_planner_at >= p_from
      AND c.ganho_planner_at <= (p_to::date + INTERVAL '1 day')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
    GROUP BY c.contato_id
    HAVING COUNT(*) > 1
  )
  SELECT COUNT(DISTINCT c.contato_id) INTO v_total_customers FROM customers c;
  SELECT COUNT(DISTINCT rc.contato_id) INTO v_returning_customers FROM returning_customers rc;

  v_retention_pct := CASE WHEN v_total_customers > 0 THEN (v_returning_customers::NUMERIC / v_total_customers * 100)::NUMERIC ELSE 0 END;

  RETURN jsonb_build_object(
    'total_customers', v_total_customers,
    'returning_customers', v_returning_customers,
    'retention_pct', v_retention_pct
  );
END;
$$;

-- =========================================================================
-- 3) analytics_top_referrers
-- Top 10 contatos que mais trouxeram referrals (entry_path='referred').
-- =========================================================================
CREATE OR REPLACE FUNCTION public.analytics_top_referrers(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL
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
    'referrers', COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'contato_id', ct.id,
          'contato_nome', ct.nome,
          'total_referred', cnt.cnt,
          'total_revenue', COALESCE(SUM(c.valor_final), 0)
        )
        ORDER BY cnt.cnt DESC
      ),
      '[]'::jsonb
    )
  ) INTO v_result
  FROM (
    SELECT DISTINCT c.contato_id, COUNT(*) AS cnt
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.lead_entry_path = 'referred'
      AND c.ganho_planner_at >= p_from
      AND c.ganho_planner_at <= (p_to::date + INTERVAL '1 day')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
    GROUP BY c.contato_id
    ORDER BY cnt DESC
    LIMIT p_limit
  ) cnt
  LEFT JOIN contatos ct ON ct.id = cnt.contato_id
  LEFT JOIN cards c ON c.contato_id = cnt.contato_id
    AND c.org_id = v_org
    AND c.deleted_at IS NULL
    AND c.lead_entry_path = 'referred'
    AND c.ganho_planner_at >= p_from
    AND c.ganho_planner_at <= (p_to::date + INTERVAL '1 day')
  GROUP BY ct.id, ct.nome, cnt.cnt;

  RETURN v_result;
END;
$$;

-- =========================================================================
-- 4) analytics_risk_concentration
-- % receita em top 3 destinos e top 3 origens.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.analytics_risk_concentration(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
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
  v_total_receita NUMERIC;
  v_top3_dest_receita NUMERIC;
  v_top3_origem_receita NUMERIC;
  v_dest_concentration NUMERIC;
  v_origem_concentration NUMERIC;
BEGIN
  -- Total geral
  SELECT COALESCE(SUM(c.valor_final), 0)::NUMERIC INTO v_total_receita
  FROM cards c
  WHERE c.org_id = v_org
    AND c.deleted_at IS NULL
    AND c.ganho_planner_at >= p_from
    AND c.ganho_planner_at <= (p_to::date + INTERVAL '1 day')
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
    AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs);

  -- Top 3 destinos
  SELECT COALESCE(SUM(c.valor_final), 0)::NUMERIC INTO v_top3_dest_receita
  FROM cards c
  WHERE c.org_id = v_org
    AND c.deleted_at IS NULL
    AND c.ganho_planner_at >= p_from
    AND c.ganho_planner_at <= (p_to::date + INTERVAL '1 day')
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
    AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
    AND c.id IN (
      SELECT DISTINCT c2.id
      FROM cards c2
      WHERE c2.org_id = v_org
        AND c2.deleted_at IS NULL
        AND c2.ganho_planner_at >= p_from
        AND c2.ganho_planner_at <= (p_to::date + INTERVAL '1 day')
      ORDER BY (c2.produto_data->>'destino') ASC
      LIMIT 3
    );

  -- Top 3 origens
  SELECT COALESCE(SUM(c.valor_final), 0)::NUMERIC INTO v_top3_origem_receita
  FROM cards c
  WHERE c.org_id = v_org
    AND c.deleted_at IS NULL
    AND c.ganho_planner_at >= p_from
    AND c.ganho_planner_at <= (p_to::date + INTERVAL '1 day')
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
    AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
    AND c.origem IN (
      SELECT c2.origem
      FROM cards c2
      WHERE c2.org_id = v_org
        AND c2.deleted_at IS NULL
        AND c2.ganho_planner_at >= p_from
        AND c2.ganho_planner_at <= (p_to::date + INTERVAL '1 day')
        AND c2.origem IS NOT NULL
      GROUP BY c2.origem
      ORDER BY SUM(COALESCE(c2.valor_final, 0)) DESC
      LIMIT 3
    );

  v_dest_concentration := CASE WHEN v_total_receita > 0 THEN (v_top3_dest_receita / v_total_receita * 100)::NUMERIC ELSE 0 END;
  v_origem_concentration := CASE WHEN v_total_receita > 0 THEN (v_top3_origem_receita / v_total_receita * 100)::NUMERIC ELSE 0 END;

  RETURN jsonb_build_object(
    'total_receita', v_total_receita,
    'top3_destinos_receita', v_top3_dest_receita,
    'top3_destinos_pct', v_dest_concentration,
    'top3_origem_receita', v_top3_origem_receita,
    'top3_origem_pct', v_origem_concentration
  );
END;
$$;

-- =========================================================================
-- 5) analytics_quality_score_global
-- Agregado de quality_score_pct de todos os cards.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.analytics_quality_score_global(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_avg_score NUMERIC;
  v_total_cards INT;
  v_high_quality INT;
BEGIN
  SELECT
    ROUND(AVG(COALESCE(c.quality_score_pct, 0)))::NUMERIC,
    COUNT(*),
    COUNT(*) FILTER (WHERE COALESCE(c.quality_score_pct, 0) >= 80)
  INTO v_avg_score, v_total_cards, v_high_quality
  FROM cards c
  WHERE c.org_id = v_org
    AND c.deleted_at IS NULL
    AND c.stage_entered_at >= p_from
    AND c.stage_entered_at <= (p_to::date + INTERVAL '1 day')
    AND (p_product IS NULL OR c.produto::TEXT = p_product)
    AND _a_origem_ok(c.origem, p_origem)
    AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
    AND _a_destino_ok(c.produto_data, p_destinos)
    AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
    AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs);

  RETURN jsonb_build_object(
    'avg_quality_score', COALESCE(v_avg_score, 0),
    'total_cards', COALESCE(v_total_cards, 0),
    'high_quality_count', COALESCE(v_high_quality, 0),
    'high_quality_pct', CASE WHEN v_total_cards > 0 THEN (v_high_quality::NUMERIC / v_total_cards * 100)::NUMERIC ELSE 0 END
  );
END;
$$;
