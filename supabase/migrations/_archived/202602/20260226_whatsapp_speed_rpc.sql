-- =====================================================
-- Analytics WhatsApp Speed — FRT deep dive + SLA
--
-- SLA compliance (4 thresholds), FRT trend por período,
-- FRT por hora do dia, FRT por tipo (AI vs Human),
-- distribuição detalhada com bucket extra < 1min.
-- =====================================================

CREATE OR REPLACE FUNCTION analytics_whatsapp_speed(
  p_from        DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to          DATE DEFAULT CURRENT_DATE,
  p_produto     TEXT DEFAULT NULL,
  p_owner_id    UUID DEFAULT NULL,
  p_granularity TEXT DEFAULT 'day'  -- day | week | month
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  WITH
  -- Contacts filtered by owner
  owner_contacts AS (
    SELECT DISTINCT c.pessoa_principal_id AS contact_id
    FROM cards c
    WHERE c.deleted_at IS NULL
      AND p_owner_id IS NOT NULL
      AND (
        c.sdr_owner_id = p_owner_id
        OR c.vendas_owner_id = p_owner_id
        OR c.pos_owner_id = p_owner_id
        OR c.concierge_owner_id = p_owner_id
      )
      AND c.pessoa_principal_id IS NOT NULL
  ),

  -- Base messages
  msgs AS (
    SELECT wm.*,
      CASE
        WHEN wm.direction = 'outbound' AND wm.sent_by_user_name IS NULL AND wm.sent_by_user_id IS NULL
          THEN true
        ELSE false
      END AS is_ai
    FROM whatsapp_messages wm
    WHERE wm.created_at >= p_from
      AND wm.created_at < (p_to + INTERVAL '1 day')
      AND (p_produto IS NULL OR wm.produto = p_produto)
      AND (p_owner_id IS NULL OR wm.contact_id IN (SELECT contact_id FROM owner_contacts))
  ),

  -- Inbound blocks (for FRT calculation)
  inbound_blocks AS (
    SELECT
      id, contact_id, created_at,
      LEAD(created_at) OVER (PARTITION BY contact_id, direction ORDER BY created_at) AS next_same_direction
    FROM msgs
    WHERE direction = 'inbound'
  ),

  -- All first responses
  first_responses AS (
    SELECT
      ib.contact_id,
      ib.created_at AS inbound_at,
      MIN(ob.created_at) AS response_at,
      EXTRACT(EPOCH FROM MIN(ob.created_at) - ib.created_at) / 60.0 AS response_minutes,
      -- Who responded first?
      (SELECT m2.is_ai FROM msgs m2
       WHERE m2.contact_id = ib.contact_id
         AND m2.direction = 'outbound'
         AND m2.created_at > ib.created_at
         AND m2.created_at < COALESCE(ib.next_same_direction, 'infinity'::timestamptz)
       ORDER BY m2.created_at ASC
       LIMIT 1
      ) AS responded_by_ai
    FROM inbound_blocks ib
    JOIN msgs ob ON ob.contact_id = ib.contact_id
      AND ob.direction = 'outbound'
      AND ob.created_at > ib.created_at
      AND ob.created_at < COALESCE(ib.next_same_direction, 'infinity'::timestamptz)
    GROUP BY ib.contact_id, ib.created_at, ib.next_same_direction
  ),

  -- 1. SLA Compliance
  sla_compliance AS (
    SELECT jsonb_build_object(
      'total_responses', count(*),
      'under_1min', count(*) FILTER (WHERE response_minutes < 1),
      'under_5min', count(*) FILTER (WHERE response_minutes < 5),
      'under_15min', count(*) FILTER (WHERE response_minutes < 15),
      'under_30min', count(*) FILTER (WHERE response_minutes < 30),
      'under_1hour', count(*) FILTER (WHERE response_minutes < 60),
      'pct_under_1min', CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE response_minutes < 1)::numeric / count(*) * 100, 1) ELSE 0 END,
      'pct_under_5min', CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE response_minutes < 5)::numeric / count(*) * 100, 1) ELSE 0 END,
      'pct_under_15min', CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE response_minutes < 15)::numeric / count(*) * 100, 1) ELSE 0 END,
      'pct_under_30min', CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE response_minutes < 30)::numeric / count(*) * 100, 1) ELSE 0 END,
      'pct_under_1hour', CASE WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE response_minutes < 60)::numeric / count(*) * 100, 1) ELSE 0 END
    ) AS val FROM first_responses
  ),

  -- 2. FRT Trend (median per period)
  frt_trend AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'period', period,
        'median_minutes', median_min,
        'avg_minutes', avg_min,
        'count', cnt
      ) ORDER BY period
    ) AS val
    FROM (
      SELECT
        CASE p_granularity
          WHEN 'week' THEN date_trunc('week', inbound_at)::date::text
          WHEN 'month' THEN to_char(inbound_at, 'YYYY-MM')
          ELSE inbound_at::date::text
        END AS period,
        round(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_minutes)::numeric, 1) AS median_min,
        round(AVG(response_minutes)::numeric, 1) AS avg_min,
        count(*) AS cnt
      FROM first_responses
      GROUP BY 1
    ) t
  ),

  -- 3. FRT by Hour of Day
  frt_by_hour AS (
    SELECT jsonb_agg(
      jsonb_build_object('hour', hour, 'median_minutes', median_min, 'count', cnt)
      ORDER BY hour
    ) AS val
    FROM (
      SELECT
        EXTRACT(HOUR FROM inbound_at)::int AS hour,
        round(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_minutes)::numeric, 1) AS median_min,
        count(*) AS cnt
      FROM first_responses
      GROUP BY 1
    ) h
  ),

  -- 4. FRT by Responder Type (AI vs Human)
  frt_by_type AS (
    SELECT jsonb_build_object(
      'ai', jsonb_build_object(
        'count', count(*) FILTER (WHERE responded_by_ai = true),
        'avg_minutes', round(AVG(response_minutes) FILTER (WHERE responded_by_ai = true)::numeric, 1),
        'median_minutes', round(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_minutes) FILTER (WHERE responded_by_ai = true)::numeric, 1),
        'p90_minutes', round(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY response_minutes) FILTER (WHERE responded_by_ai = true)::numeric, 1)
      ),
      'human', jsonb_build_object(
        'count', count(*) FILTER (WHERE responded_by_ai = false),
        'avg_minutes', round(AVG(response_minutes) FILTER (WHERE responded_by_ai = false)::numeric, 1),
        'median_minutes', round(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_minutes) FILTER (WHERE responded_by_ai = false)::numeric, 1),
        'p90_minutes', round(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY response_minutes) FILTER (WHERE responded_by_ai = false)::numeric, 1)
      )
    ) AS val FROM first_responses
  ),

  -- 5. Distribution (with extra < 1min bucket)
  frt_distribution AS (
    SELECT jsonb_agg(
      jsonb_build_object('bucket', bucket, 'count', cnt)
      ORDER BY ord
    ) AS val
    FROM (
      SELECT
        CASE
          WHEN response_minutes < 1 THEN '< 1min'
          WHEN response_minutes < 5 THEN '1-5min'
          WHEN response_minutes < 15 THEN '5-15min'
          WHEN response_minutes < 60 THEN '15-60min'
          WHEN response_minutes < 240 THEN '1-4h'
          ELSE '> 4h'
        END AS bucket,
        CASE
          WHEN response_minutes < 1 THEN 1
          WHEN response_minutes < 5 THEN 2
          WHEN response_minutes < 15 THEN 3
          WHEN response_minutes < 60 THEN 4
          WHEN response_minutes < 240 THEN 5
          ELSE 6
        END AS ord,
        count(*) AS cnt
      FROM first_responses
      GROUP BY 1, 2
    ) b
  )

  SELECT jsonb_build_object(
    'sla_compliance', sc.val,
    'frt_trend', COALESCE(ft.val, '[]'::jsonb),
    'frt_by_hour', COALESCE(fh.val, '[]'::jsonb),
    'frt_by_type', fbt.val,
    'frt_distribution', COALESCE(fd.val, '[]'::jsonb)
  ) INTO result
  FROM sla_compliance sc, frt_trend ft, frt_by_hour fh, frt_by_type fbt, frt_distribution fd;

  RETURN result;
END;
$$;
