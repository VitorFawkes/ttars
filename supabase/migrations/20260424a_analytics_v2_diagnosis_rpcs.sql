-- =========================================================================
-- Fase 2 Analytics v2 — Bloco 3 (parte A): 6 RPCs de diagnóstico de processo
--
-- 1. analytics_stage_conversion     — % real A→B por etapa
-- 2. analytics_rework_rate          — % cards com volta (ordem_new < ordem_old)
-- 3. analytics_task_completion_by_person — produtividade de tarefas por pessoa
-- 4. analytics_cadence_compliance   — % steps executados no prazo
-- 5. analytics_field_completeness   — quality_score_pct agregado por pessoa/fase
-- 6. analytics_lead_entry_path_breakdown — conversão por entry path
--
-- Convenção: todas recebem os filtros universais (p_from/p_to/p_product/
-- p_origem/p_phase_slugs/p_lead_entry_path/p_destinos/p_owner_id).
-- Isolamento real por RLS via c.org_id = requesting_org_id(). p_product é
-- defesa em profundidade (uma org filha tem 1 produto).
-- =========================================================================

-- ---------------------------------------------------------------------
-- 1) analytics_stage_conversion
-- Para cada stage com entradas no período, conta quantos cards "avançaram"
-- (entraram depois em stage com ordem > atual no mesmo pipeline) e calcula
-- a taxa de conversão.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_stage_conversion(
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
  WITH card_filter AS (
    SELECT c.id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
  ),
  stage_events AS (
    SELECT
      a.card_id,
      a.created_at,
      (a.metadata->>'new_stage_id')::UUID AS to_stage_id,
      (a.metadata->>'old_stage_id')::UUID AS from_stage_id,
      (a.metadata->>'new_stage_ordem')::INT AS to_ordem,
      (a.metadata->>'old_stage_ordem')::INT AS from_ordem
    FROM activities a
    JOIN card_filter cf ON cf.id = a.card_id
    WHERE a.org_id = v_org
      AND a.tipo = 'stage_changed'
      AND a.created_at >= p_from
      AND a.created_at < (p_to + INTERVAL '1 day')
      AND (a.metadata->>'new_stage_id') IS NOT NULL
  ),
  stage_meta AS (
    SELECT s.id, s.nome, s.ordem, s.pipeline_id, pip.produto::TEXT AS produto
    FROM pipeline_stages s
    JOIN pipelines pip ON pip.id = s.pipeline_id
    WHERE s.org_id = v_org
      AND s.ativo IS NOT FALSE
      AND (p_product IS NULL OR pip.produto::TEXT = p_product)
  ),
  entered AS (
    -- Cards que entraram em cada stage no período
    SELECT
      sm.id AS stage_id,
      sm.nome,
      sm.ordem,
      sm.pipeline_id,
      COUNT(DISTINCT se.card_id) AS n_entered
    FROM stage_events se
    JOIN stage_meta sm ON sm.id = se.to_stage_id
    GROUP BY sm.id, sm.nome, sm.ordem, sm.pipeline_id
  ),
  advanced AS (
    -- Para cada (card, stage que entrou), checa se depois entrou em stage com ordem maior
    SELECT DISTINCT
      se.card_id,
      sm_from.id AS stage_id,
      sm_from.ordem AS from_ordem,
      sm_from.pipeline_id
    FROM stage_events se
    JOIN stage_meta sm_from ON sm_from.id = se.to_stage_id
    WHERE EXISTS (
      SELECT 1
      FROM stage_events se2
      WHERE se2.card_id = se.card_id
        AND se2.created_at > se.created_at
        AND se2.to_ordem > sm_from.ordem
    )
  ),
  per_stage AS (
    SELECT
      e.stage_id,
      e.nome,
      e.ordem,
      e.n_entered,
      COUNT(DISTINCT a.card_id) AS n_advanced
    FROM entered e
    LEFT JOIN advanced a ON a.stage_id = e.stage_id
    GROUP BY e.stage_id, e.nome, e.ordem, e.n_entered
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'stage_id', stage_id,
      'stage_name', nome,
      'ordem', ordem,
      'entered', n_entered,
      'advanced', n_advanced,
      'conversion_pct', CASE WHEN n_entered > 0
        THEN ROUND((n_advanced::NUMERIC / n_entered) * 100, 1) ELSE 0 END
    ) ORDER BY ordem
  )
  INTO v_result
  FROM per_stage;

  RETURN jsonb_build_object('stages', COALESCE(v_result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_stage_conversion(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[], UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) analytics_rework_rate
-- % de cards que tiveram movimento "pra trás" (ordem destino < ordem origem)
-- no período. Calcula inline comparando stages das activities.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_rework_rate(
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
  v_total_moved INT;
  v_rework INT;
  v_by_phase JSONB;
BEGIN
  WITH card_filter AS (
    SELECT c.id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
  ),
  moves AS (
    SELECT
      a.card_id,
      (a.metadata->>'old_stage_ordem')::INT AS from_ordem,
      (a.metadata->>'new_stage_ordem')::INT AS to_ordem,
      (a.metadata->>'new_stage_id')::UUID AS to_stage_id,
      COALESCE((a.metadata->>'is_rework')::BOOLEAN, FALSE) AS is_rework
    FROM activities a
    JOIN card_filter cf ON cf.id = a.card_id
    WHERE a.org_id = v_org
      AND a.tipo = 'stage_changed'
      AND a.created_at >= p_from
      AND a.created_at < (p_to + INTERVAL '1 day')
      AND (a.metadata->>'new_stage_ordem') IS NOT NULL
      AND (a.metadata->>'old_stage_ordem') IS NOT NULL
  )
  SELECT
    COUNT(DISTINCT card_id),
    COUNT(DISTINCT card_id) FILTER (WHERE is_rework OR to_ordem < from_ordem)
  INTO v_total_moved, v_rework
  FROM moves;

  -- Rework por phase (fase destino = pra onde voltou)
  SELECT jsonb_agg(
    jsonb_build_object('phase_slug', phase_slug, 'phase_label', phase_label, 'rework_cards', cnt)
    ORDER BY cnt DESC
  )
  INTO v_by_phase
  FROM (
    SELECT pp.slug AS phase_slug, pp.label AS phase_label, COUNT(DISTINCT m.card_id) AS cnt
    FROM (
      SELECT
        a.card_id,
        (a.metadata->>'old_stage_ordem')::INT AS from_ordem,
        (a.metadata->>'new_stage_ordem')::INT AS to_ordem,
        (a.metadata->>'new_stage_id')::UUID AS to_stage_id,
        COALESCE((a.metadata->>'is_rework')::BOOLEAN, FALSE) AS is_rework_flag
      FROM activities a
      JOIN cards c ON c.id = a.card_id
      WHERE a.org_id = v_org
        AND a.tipo = 'stage_changed'
        AND a.created_at >= p_from
        AND a.created_at < (p_to + INTERVAL '1 day')
        AND c.org_id = v_org
        AND c.deleted_at IS NULL
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND (a.metadata->>'new_stage_ordem') IS NOT NULL
        AND (a.metadata->>'old_stage_ordem') IS NOT NULL
        AND ((a.metadata->>'is_rework')::BOOLEAN OR (a.metadata->>'new_stage_ordem')::INT < (a.metadata->>'old_stage_ordem')::INT)
    ) m
    JOIN pipeline_stages s_to ON s_to.id = m.to_stage_id
    JOIN pipeline_phases pp ON pp.id = s_to.phase_id
    GROUP BY pp.slug, pp.label
  ) by_phase_cte;

  RETURN jsonb_build_object(
    'total_moved', COALESCE(v_total_moved, 0),
    'rework_count', COALESCE(v_rework, 0),
    'rework_pct', CASE WHEN COALESCE(v_total_moved, 0) > 0
      THEN ROUND((v_rework::NUMERIC / v_total_moved) * 100, 1) ELSE 0 END,
    'by_phase', COALESCE(v_by_phase, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_rework_rate(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[], UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) analytics_task_completion_by_person
-- Por responsavel_id: # tarefas, # concluídas, on-time %, tipo que mais atrasa
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_task_completion_by_person(
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
  WITH filtered_cards AS (
    SELECT c.id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
  ),
  task_base AS (
    SELECT t.id, t.responsavel_id, t.tipo, t.concluida, t.concluida_em, t.data_vencimento, t.created_at
    FROM tarefas t
    JOIN filtered_cards fc ON fc.id = t.card_id
    WHERE t.org_id = v_org
      AND t.deleted_at IS NULL
      AND t.responsavel_id IS NOT NULL
      AND (p_owner_id IS NULL OR t.responsavel_id = p_owner_id)
      AND t.created_at >= p_from
      AND t.created_at < (p_to + INTERVAL '1 day')
  ),
  per_person AS (
    SELECT
      tb.responsavel_id,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE tb.concluida) AS concluidas,
      COUNT(*) FILTER (WHERE tb.concluida
                        AND tb.data_vencimento IS NOT NULL
                        AND tb.concluida_em <= tb.data_vencimento) AS on_time,
      COUNT(*) FILTER (WHERE tb.concluida AND tb.data_vencimento IS NOT NULL) AS concluidas_with_due,
      COUNT(*) FILTER (WHERE NOT tb.concluida
                        AND tb.data_vencimento IS NOT NULL
                        AND tb.data_vencimento < NOW()) AS atrasadas_abertas
    FROM task_base tb
    GROUP BY tb.responsavel_id
  ),
  worst_type AS (
    -- Para cada pessoa, descobre o tipo com maior % de atraso (mínimo 3 tarefas)
    SELECT DISTINCT ON (responsavel_id)
      responsavel_id,
      tipo,
      atraso_pct
    FROM (
      SELECT
        tb.responsavel_id,
        COALESCE(tb.tipo, 'outros') AS tipo,
        COUNT(*) AS n,
        COUNT(*) FILTER (WHERE tb.concluida AND tb.data_vencimento IS NOT NULL AND tb.concluida_em > tb.data_vencimento) AS atrasadas,
        CASE WHEN COUNT(*) FILTER (WHERE tb.concluida AND tb.data_vencimento IS NOT NULL) > 0
          THEN ROUND(100.0 * COUNT(*) FILTER (WHERE tb.concluida AND tb.data_vencimento IS NOT NULL AND tb.concluida_em > tb.data_vencimento)::NUMERIC
            / COUNT(*) FILTER (WHERE tb.concluida AND tb.data_vencimento IS NOT NULL), 1)
          ELSE 0 END AS atraso_pct
      FROM task_base tb
      GROUP BY tb.responsavel_id, tipo
      HAVING COUNT(*) FILTER (WHERE tb.concluida AND tb.data_vencimento IS NOT NULL) >= 3
    ) x
    ORDER BY responsavel_id, atraso_pct DESC, n DESC
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'user_id', pp.responsavel_id,
      'user_name', COALESCE(p.nome, 'Desconhecido'),
      'total', pp.total,
      'concluidas', pp.concluidas,
      'completion_pct', CASE WHEN pp.total > 0
        THEN ROUND((pp.concluidas::NUMERIC / pp.total) * 100, 1) ELSE 0 END,
      'on_time', pp.on_time,
      'on_time_pct', CASE WHEN pp.concluidas_with_due > 0
        THEN ROUND((pp.on_time::NUMERIC / pp.concluidas_with_due) * 100, 1) ELSE 0 END,
      'atrasadas_abertas', pp.atrasadas_abertas,
      'worst_tipo', wt.tipo,
      'worst_tipo_atraso_pct', wt.atraso_pct
    ) ORDER BY pp.concluidas DESC
  )
  INTO v_result
  FROM per_person pp
  LEFT JOIN profiles p ON p.id = pp.responsavel_id
  LEFT JOIN worst_type wt ON wt.responsavel_id = pp.responsavel_id;

  RETURN jsonb_build_object('people', COALESCE(v_result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_task_completion_by_person(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[], UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) analytics_cadence_compliance
-- % de steps que foram executados com sucesso. Atraso médio (minutos business)
-- entre execute_at e last_attempt_at.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_cadence_compliance(
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
  v_overall JSONB;
  v_by_template JSONB;
BEGIN
  WITH filtered_cards AS (
    SELECT c.id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
  ),
  steps AS (
    SELECT
      q.id, q.status, q.attempts, q.execute_at, q.last_attempt_at,
      i.template_id, i.card_id
    FROM cadence_queue q
    JOIN cadence_instances i ON i.id = q.instance_id
    JOIN filtered_cards fc ON fc.id = i.card_id
    WHERE i.org_id = v_org
      AND q.execute_at >= p_from
      AND q.execute_at < (p_to + INTERVAL '1 day')
  )
  SELECT jsonb_build_object(
    'total_steps', COUNT(*),
    'succeeded', COUNT(*) FILTER (WHERE status = 'succeeded'),
    'failed', COUNT(*) FILTER (WHERE status = 'failed'),
    'pending', COUNT(*) FILTER (WHERE status IN ('pending','queued','processing')),
    'compliance_pct', CASE WHEN COUNT(*) FILTER (WHERE status IN ('succeeded','failed')) > 0
      THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'succeeded')::NUMERIC
        / COUNT(*) FILTER (WHERE status IN ('succeeded','failed')), 1)
      ELSE NULL END,
    'first_try_pct', CASE WHEN COUNT(*) FILTER (WHERE status = 'succeeded') > 0
      THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'succeeded' AND attempts <= 1)::NUMERIC
        / COUNT(*) FILTER (WHERE status = 'succeeded'), 1)
      ELSE NULL END,
    'avg_delay_minutes', ROUND(AVG(
      CASE WHEN status = 'succeeded' AND last_attempt_at IS NOT NULL AND last_attempt_at > execute_at
        THEN EXTRACT(EPOCH FROM (last_attempt_at - execute_at)) / 60.0
        ELSE NULL END
    )::NUMERIC, 1)
  )
  INTO v_overall
  FROM steps;

  SELECT jsonb_agg(
    jsonb_build_object(
      'template_id', template_id,
      'template_name', t_name,
      'total', total,
      'succeeded', succeeded,
      'compliance_pct', compliance_pct
    ) ORDER BY total DESC
  )
  INTO v_by_template
  FROM (
    SELECT
      s.template_id,
      t.name AS t_name,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE s.status = 'succeeded') AS succeeded,
      CASE WHEN COUNT(*) FILTER (WHERE s.status IN ('succeeded','failed')) > 0
        THEN ROUND(100.0 * COUNT(*) FILTER (WHERE s.status = 'succeeded')::NUMERIC
          / COUNT(*) FILTER (WHERE s.status IN ('succeeded','failed')), 1)
        ELSE NULL END AS compliance_pct
    FROM (
      SELECT q.status, q.attempts, i.template_id, i.card_id
      FROM cadence_queue q
      JOIN cadence_instances i ON i.id = q.instance_id
      JOIN cards c ON c.id = i.card_id
      WHERE i.org_id = v_org
        AND c.deleted_at IS NULL
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND q.execute_at >= p_from
        AND q.execute_at < (p_to + INTERVAL '1 day')
    ) s
    LEFT JOIN cadence_templates t ON t.id = s.template_id
    GROUP BY s.template_id, t.name
  ) bt;

  RETURN jsonb_build_object(
    'overall', COALESCE(v_overall, '{}'::jsonb),
    'by_template', COALESCE(v_by_template, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_cadence_compliance(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[], UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) analytics_field_completeness
-- Quality score (cards.quality_score_pct) agregado por pessoa e por fase.
-- Cross: pessoa × fase. Padrão p_ctx='dono' para avaliação geral.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_field_completeness(
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
  WITH base AS (
    SELECT
      c.id,
      c.quality_score_pct,
      c.pipeline_stage_id,
      CASE p_ctx
        WHEN 'sdr' THEN c.sdr_owner_id
        WHEN 'vendas' THEN c.vendas_owner_id
        WHEN 'planner' THEN c.vendas_owner_id
        WHEN 'pos' THEN c.pos_owner_id
        WHEN 'pos_venda' THEN c.pos_owner_id
        ELSE c.dono_atual_id
      END AS ctx_owner_id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.quality_score_pct IS NOT NULL
      AND c.created_at >= p_from
      AND c.created_at < (p_to + INTERVAL '1 day')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND (p_owner_id IS NULL OR CASE p_ctx
        WHEN 'sdr' THEN c.sdr_owner_id
        WHEN 'vendas' THEN c.vendas_owner_id
        WHEN 'planner' THEN c.vendas_owner_id
        WHEN 'pos' THEN c.pos_owner_id
        WHEN 'pos_venda' THEN c.pos_owner_id
        ELSE c.dono_atual_id
      END = p_owner_id)
  ),
  overall AS (
    SELECT
      ROUND(AVG(quality_score_pct)::NUMERIC, 1) AS avg_score,
      COUNT(*) AS total
    FROM base
  ),
  by_person AS (
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', ctx_owner_id,
      'user_name', COALESCE(pr.nome, 'Desconhecido'),
      'cards', cnt,
      'avg_score', avg_score
    ) ORDER BY avg_score DESC NULLS LAST) AS val
    FROM (
      SELECT ctx_owner_id, COUNT(*) AS cnt, ROUND(AVG(quality_score_pct)::NUMERIC, 1) AS avg_score
      FROM base
      WHERE ctx_owner_id IS NOT NULL
      GROUP BY ctx_owner_id
    ) bp
    LEFT JOIN profiles pr ON pr.id = bp.ctx_owner_id
  ),
  by_phase AS (
    SELECT jsonb_agg(jsonb_build_object(
      'phase_slug', phase_slug,
      'phase_label', phase_label,
      'cards', cnt,
      'avg_score', avg_score
    ) ORDER BY order_index) AS val
    FROM (
      SELECT pp.slug AS phase_slug, pp.label AS phase_label, pp.order_index,
             COUNT(*) AS cnt, ROUND(AVG(b.quality_score_pct)::NUMERIC, 1) AS avg_score
      FROM base b
      JOIN pipeline_stages s ON s.id = b.pipeline_stage_id
      JOIN pipeline_phases pp ON pp.id = s.phase_id
      GROUP BY pp.slug, pp.label, pp.order_index
    ) bph
  ),
  by_person_phase AS (
    SELECT jsonb_agg(jsonb_build_object(
      'user_id', ctx_owner_id,
      'user_name', COALESCE(pr.nome, 'Desconhecido'),
      'phase_slug', phase_slug,
      'phase_label', phase_label,
      'cards', cnt,
      'avg_score', avg_score
    ) ORDER BY avg_score DESC NULLS LAST) AS val
    FROM (
      SELECT b.ctx_owner_id, pp.slug AS phase_slug, pp.label AS phase_label,
             COUNT(*) AS cnt, ROUND(AVG(b.quality_score_pct)::NUMERIC, 1) AS avg_score
      FROM base b
      JOIN pipeline_stages s ON s.id = b.pipeline_stage_id
      JOIN pipeline_phases pp ON pp.id = s.phase_id
      WHERE b.ctx_owner_id IS NOT NULL
      GROUP BY b.ctx_owner_id, pp.slug, pp.label
    ) bpp
    LEFT JOIN profiles pr ON pr.id = bpp.ctx_owner_id
  )
  SELECT jsonb_build_object(
    'overall_avg_score', COALESCE(o.avg_score, 0),
    'total_cards', COALESCE(o.total, 0),
    'by_person', COALESCE(bp.val, '[]'::jsonb),
    'by_phase', COALESCE(bph.val, '[]'::jsonb),
    'by_person_phase', COALESCE(bpp.val, '[]'::jsonb)
  )
  INTO v_result
  FROM overall o, by_person bp, by_phase bph, by_person_phase bpp;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_field_completeness(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[], UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) analytics_lead_entry_path_breakdown
-- Para cada lead_entry_path, mostra conversão, ticket médio e velocidade.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_lead_entry_path_breakdown(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
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
  WITH base AS (
    SELECT
      c.id,
      COALESCE(c.lead_entry_path, 'unknown') AS entry_path,
      c.ganho_planner,
      c.ganho_planner_at,
      c.created_at,
      COALESCE(c.valor_final, c.valor_estimado, 0) AS revenue
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.created_at >= p_from
      AND c.created_at < (p_to + INTERVAL '1 day')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'entry_path', entry_path,
      'total_leads', total,
      'wins', wins,
      'conversion_pct', CASE WHEN total > 0 THEN ROUND((wins::NUMERIC / total) * 100, 1) ELSE 0 END,
      'total_revenue', total_revenue,
      'avg_ticket', CASE WHEN wins > 0 THEN ROUND((total_revenue / wins)::NUMERIC, 2) ELSE 0 END,
      'avg_days_to_win', avg_days_to_win
    ) ORDER BY total DESC
  )
  INTO v_result
  FROM (
    SELECT
      entry_path,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE ganho_planner) AS wins,
      COALESCE(SUM(revenue) FILTER (WHERE ganho_planner), 0) AS total_revenue,
      ROUND(AVG(
        CASE WHEN ganho_planner AND ganho_planner_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (ganho_planner_at - created_at)) / 86400.0
          ELSE NULL END
      )::NUMERIC, 1) AS avg_days_to_win
    FROM base
    GROUP BY entry_path
  ) agg;

  RETURN jsonb_build_object('paths', COALESCE(v_result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_lead_entry_path_breakdown(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT[], UUID) TO authenticated;

-- =========================================================================
-- FIM: Parte A — 6 RPCs de diagnóstico
-- =========================================================================
