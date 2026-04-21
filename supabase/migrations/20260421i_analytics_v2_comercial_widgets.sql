-- =========================================================================
-- Analytics v2 — Widgets ComercialDashboard
--
-- 6 RPCs novas para ComercialDashboard:
-- 1. analytics_forecast_ponderado    — forecast 30/60/90d com probabilidades por etapa
-- 2. analytics_loss_reasons_v2        — motivos de perda agregados (top 10)
-- 3. analytics_conversion_by_ticket   — conversão × ticket por fonte (scatter)
-- 4. analytics_stage_velocity_percentiles — velocidade (p50/p75) por etapa
-- 5. (cadence_compliance replicado do SDR — já existe)
-- 6. analytics_quality_score_v2       — score composto global
--
-- =========================================================================

-- Tabela auxiliar: probabilidade de ganho por etapa
CREATE TABLE IF NOT EXISTS public.stage_win_probability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  probability NUMERIC(5,3) NOT NULL CHECK (probability >= 0 AND probability <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, pipeline_id, stage_id)
);

CREATE INDEX idx_stage_win_probability_org_pipeline ON stage_win_probability(org_id, pipeline_id);

ALTER TABLE public.stage_win_probability ENABLE ROW LEVEL SECURITY;

CREATE POLICY stage_win_probability_org ON public.stage_win_probability
  TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY stage_win_probability_service ON public.stage_win_probability
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Seed com defaults: 10% → 25% → 50% → 75% conforme ordem
-- (não fazer no migration, deixa pro trigger/on-demand)

-- =========================================================================
-- 1. analytics_forecast_ponderado
-- Forecast 30/60/90d: soma de (probabilidade_etapa × valor_card)
-- Janelas: hoje+30d, hoje+60d, hoje+90d (usando data_viagem_fim se disponível)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.analytics_forecast_ponderado(
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
  v_result JSONB;
BEGIN
  WITH open_cards AS (
    SELECT
      c.id,
      c.pipeline_stage_id,
      s.pipeline_id,
      COALESCE(c.valor_final, c.valor_estimado, 0) AS valor,
      COALESCE(c.data_viagem_fim::date, CURRENT_DATE + INTERVAL '45 days') AS expected_close
    FROM cards c
    JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.ganho IS FALSE
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
  ),
  with_probs AS (
    SELECT
      oc.*,
      COALESCE(swp.probability, 0.5) AS prob
    FROM open_cards oc
    LEFT JOIN stage_win_probability swp
      ON swp.org_id = v_org
      AND swp.pipeline_id = oc.pipeline_id
      AND swp.stage_id = oc.pipeline_stage_id
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN expected_close <= CURRENT_DATE + INTERVAL '30 days' THEN '30d'
        WHEN expected_close <= CURRENT_DATE + INTERVAL '60 days' THEN '60d'
        WHEN expected_close <= CURRENT_DATE + INTERVAL '90 days' THEN '90d'
        ELSE 'beyond'
      END AS bucket,
      ROUND(SUM(valor * prob)::numeric, 2) AS forecast
    FROM with_probs
    GROUP BY bucket
  )
  SELECT jsonb_build_object(
    'forecast_30d', COALESCE((SELECT forecast FROM bucketed WHERE bucket = '30d'), 0),
    'forecast_60d', COALESCE((SELECT forecast FROM bucketed WHERE bucket = '60d'), 0),
    'forecast_90d', COALESCE((SELECT forecast FROM bucketed WHERE bucket = '90d'), 0)
  ) INTO v_result;

  RETURN v_result;
END
$$;

-- =========================================================================
-- 2. analytics_loss_reasons_v2
-- Motivos de perda: agrupa cards ganho=false com motivo_perda, top 10
-- =========================================================================

CREATE OR REPLACE FUNCTION public.analytics_loss_reasons_v2(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10
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
  WITH lost_cards AS (
    SELECT
      COALESCE(c.motivo_perda, 'Não informado') AS reason,
      COUNT(*) AS count,
      COALESCE(SUM(c.valor_final), SUM(c.valor_estimado), 0) AS total_valor
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.ganho IS FALSE
      AND c.perdido_em >= p_from
      AND c.perdido_em < (p_to + INTERVAL '1 day')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
    GROUP BY reason
    ORDER BY count DESC
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
    'reasons', COALESCE(jsonb_agg(jsonb_build_object(
      'reason', reason,
      'count', count,
      'total_valor', total_valor
    ) ORDER BY count DESC), '[]'::jsonb)
  ) INTO v_result
  FROM lost_cards;

  RETURN v_result;
END
$$;

-- =========================================================================
-- 3. analytics_conversion_by_ticket
-- Conversão × ticket: dados pra scatter plot
-- Grupos: origem (ou outra dimensão configurável)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.analytics_conversion_by_ticket(
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
  v_result JSONB;
BEGIN
  WITH origem_stats AS (
    SELECT
      COALESCE(c.origem, 'Desconhecido') AS source,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE c.ganho IS TRUE) AS won,
      ROUND(100.0 * COUNT(*) FILTER (WHERE c.ganho IS TRUE) / NULLIF(COUNT(*), 0), 2) AS conversion_pct,
      ROUND(AVG(COALESCE(c.valor_final, c.valor_estimado, 0)), 2) AS avg_ticket
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.stage_entered_at >= p_from
      AND c.stage_entered_at < (p_to + INTERVAL '1 day')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
    GROUP BY source
    HAVING COUNT(*) >= 3  -- Filtrar grupos muito pequenos
  )
  SELECT jsonb_build_object(
    'data', COALESCE(jsonb_agg(jsonb_build_object(
      'source', source,
      'conversion_pct', conversion_pct,
      'avg_ticket', avg_ticket,
      'total', total,
      'won', won
    ) ORDER BY avg_ticket DESC), '[]'::jsonb)
  ) INTO v_result
  FROM origem_stats;

  RETURN v_result;
END
$$;

-- =========================================================================
-- 4. analytics_stage_velocity_percentiles
-- Velocidade (p50/p75) por etapa: quanto tempo em média um card fica
-- =========================================================================

CREATE OR REPLACE FUNCTION public.analytics_stage_velocity_percentiles(
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
  v_result JSONB;
BEGIN
  WITH stage_durations AS (
    SELECT
      s.id,
      s.nome AS stage_name,
      s.ordem,
      EXTRACT(DAY FROM (
        LEAD(a.created_at) OVER (PARTITION BY a.card_id ORDER BY a.created_at)
        - a.created_at
      )) AS days_in_stage
    FROM activities a
    JOIN pipeline_stages s ON s.id = (a.metadata->>'new_stage_id')::UUID
    JOIN cards c ON c.id = a.card_id
    WHERE a.org_id = v_org
      AND c.org_id = v_org
      AND a.tipo = 'stage_changed'
      AND a.created_at >= p_from
      AND a.created_at < (p_to + INTERVAL '1 day')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
      AND _a_phase_ok(s.id, p_phase_slugs)
  ),
  percentiles AS (
    SELECT
      id,
      stage_name,
      ordem,
      ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY days_in_stage), 2) AS p50_days,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY days_in_stage), 2) AS p75_days,
      COUNT(*) AS card_count
    FROM stage_durations
    WHERE days_in_stage IS NOT NULL
    GROUP BY id, stage_name, ordem
    ORDER BY ordem
  )
  SELECT jsonb_build_object(
    'stages', COALESCE(jsonb_agg(jsonb_build_object(
      'stage_id', id,
      'stage_name', stage_name,
      'p50_days', COALESCE(p50_days, 0),
      'p75_days', COALESCE(p75_days, 0),
      'card_count', card_count
    ) ORDER BY ordem), '[]'::jsonb)
  ) INTO v_result
  FROM percentiles;

  RETURN v_result;
END
$$;

-- =========================================================================
-- 5. analytics_quality_score_v2
-- Score composto global: média de todos os cards no período
-- =========================================================================

CREATE OR REPLACE FUNCTION public.analytics_quality_score_v2(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_ctx TEXT DEFAULT 'dono'
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
  WITH quality_data AS (
    SELECT
      COALESCE(ROUND(AVG(COALESCE(c.quality_score_pct, 0)), 1), 0) AS overall_avg,
      COUNT(*) AS total_cards,
      COUNT(*) FILTER (WHERE c.quality_score_pct >= 80) AS high_quality
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.stage_entered_at >= p_from
      AND c.stage_entered_at < (p_to + INTERVAL '1 day')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
  )
  SELECT jsonb_build_object(
    'overall_avg_score', overall_avg,
    'total_cards', total_cards,
    'high_quality_count', high_quality,
    'high_quality_pct', CASE
      WHEN total_cards > 0 THEN ROUND(100.0 * high_quality / total_cards, 1)
      ELSE 0
    END
  ) INTO v_result
  FROM quality_data;

  RETURN v_result;
END
$$;
