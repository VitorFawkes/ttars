-- =========================================================================
-- SDR Dashboard — 5 RPCs finais (widgets)
--
-- 1. analytics_sdr_follow_through     — % handoffs que viraram venda
-- 2. analytics_sdr_avg_ticket         — ticket médio das vendas originadas
-- 3. analytics_sdr_meetings           — reuniões marcadas vs no-show
-- 4. analytics_sdr_leads_by_source    — breakdown de leads por origem
-- 5. analytics_sdr_sla_compliance_pct — SLA compliance em percentuais
-- =========================================================================

-- RPC 1: % handoffs que viraram venda (follow-through rate)
-- Responde: de todos os cards com ganho_sdr_at no período,
-- quantos (%) também tem ganho_planner_at (viraram venda no Planner)?
CREATE OR REPLACE FUNCTION public.analytics_sdr_follow_through(
  p_date_start TIMESTAMPTZ,
  p_date_end TIMESTAMPTZ,
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_owner_ids UUID[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  total_handoffs BIGINT,
  handoffs_won BIGINT,
  follow_through_pct NUMERIC,
  by_sdr JSON
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN QUERY
  WITH filtered_cards AS (
    SELECT c.id, c.sdr_owner_id, c.ganho_sdr_at, c.ganho_planner_at, c.produto
    FROM cards c
    WHERE c.org_id = v_org
      AND c.ganho_sdr_at >= p_date_start
      AND c.ganho_sdr_at <= p_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.sdr_owner_id = p_owner_id)
      AND (p_owner_ids IS NULL OR p_owner_ids = ARRAY[]::UUID[] OR c.sdr_owner_id = ANY(p_owner_ids))
      AND (p_tag_ids IS NULL OR p_tag_ids = ARRAY[]::UUID[] OR EXISTS (
        SELECT 1 FROM card_tags ct WHERE ct.card_id = c.id AND ct.tag_id = ANY(p_tag_ids)
      ))
      AND (p_origem IS NULL OR p_origem = ARRAY[]::TEXT[] OR c.origem = ANY(p_origem))
      AND (p_phase_slugs IS NULL OR p_phase_slugs = ARRAY[]::TEXT[] OR EXISTS (
        SELECT 1 FROM pipeline_stages ps WHERE ps.id = c.pipeline_stage_id AND ps.phase_slug = ANY(p_phase_slugs)
      ))
      AND (p_lead_entry_path IS NULL OR c.lead_entry_path = p_lead_entry_path)
      AND (p_destinos IS NULL OR p_destinos = ARRAY[]::TEXT[] OR (c.produto_data->'destinos')::TEXT[] && p_destinos)
  ),
  summary AS (
    SELECT
      COUNT(*) AS total_handoffs,
      COUNT(CASE WHEN ganho_planner_at IS NOT NULL THEN 1 END) AS handoffs_won
    FROM filtered_cards
  ),
  by_sdr_data AS (
    SELECT
      p.id,
      p.nome,
      COUNT(*) AS total,
      COUNT(CASE WHEN fc.ganho_planner_at IS NOT NULL THEN 1 END) AS won,
      ROUND(
        100.0 * COUNT(CASE WHEN fc.ganho_planner_at IS NOT NULL THEN 1 END) / NULLIF(COUNT(*), 0),
        1
      ) AS pct
    FROM filtered_cards fc
    LEFT JOIN profiles p ON fc.sdr_owner_id = p.id
    GROUP BY p.id, p.nome
    ORDER BY total DESC
  )
  SELECT
    s.total_handoffs,
    s.handoffs_won,
    ROUND(
      100.0 * s.handoffs_won / NULLIF(s.total_handoffs, 0),
      1
    ) AS follow_through_pct,
    json_agg(
      json_build_object(
        'sdr_id', bd.id,
        'sdr_name', bd.nome,
        'total', bd.total,
        'won', bd.won,
        'follow_through_pct', bd.pct
      ) ORDER BY bd.total DESC
    ) AS by_sdr
  FROM summary s, by_sdr_data bd
  GROUP BY s.total_handoffs, s.handoffs_won;
END $$;

-- RPC 2: ticket médio das vendas originadas por SDR
-- Média de COALESCE(valor_final, valor_estimado) para cards
-- onde sdr_owner_id é NOT NULL e ganho_planner_at existe no período
CREATE OR REPLACE FUNCTION public.analytics_sdr_avg_ticket(
  p_date_start TIMESTAMPTZ,
  p_date_end TIMESTAMPTZ,
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_owner_ids UUID[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  total_sold_cards BIGINT,
  total_revenue NUMERIC,
  avg_ticket NUMERIC,
  by_sdr JSON
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN QUERY
  WITH filtered_cards AS (
    SELECT
      c.id,
      c.sdr_owner_id,
      c.ganho_planner_at,
      COALESCE(c.valor_final, c.valor_estimado, 0) AS card_valor
    FROM cards c
    WHERE c.org_id = v_org
      AND c.sdr_owner_id IS NOT NULL
      AND c.ganho_planner_at >= p_date_start
      AND c.ganho_planner_at <= p_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.sdr_owner_id = p_owner_id)
      AND (p_owner_ids IS NULL OR p_owner_ids = ARRAY[]::UUID[] OR c.sdr_owner_id = ANY(p_owner_ids))
      AND (p_tag_ids IS NULL OR p_tag_ids = ARRAY[]::UUID[] OR EXISTS (
        SELECT 1 FROM card_tags ct WHERE ct.card_id = c.id AND ct.tag_id = ANY(p_tag_ids)
      ))
      AND (p_origem IS NULL OR p_origem = ARRAY[]::TEXT[] OR c.origem = ANY(p_origem))
      AND (p_phase_slugs IS NULL OR p_phase_slugs = ARRAY[]::TEXT[] OR EXISTS (
        SELECT 1 FROM pipeline_stages ps WHERE ps.id = c.pipeline_stage_id AND ps.phase_slug = ANY(p_phase_slugs)
      ))
      AND (p_lead_entry_path IS NULL OR c.lead_entry_path = p_lead_entry_path)
      AND (p_destinos IS NULL OR p_destinos = ARRAY[]::TEXT[] OR (c.produto_data->'destinos')::TEXT[] && p_destinos)
  ),
  summary AS (
    SELECT
      COUNT(*) AS total_sold,
      SUM(card_valor) AS total_rev
    FROM filtered_cards
  ),
  by_sdr_data AS (
    SELECT
      p.id,
      p.nome,
      COUNT(*) AS total,
      SUM(fc.card_valor) AS total_rev,
      AVG(fc.card_valor) AS avg_val
    FROM filtered_cards fc
    LEFT JOIN profiles p ON fc.sdr_owner_id = p.id
    GROUP BY p.id, p.nome
  )
  SELECT
    s.total_sold,
    ROUND(COALESCE(s.total_rev, 0), 2),
    ROUND(AVG(bd.avg_val), 2),
    json_agg(
      json_build_object(
        'sdr_id', bd.id,
        'sdr_name', bd.nome,
        'total_sold', bd.total,
        'total_revenue', ROUND(COALESCE(bd.total_rev, 0), 2),
        'avg_ticket', ROUND(COALESCE(bd.avg_val, 0), 2)
      ) ORDER BY bd.total DESC
    ) AS by_sdr
  FROM summary s, by_sdr_data bd
  GROUP BY s.total_sold, s.total_rev;
END $$;

-- RPC 3: reuniões marcadas vs completadas vs no-show
-- Filtra activities.tipo = 'meeting' no período
-- Conta: created (marcadas), concluída (completadas), cancelada (no-show)
CREATE OR REPLACE FUNCTION public.analytics_sdr_meetings(
  p_date_start TIMESTAMPTZ,
  p_date_end TIMESTAMPTZ,
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_owner_ids UUID[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  meetings_scheduled BIGINT,
  meetings_completed BIGINT,
  meetings_no_show BIGINT,
  completion_rate_pct NUMERIC,
  no_show_rate_pct NUMERIC,
  by_sdr JSON
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN QUERY
  WITH filtered_meetings AS (
    SELECT
      a.id,
      a.created_by,
      a.tipo,
      a.status,
      c.sdr_owner_id,
      c.origem,
      c.produto
    FROM activities a
    LEFT JOIN cards c ON a.card_id = c.id
    WHERE a.org_id = v_org
      AND a.tipo = 'meeting'
      AND a.created_at >= p_date_start
      AND a.created_at <= p_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.sdr_owner_id = p_owner_id)
      AND (p_owner_ids IS NULL OR p_owner_ids = ARRAY[]::UUID[] OR c.sdr_owner_id = ANY(p_owner_ids))
      AND (p_origem IS NULL OR p_origem = ARRAY[]::TEXT[] OR c.origem = ANY(p_origem))
      AND (p_phase_slugs IS NULL OR p_phase_slugs = ARRAY[]::TEXT[] OR EXISTS (
        SELECT 1 FROM pipeline_stages ps WHERE ps.id = c.pipeline_stage_id AND ps.phase_slug = ANY(p_phase_slugs)
      ))
      AND (p_lead_entry_path IS NULL OR c.lead_entry_path = p_lead_entry_path)
  ),
  summary AS (
    SELECT
      COUNT(*) AS total_scheduled,
      COUNT(CASE WHEN status = 'concluida' THEN 1 END) AS total_completed,
      COUNT(CASE WHEN status IN ('cancelada', 'no_show') THEN 1 END) AS total_no_show
    FROM filtered_meetings
  ),
  by_sdr_data AS (
    SELECT
      p.id,
      p.nome,
      COUNT(*) AS scheduled,
      COUNT(CASE WHEN fm.status = 'concluida' THEN 1 END) AS completed,
      COUNT(CASE WHEN fm.status IN ('cancelada', 'no_show') THEN 1 END) AS no_show
    FROM filtered_meetings fm
    LEFT JOIN profiles p ON fm.created_by = p.id
    GROUP BY p.id, p.nome
  )
  SELECT
    s.total_scheduled,
    s.total_completed,
    s.total_no_show,
    ROUND(
      100.0 * s.total_completed / NULLIF(s.total_scheduled, 0),
      1
    ),
    ROUND(
      100.0 * s.total_no_show / NULLIF(s.total_scheduled, 0),
      1
    ),
    json_agg(
      json_build_object(
        'sdr_id', bd.id,
        'sdr_name', bd.nome,
        'scheduled', bd.scheduled,
        'completed', bd.completed,
        'no_show', bd.no_show,
        'completion_rate', ROUND(100.0 * bd.completed / NULLIF(bd.scheduled, 0), 1)
      ) ORDER BY bd.scheduled DESC
    ) AS by_sdr
  FROM summary s, by_sdr_data bd
  GROUP BY s.total_scheduled, s.total_completed, s.total_no_show;
END $$;

-- RPC 4: leads por fonte no período
-- Breakdown de cards.origem no período com filtros aplicados
-- Mostra: total por origem, wins, conversion %
CREATE OR REPLACE FUNCTION public.analytics_sdr_leads_by_source(
  p_date_start TIMESTAMPTZ,
  p_date_end TIMESTAMPTZ,
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_owner_ids UUID[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  total_leads BIGINT,
  sources JSON
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN QUERY
  WITH filtered_cards AS (
    SELECT c.id, c.origem, c.ganho_sdr_at
    FROM cards c
    WHERE c.org_id = v_org
      AND c.created_at >= p_date_start
      AND c.created_at <= p_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.sdr_owner_id = p_owner_id)
      AND (p_owner_ids IS NULL OR p_owner_ids = ARRAY[]::UUID[] OR c.sdr_owner_id = ANY(p_owner_ids))
      AND (p_tag_ids IS NULL OR p_tag_ids = ARRAY[]::UUID[] OR EXISTS (
        SELECT 1 FROM card_tags ct WHERE ct.card_id = c.id AND ct.tag_id = ANY(p_tag_ids)
      ))
      AND (p_phase_slugs IS NULL OR p_phase_slugs = ARRAY[]::TEXT[] OR EXISTS (
        SELECT 1 FROM pipeline_stages ps WHERE ps.id = c.pipeline_stage_id AND ps.phase_slug = ANY(p_phase_slugs)
      ))
      AND (p_lead_entry_path IS NULL OR c.lead_entry_path = p_lead_entry_path)
      AND (p_destinos IS NULL OR p_destinos = ARRAY[]::TEXT[] OR (c.produto_data->'destinos')::TEXT[] && p_destinos)
  ),
  by_source AS (
    SELECT
      COALESCE(fc.origem, 'Sem origem') AS source_name,
      COUNT(*) AS total,
      COUNT(CASE WHEN fc.ganho_sdr_at IS NOT NULL THEN 1 END) AS won,
      ROUND(
        100.0 * COUNT(CASE WHEN fc.ganho_sdr_at IS NOT NULL THEN 1 END) / NULLIF(COUNT(*), 0),
        1
      ) AS conversion_pct
    FROM filtered_cards fc
    GROUP BY fc.origem
    ORDER BY total DESC
  )
  SELECT
    (SELECT COUNT(*) FROM filtered_cards),
    json_agg(
      json_build_object(
        'source', bs.source_name,
        'total', bs.total,
        'won', bs.won,
        'conversion_pct', bs.conversion_pct
      )
    ) AS sources
  FROM by_source bs;
END $$;

-- RPC 5: SLA compliance em percentuais (buckets)
-- Transforma buckets de FRT em percentuais (< 5min, 5-60min, 1-4h, 4-24h, >24h)
CREATE OR REPLACE FUNCTION public.analytics_sdr_sla_compliance_pct(
  p_date_start TIMESTAMPTZ,
  p_date_end TIMESTAMPTZ,
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_owner_ids UUID[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  total_messages BIGINT,
  under_5min_pct NUMERIC,
  under_1h_pct NUMERIC,
  under_5h_pct NUMERIC,
  over_5h_pct NUMERIC,
  buckets JSON
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN QUERY
  WITH filtered_messages AS (
    SELECT
      wm.card_id,
      fn_business_minutes_between(
        LAG(wm.created_at) OVER (PARTITION BY wm.card_id ORDER BY wm.created_at),
        wm.created_at,
        v_org
      ) AS business_mins
    FROM whatsapp_messages wm
    LEFT JOIN cards c ON wm.card_id = c.id
    WHERE wm.org_id = v_org
      AND wm.direction = 'outbound'
      AND wm.created_at >= p_date_start
      AND wm.created_at <= p_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.sdr_owner_id = p_owner_id)
      AND (p_owner_ids IS NULL OR p_owner_ids = ARRAY[]::UUID[] OR c.sdr_owner_id = ANY(p_owner_ids))
      AND (p_origem IS NULL OR p_origem = ARRAY[]::TEXT[] OR c.origem = ANY(p_origem))
      AND (p_phase_slugs IS NULL OR p_phase_slugs = ARRAY[]::TEXT[] OR EXISTS (
        SELECT 1 FROM pipeline_stages ps WHERE ps.id = c.pipeline_stage_id AND ps.phase_slug = ANY(p_phase_slugs)
      ))
      AND (p_lead_entry_path IS NULL OR c.lead_entry_path = p_lead_entry_path)
      AND (p_destinos IS NULL OR p_destinos = ARRAY[]::TEXT[] OR (c.produto_data->'destinos')::TEXT[] && p_destinos)
  ),
  bucketed AS (
    SELECT
      CASE
        WHEN business_mins IS NULL THEN NULL
        WHEN business_mins < 5 THEN 'under_5min'
        WHEN business_mins < 60 THEN '5min_1h'
        WHEN business_mins < 300 THEN '1h_5h'
        ELSE 'over_5h'
      END AS bucket,
      business_mins
    FROM filtered_messages
    WHERE business_mins IS NOT NULL
  ),
  bucket_summary AS (
    SELECT
      COUNT(*) FILTER (WHERE bucket = 'under_5min') AS under_5,
      COUNT(*) FILTER (WHERE bucket = '5min_1h') AS under_60,
      COUNT(*) FILTER (WHERE bucket = '1h_5h') AS under_300,
      COUNT(*) FILTER (WHERE bucket = 'over_5h') AS over_300,
      COUNT(*) AS total_counted
    FROM bucketed
  )
  SELECT
    (SELECT COUNT(*) FROM filtered_messages WHERE business_mins IS NOT NULL),
    ROUND(100.0 * bs.under_5 / NULLIF(bs.total_counted, 0), 1),
    ROUND(100.0 * (bs.under_5 + bs.under_60) / NULLIF(bs.total_counted, 0), 1),
    ROUND(100.0 * (bs.under_5 + bs.under_60 + bs.under_300) / NULLIF(bs.total_counted, 0), 1),
    ROUND(100.0 * bs.over_300 / NULLIF(bs.total_counted, 0), 1),
    json_build_object(
      'under_5min', json_build_object('label', 'Até 5min', 'count', bs.under_5, 'pct', ROUND(100.0 * bs.under_5 / NULLIF(bs.total_counted, 0), 1)),
      '5min_1h', json_build_object('label', '5min-1h', 'count', bs.under_60, 'pct', ROUND(100.0 * bs.under_60 / NULLIF(bs.total_counted, 0), 1)),
      '1h_5h', json_build_object('label', '1h-5h', 'count', bs.under_300, 'pct', ROUND(100.0 * bs.under_300 / NULLIF(bs.total_counted, 0), 1)),
      'over_5h', json_build_object('label', '>5h', 'count', bs.over_300, 'pct', ROUND(100.0 * bs.over_300 / NULLIF(bs.total_counted, 0), 1))
    ) AS buckets
  FROM bucket_summary bs;
END $$;
