-- =====================================================
-- Analytics WhatsApp V2 — World-Class Dashboard
--
-- Consulta whatsapp_messages (tabela real populada pelo
-- webhook + process_whatsapp_raw_event_v2).
--
-- Filtros: data, produto, consultor (via card owner)
-- Granularidade: day/week/month para volume timeseries
-- Aging: estado atual (ignora filtro de data)
--
-- Retorna JSON com 8 seções: overview, daily_volume,
-- hourly_heatmap, first_response, agent_performance,
-- aging, message_types, ai_stats
-- =====================================================

-- Drop old V1 (3-param) to prevent PostgREST overload ambiguity
DROP FUNCTION IF EXISTS analytics_whatsapp_v2(date, date, text);

CREATE OR REPLACE FUNCTION analytics_whatsapp_v2(
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
  -- Contacts filtered by owner (if specified)
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

  -- Base: mensagens no período (filtradas por data, produto, owner)
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

  -- 1. Overview
  overview AS (
    SELECT jsonb_build_object(
      'total_messages', count(*),
      'inbound', count(*) FILTER (WHERE direction = 'inbound'),
      'outbound', count(*) FILTER (WHERE direction = 'outbound'),
      'active_conversations', count(DISTINCT contact_id),
      'unique_contacts', count(DISTINCT contact_id),
      'unique_cards', count(DISTINCT card_id) FILTER (WHERE card_id IS NOT NULL),
      'avg_msgs_per_conversation', CASE
        WHEN count(DISTINCT contact_id) > 0
        THEN round(count(*)::numeric / count(DISTINCT contact_id), 1)
        ELSE 0
      END,
      'media_messages', count(*) FILTER (WHERE message_type <> 'text' AND message_type IS NOT NULL),
      'ai_messages', count(*) FILTER (WHERE is_ai AND direction = 'outbound'),
      'human_messages', count(*) FILTER (WHERE NOT is_ai AND direction = 'outbound')
    ) AS val FROM msgs
  ),

  -- 2. Volume timeseries (respects granularity)
  daily_volume AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'period', period,
        'inbound', inbound,
        'outbound', outbound,
        'ai', ai,
        'human', human
      ) ORDER BY period
    ) AS val
    FROM (
      SELECT
        CASE p_granularity
          WHEN 'week' THEN date_trunc('week', created_at)::date::text
          WHEN 'month' THEN to_char(created_at, 'YYYY-MM')
          ELSE created_at::date::text
        END AS period,
        count(*) FILTER (WHERE direction = 'inbound') AS inbound,
        count(*) FILTER (WHERE direction = 'outbound') AS outbound,
        count(*) FILTER (WHERE direction = 'outbound' AND is_ai) AS ai,
        count(*) FILTER (WHERE direction = 'outbound' AND NOT is_ai) AS human
      FROM msgs
      GROUP BY 1
    ) d
  ),

  -- 3. Hourly heatmap (dow 0=Sun, hour 0-23) — inbound only
  hourly_heatmap AS (
    SELECT jsonb_agg(
      jsonb_build_object('dow', dow, 'hour', hour, 'count', cnt)
    ) AS val
    FROM (
      SELECT
        EXTRACT(DOW FROM created_at)::int AS dow,
        EXTRACT(HOUR FROM created_at)::int AS hour,
        count(*) AS cnt
      FROM msgs
      WHERE direction = 'inbound'
      GROUP BY 1, 2
    ) h
  ),

  -- 4. First Response Time
  inbound_blocks AS (
    SELECT
      id, contact_id, created_at,
      LEAD(created_at) OVER (PARTITION BY contact_id, direction ORDER BY created_at) AS next_same_direction
    FROM msgs
    WHERE direction = 'inbound'
  ),
  first_responses AS (
    SELECT
      ib.contact_id,
      ib.created_at AS inbound_at,
      MIN(ob.created_at) AS response_at,
      EXTRACT(EPOCH FROM MIN(ob.created_at) - ib.created_at) / 60.0 AS response_minutes
    FROM inbound_blocks ib
    JOIN msgs ob ON ob.contact_id = ib.contact_id
      AND ob.direction = 'outbound'
      AND ob.created_at > ib.created_at
      AND ob.created_at < COALESCE(ib.next_same_direction, 'infinity'::timestamptz)
    GROUP BY ib.contact_id, ib.created_at
  ),
  frt_stats AS (
    SELECT
      round(AVG(response_minutes)::numeric, 1) AS avg_minutes,
      round(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_minutes)::numeric, 1) AS median_minutes,
      round(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY response_minutes)::numeric, 1) AS p90_minutes
    FROM first_responses
  ),
  frt_buckets AS (
    SELECT jsonb_agg(
      jsonb_build_object('bucket', bucket, 'count', cnt)
      ORDER BY ord
    ) AS val
    FROM (
      SELECT
        CASE
          WHEN response_minutes < 5 THEN '< 5min'
          WHEN response_minutes < 15 THEN '5-15min'
          WHEN response_minutes < 60 THEN '15-60min'
          WHEN response_minutes < 240 THEN '1-4h'
          ELSE '> 4h'
        END AS bucket,
        CASE
          WHEN response_minutes < 5 THEN 1
          WHEN response_minutes < 15 THEN 2
          WHEN response_minutes < 60 THEN 3
          WHEN response_minutes < 240 THEN 4
          ELSE 5
        END AS ord,
        count(*) AS cnt
      FROM first_responses
      GROUP BY 1, 2
    ) b
  ),
  first_response AS (
    SELECT jsonb_build_object(
      'avg_minutes', COALESCE(s.avg_minutes, 0),
      'median_minutes', COALESCE(s.median_minutes, 0),
      'p90_minutes', COALESCE(s.p90_minutes, 0),
      'total_responses', (SELECT count(*) FROM first_responses),
      'buckets', COALESCE(fb.val, '[]'::jsonb)
    ) AS val
    FROM frt_stats s, frt_buckets fb
  ),

  -- 5. Agent performance (only CRM-attributed agents)
  agent_perf_raw AS (
    SELECT
      sent_by_user_id::text AS agent_key,
      MAX(sent_by_user_name) AS user_name,
      count(*) AS messages_sent,
      count(DISTINCT contact_id) AS conversations_handled
    FROM msgs
    WHERE direction = 'outbound'
      AND sent_by_user_id IS NOT NULL
    GROUP BY 1
  ),
  agent_frt AS (
    SELECT
      ob.sent_by_user_id::text AS agent_key,
      round(AVG(EXTRACT(EPOCH FROM ob.created_at - ib.created_at) / 60.0)::numeric, 1) AS avg_resp,
      round(PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM ob.created_at - ib.created_at) / 60.0
      )::numeric, 1) AS median_resp
    FROM inbound_blocks ib
    JOIN msgs ob ON ob.contact_id = ib.contact_id
      AND ob.direction = 'outbound'
      AND ob.sent_by_user_id IS NOT NULL
      AND ob.created_at > ib.created_at
      AND ob.created_at < COALESCE(ib.next_same_direction, 'infinity'::timestamptz)
    GROUP BY 1
  ),
  agent_performance AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'user_name', a.user_name,
        'messages_sent', a.messages_sent,
        'conversations_handled', a.conversations_handled,
        'avg_response_minutes', COALESCE(f.avg_resp, 0),
        'median_response_minutes', COALESCE(f.median_resp, 0)
      ) ORDER BY a.messages_sent DESC
    ) AS val
    FROM agent_perf_raw a
    LEFT JOIN agent_frt f ON f.agent_key = a.agent_key
  ),

  -- 6. Aging — CURRENT STATE (ignores date filter, respects product + owner)
  -- Shows conversations that are waiting for a reply RIGHT NOW
  aging_base AS (
    SELECT DISTINCT ON (wm.contact_id)
      wm.contact_id, wm.created_at AS last_inbound_at
    FROM whatsapp_messages wm
    WHERE wm.direction = 'inbound'
      AND (p_produto IS NULL OR wm.produto = p_produto)
      AND (p_owner_id IS NULL OR wm.contact_id IN (SELECT contact_id FROM owner_contacts))
    ORDER BY wm.contact_id, wm.created_at DESC
  ),
  unanswered AS (
    SELECT
      ab.contact_id,
      EXTRACT(EPOCH FROM NOW() - ab.last_inbound_at) / 3600.0 AS hours_waiting
    FROM aging_base ab
    WHERE NOT EXISTS (
      SELECT 1 FROM whatsapp_messages ob
      WHERE ob.contact_id = ab.contact_id
        AND ob.direction = 'outbound'
        AND ob.created_at > ab.last_inbound_at
    )
  ),
  aging_buckets AS (
    SELECT jsonb_agg(
      jsonb_build_object('bucket', bucket, 'count', cnt)
      ORDER BY ord
    ) AS val
    FROM (
      SELECT
        CASE
          WHEN hours_waiting < 1 THEN '< 1h'
          WHEN hours_waiting < 4 THEN '1-4h'
          WHEN hours_waiting < 24 THEN '4-24h'
          ELSE '> 24h'
        END AS bucket,
        CASE
          WHEN hours_waiting < 1 THEN 1
          WHEN hours_waiting < 4 THEN 2
          WHEN hours_waiting < 24 THEN 3
          ELSE 4
        END AS ord,
        count(*) AS cnt
      FROM unanswered
      GROUP BY 1, 2
    ) ab
  ),
  aging AS (
    SELECT jsonb_build_object(
      'total_unanswered', (SELECT count(*) FROM unanswered),
      'buckets', COALESCE(ab.val, '[]'::jsonb)
    ) AS val
    FROM aging_buckets ab
  ),

  -- 7. Message types
  message_types AS (
    SELECT jsonb_agg(
      jsonb_build_object('type', mt, 'count', cnt)
      ORDER BY cnt DESC
    ) AS val
    FROM (
      SELECT
        COALESCE(NULLIF(message_type, ''), 'text') AS mt,
        count(*) AS cnt
      FROM msgs
      GROUP BY 1
    ) t
  ),

  -- 8. AI stats
  ai_stats AS (
    SELECT jsonb_build_object(
      'total_ai_msgs', count(*) FILTER (WHERE is_ai AND direction = 'outbound'),
      'total_human_msgs', count(*) FILTER (WHERE NOT is_ai AND direction = 'outbound'),
      'ai_ratio', CASE
        WHEN count(*) FILTER (WHERE direction = 'outbound') > 0
        THEN round(
          count(*) FILTER (WHERE is_ai AND direction = 'outbound')::numeric /
          count(*) FILTER (WHERE direction = 'outbound') * 100, 1
        )
        ELSE 0
      END,
      'ai_conversations', count(DISTINCT contact_id) FILTER (WHERE is_ai AND direction = 'outbound')
    ) AS val FROM msgs
  )

  SELECT jsonb_build_object(
    'overview', o.val,
    'daily_volume', COALESCE(dv.val, '[]'::jsonb),
    'hourly_heatmap', COALESCE(hh.val, '[]'::jsonb),
    'first_response', fr.val,
    'agent_performance', COALESCE(ap.val, '[]'::jsonb),
    'aging', ag.val,
    'message_types', COALESCE(mt.val, '[]'::jsonb),
    'ai_stats', ai.val
  ) INTO result
  FROM overview o, daily_volume dv, hourly_heatmap hh,
       first_response fr, agent_performance ap,
       aging ag, message_types mt, ai_stats ai;

  RETURN result;
END;
$$;
