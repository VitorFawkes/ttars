-- =====================================================
-- Analytics WhatsApp Conversations — Drill-down list
--
-- Lista conversas (agrupadas por contact_id) com:
-- nome, telefone, contagens, FRT, status, card linkage.
--
-- Paginação server-side, ordenável, filtrável por status.
-- Status: waiting (última inbound sem reply),
--         responded (última outbound),
--         inactive (sem msg nos últimos 7 dias)
-- =====================================================

CREATE OR REPLACE FUNCTION analytics_whatsapp_conversations(
  p_from      DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to        DATE DEFAULT CURRENT_DATE,
  p_produto   TEXT DEFAULT NULL,
  p_owner_id  UUID DEFAULT NULL,
  p_status    TEXT DEFAULT NULL,  -- NULL=all, 'waiting', 'responded', 'inactive'
  p_sort_by   TEXT DEFAULT 'last_message_at',
  p_sort_dir  TEXT DEFAULT 'desc',
  p_limit     INT  DEFAULT 25,
  p_offset    INT  DEFAULT 0
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

  -- Base messages in period
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

  -- Last message per contact (for status)
  last_msg AS (
    SELECT DISTINCT ON (contact_id)
      contact_id, direction AS last_direction, created_at AS last_message_at
    FROM msgs
    ORDER BY contact_id, created_at DESC
  ),

  -- First inbound per contact + first outbound after it (FRT)
  first_inbound AS (
    SELECT DISTINCT ON (contact_id)
      contact_id, created_at AS first_inbound_at
    FROM msgs
    WHERE direction = 'inbound'
    ORDER BY contact_id, created_at ASC
  ),
  first_response AS (
    SELECT
      fi.contact_id,
      EXTRACT(EPOCH FROM MIN(m.created_at) - fi.first_inbound_at) / 60.0 AS frt_minutes
    FROM first_inbound fi
    JOIN msgs m ON m.contact_id = fi.contact_id
      AND m.direction = 'outbound'
      AND m.created_at > fi.first_inbound_at
    GROUP BY fi.contact_id, fi.first_inbound_at
  ),

  -- Aggregated conversation data
  convos AS (
    SELECT
      m.contact_id,
      MAX(COALESCE(ct.nome, m.sender_name)) AS contact_name,
      MAX(m.sender_phone) FILTER (WHERE m.direction = 'inbound') AS contact_phone,
      count(*) AS total_messages,
      count(*) FILTER (WHERE m.direction = 'inbound') AS inbound_count,
      count(*) FILTER (WHERE m.direction = 'outbound') AS outbound_count,
      count(*) FILTER (WHERE m.is_ai AND m.direction = 'outbound') AS ai_count,
      count(*) FILTER (WHERE NOT m.is_ai AND m.direction = 'outbound') AS human_count,
      MIN(m.created_at) AS first_message_at,
      MAX(m.created_at) AS last_message_at,
      lm.last_direction,
      EXTRACT(EPOCH FROM NOW() - MAX(m.created_at)) / 3600.0 AS hours_since_last,
      COALESCE(fr.frt_minutes, NULL) AS first_response_min,
      CASE
        WHEN MAX(m.created_at) < NOW() - INTERVAL '7 days' THEN 'inactive'
        WHEN lm.last_direction = 'inbound' AND NOT EXISTS (
          SELECT 1 FROM msgs ob
          WHERE ob.contact_id = m.contact_id
            AND ob.direction = 'outbound'
            AND ob.created_at > lm.last_message_at
        ) THEN 'waiting'
        ELSE 'responded'
      END AS status,
      -- Card linkage via pessoa_principal_id
      ca.id AS card_id,
      ca.titulo AS card_titulo
    FROM msgs m
    LEFT JOIN contatos ct ON ct.id = m.contact_id
    LEFT JOIN last_msg lm ON lm.contact_id = m.contact_id
    LEFT JOIN first_response fr ON fr.contact_id = m.contact_id
    LEFT JOIN LATERAL (
      SELECT c.id, c.titulo
      FROM cards c
      WHERE c.pessoa_principal_id = m.contact_id
        AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT 1
    ) ca ON true
    GROUP BY m.contact_id, lm.last_direction, lm.last_message_at, fr.frt_minutes, ca.id, ca.titulo
  ),

  -- Apply status filter
  filtered AS (
    SELECT * FROM convos
    WHERE (p_status IS NULL OR status = p_status)
  ),

  -- Total count before pagination
  total AS (
    SELECT count(*) AS cnt FROM filtered
  ),

  -- Summary KPIs
  summary AS (
    SELECT jsonb_build_object(
      'total_conversations', (SELECT cnt FROM total),
      'active_conversations', count(*) FILTER (WHERE status <> 'inactive'),
      'waiting_count', count(*) FILTER (WHERE status = 'waiting'),
      'responded_count', count(*) FILTER (WHERE status = 'responded'),
      'inactive_count', count(*) FILTER (WHERE status = 'inactive'),
      'avg_conversation_hours', round(AVG(
        EXTRACT(EPOCH FROM last_message_at - first_message_at) / 3600.0
      )::numeric, 1)
    ) AS val FROM filtered
  ),

  -- Sorted + paginated rows
  sorted AS (
    SELECT *
    FROM filtered
    ORDER BY
      CASE WHEN p_sort_by = 'last_message_at' AND p_sort_dir = 'desc' THEN last_message_at END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'last_message_at' AND p_sort_dir = 'asc' THEN last_message_at END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'total_messages' AND p_sort_dir = 'desc' THEN total_messages END DESC,
      CASE WHEN p_sort_by = 'total_messages' AND p_sort_dir = 'asc' THEN total_messages END ASC,
      CASE WHEN p_sort_by = 'hours_since_last' AND p_sort_dir = 'desc' THEN hours_since_last END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'hours_since_last' AND p_sort_dir = 'asc' THEN hours_since_last END ASC NULLS LAST,
      CASE WHEN p_sort_by = 'first_response_min' AND p_sort_dir = 'desc' THEN first_response_min END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'first_response_min' AND p_sort_dir = 'asc' THEN first_response_min END ASC NULLS LAST,
      -- Default fallback
      last_message_at DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset
  ),

  rows_json AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'contact_id', contact_id,
        'contact_name', contact_name,
        'contact_phone', contact_phone,
        'total_messages', total_messages,
        'inbound_count', inbound_count,
        'outbound_count', outbound_count,
        'ai_count', ai_count,
        'human_count', human_count,
        'first_message_at', first_message_at,
        'last_message_at', last_message_at,
        'last_direction', last_direction,
        'hours_since_last', round(hours_since_last::numeric, 1),
        'first_response_min', round(COALESCE(first_response_min, -1)::numeric, 1),
        'status', status,
        'card_id', card_id,
        'card_titulo', card_titulo
      )
    ) AS val FROM sorted
  )

  SELECT jsonb_build_object(
    'summary', s.val,
    'rows', COALESCE(r.val, '[]'::jsonb),
    'total_count', (SELECT cnt FROM total)
  ) INTO result
  FROM summary s, rows_json r;

  RETURN result;
END;
$$;
