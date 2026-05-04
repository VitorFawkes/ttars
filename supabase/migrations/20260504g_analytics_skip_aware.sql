-- ============================================================================
-- MIGRATION: Analytics — skip_pos_venda awareness
-- Date: 2026-05-04
--
-- Cards skip_pos_venda=true não devem ser contados como "operação ativa"
-- porque ninguém da equipe está cuidando deles. Eles também não terão
-- problemas de tarefa vencida (cadências bloqueadas), então inflariam
-- artificialmente o denominador.
--
-- Mudanças:
--   1. analytics_problemas_no_pos: exclui skip do denominador
--   2. analytics_overview_kpis_v2: ganho_total alinhado com v1
--      (status='ganho' + data_fechamento em vez de ganho_pos)
-- ============================================================================

BEGIN;

-- ─── 1. analytics_problemas_no_pos: skip-aware ───
CREATE OR REPLACE FUNCTION public.analytics_problemas_no_pos(
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
  v_total INT;
  v_problemas INT;
BEGIN
  WITH card_filter AS (
    SELECT c.id, c.ganho_planner_at
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND COALESCE(c.skip_pos_venda, false) = false
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.vendas_owner_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND c.ganho_planner_at >= p_from
      AND c.ganho_planner_at < (p_to + INTERVAL '1 day')
  ),
  problemas AS (
    SELECT DISTINCT cf.id
    FROM card_filter cf
    JOIN tarefas t ON t.card_id = cf.id
    WHERE t.org_id = v_org
      AND t.data_vencimento < CURRENT_DATE
      AND t.status != 'concluida'
      AND t.data_vencimento > cf.ganho_planner_at
  )
  SELECT COUNT(*) INTO v_total FROM card_filter;
  SELECT COUNT(*) INTO v_problemas FROM problemas;

  RETURN jsonb_build_object(
    'total_cards_fechados', v_total,
    'cards_com_problema', v_problemas,
    'pct_com_problema', CASE WHEN v_total > 0
      THEN ROUND((v_problemas::NUMERIC / v_total) * 100, 1)
      ELSE 0 END
  );
END;
$$;

-- ─── 2. analytics_overview_kpis_v2: ganho_total alinhado com v1 ───
-- Usa status_comercial='ganho' + data_fechamento em vez de ganho_pos
-- (Inclui Ganho sem Pós, Ganho com Pós antes da viagem entregue, e Ganho com Pós já entregue)
CREATE OR REPLACE FUNCTION public.analytics_overview_kpis_v2(
  p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
  p_date_end TIMESTAMPTZ DEFAULT NOW(),
  p_product TEXT DEFAULT NULL,
  p_mode TEXT DEFAULT 'entries',
  p_stage_id UUID DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_owner_ids UUID[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
  v_taxa_paga_id UUID;
  v_briefing_id UUID;
  v_proposta_id UUID;
  v_pipeline_id UUID;
BEGIN
  IF p_product IS NOT NULL THEN
    SELECT p.id INTO v_pipeline_id FROM pipelines p WHERE p.produto::TEXT = p_product LIMIT 1;
  END IF;

  SELECT s.id INTO v_taxa_paga_id FROM pipeline_stages s
   WHERE s.ativo = true AND s.milestone_key = 'taxa_paga'
     AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;
  SELECT s.id INTO v_briefing_id FROM pipeline_stages s
   WHERE s.ativo = true AND s.milestone_key = 'briefing'
     AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;
  SELECT s.id INTO v_proposta_id FROM pipeline_stages s
   WHERE s.ativo = true AND s.milestone_key = 'proposta'
     AND (v_pipeline_id IS NULL OR s.pipeline_id = v_pipeline_id) LIMIT 1;

  WITH leads_pool AS (
    SELECT c.id, c.pipeline_stage_id, c.status_comercial,
           c.valor_final, c.receita, c.data_fechamento, c.created_at,
           c.ganho_planner
    FROM cards c
    WHERE c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
      AND _a_tag_ok(c.id, p_tag_ids)
      AND CASE
        WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
          c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
        WHEN p_mode = 'ganho_sdr' THEN
          c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
        WHEN p_mode = 'ganho_planner' THEN
          c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
        WHEN p_mode = 'ganho_total' THEN
          c.status_comercial = 'ganho' AND c.data_fechamento IS NOT NULL
          AND c.data_fechamento >= p_date_start::DATE AND c.data_fechamento < (p_date_end + interval '1 day')::DATE
        ELSE
          c.created_at >= p_date_start AND c.created_at < p_date_end
      END
  ),
  outcomes_pool AS (
    SELECT c.id, c.status_comercial, c.valor_final, c.receita,
           c.data_fechamento, c.created_at
    FROM cards c
    WHERE c.deleted_at IS NULL
      AND c.archived_at IS NULL
      AND c.status_comercial IN ('ganho', 'perdido')
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
      AND _a_tag_ok(c.id, p_tag_ids)
      AND CASE
        WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
          c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
        WHEN p_mode = 'ganho_sdr' THEN
          c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
        WHEN p_mode = 'ganho_planner' THEN
          c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
        WHEN p_mode = 'ganho_total' THEN
          c.status_comercial = 'ganho' AND c.data_fechamento IS NOT NULL
          AND c.data_fechamento >= p_date_start::DATE AND c.data_fechamento < (p_date_end + interval '1 day')::DATE
        ELSE
          c.created_at >= p_date_start AND c.created_at < p_date_end
      END
  )
  SELECT json_build_object(
    'total_leads', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool),
    'total_won', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
    'total_lost', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'perdido'),
    'total_open', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool WHERE status_comercial NOT IN ('ganho', 'perdido')),
    'conversao_venda_rate', CASE
      WHEN (SELECT COUNT(*) FROM leads_pool) > 0
      THEN ROUND(
        (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho')::NUMERIC
        / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
      ELSE 0
    END,
    'receita_total', (SELECT COALESCE(SUM(valor_final), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
    'margem_total', (SELECT COALESCE(SUM(receita), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
    'ticket_medio', CASE
      WHEN (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho') > 0
      THEN (SELECT ROUND(SUM(valor_final) / COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho')
      ELSE 0
    END,
    'ciclo_medio_dias', (
      SELECT COALESCE(ROUND(AVG(
        EXTRACT(EPOCH FROM (o.data_fechamento::TIMESTAMPTZ - o.created_at)) / 86400
      ), 1), 0)
      FROM outcomes_pool o
      WHERE o.status_comercial = 'ganho'
        AND o.data_fechamento IS NOT NULL
        AND o.data_fechamento::TIMESTAMPTZ > o.created_at
    ),
    'viagens_vendidas', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
    'ganho_planner_count', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool WHERE ganho_planner = true OR status_comercial = 'ganho'),
    'ganho_planner_rate', CASE
      WHEN (SELECT COUNT(*) FROM leads_pool) > 0
      THEN ROUND(
        (SELECT COUNT(*) FROM leads_pool WHERE ganho_planner = true OR status_comercial = 'ganho')::NUMERIC
        / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
      ELSE 0
    END
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_overview_kpis_v2(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID[], UUID[]) TO authenticated;

COMMIT;
