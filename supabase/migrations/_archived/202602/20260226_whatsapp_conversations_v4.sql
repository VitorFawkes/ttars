-- =====================================================
-- WhatsApp Conversations V4 — Instance filter + Owner info
--
-- Adds:
-- - p_instance filter (phone_number_label)
-- - owner_name per row (from card's current-phase owner)
-- - by_instance breakdown in summary
-- - instance_labels list in summary (for UI dropdowns)
-- =====================================================

-- Drop old signature first
DROP FUNCTION IF EXISTS analytics_whatsapp_conversations(date, date, text, uuid, text, text, text, integer, integer, text, text, uuid);

CREATE OR REPLACE FUNCTION analytics_whatsapp_conversations(
  p_from       DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to         DATE DEFAULT CURRENT_DATE,
  p_produto    TEXT DEFAULT NULL,
  p_owner_id   UUID DEFAULT NULL,
  p_status     TEXT DEFAULT NULL,
  p_sort_by    TEXT DEFAULT 'last_message_at',
  p_sort_dir   TEXT DEFAULT 'desc',
  p_limit      INT  DEFAULT 25,
  p_offset     INT  DEFAULT 0,
  p_search     TEXT DEFAULT NULL,
  p_phase_slug TEXT DEFAULT NULL,
  p_stage_id   UUID DEFAULT NULL,
  p_instance   TEXT DEFAULT NULL   -- Filter by phone_number_label (WhatsApp instance)
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
      AND (p_instance IS NULL OR wm.phone_number_label = p_instance)
  ),

  last_msg AS (
    SELECT DISTINCT ON (contact_id)
      contact_id, direction AS last_direction, created_at AS last_message_at
    FROM msgs
    ORDER BY contact_id, created_at DESC
  ),

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
      -- Card info
      ca.id AS card_id,
      ca.titulo AS card_titulo,
      ps.id AS stage_id,
      ps.nome AS stage_name,
      pp.slug AS phase_slug,
      pp.label AS phase_label,
      -- Owner name: pick from card based on current phase
      COALESCE(
        CASE pp.slug
          WHEN 'sdr' THEN sdr_p.nome
          WHEN 'planner' THEN vendas_p.nome
          WHEN 'pos_venda' THEN pos_p.nome
          WHEN 'resolucao' THEN concierge_p.nome
          ELSE sdr_p.nome
        END,
        sdr_p.nome, vendas_p.nome, pos_p.nome, concierge_p.nome
      ) AS owner_name,
      -- Primary instance for this contact (most msgs)
      (SELECT sub.phone_number_label FROM (
        SELECT phone_number_label, count(*) AS cnt
        FROM msgs sub_m
        WHERE sub_m.contact_id = m.contact_id AND sub_m.phone_number_label IS NOT NULL
        GROUP BY phone_number_label
        ORDER BY cnt DESC LIMIT 1
      ) sub) AS instance_label
    FROM msgs m
    LEFT JOIN contatos ct ON ct.id = m.contact_id
    LEFT JOIN last_msg lm ON lm.contact_id = m.contact_id
    LEFT JOIN first_response fr ON fr.contact_id = m.contact_id
    LEFT JOIN LATERAL (
      SELECT c.id, c.titulo, c.pipeline_stage_id,
             c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.concierge_owner_id
      FROM cards c
      WHERE c.pessoa_principal_id = m.contact_id
        AND c.deleted_at IS NULL
      ORDER BY c.created_at DESC
      LIMIT 1
    ) ca ON true
    LEFT JOIN pipeline_stages ps ON ps.id = ca.pipeline_stage_id
    LEFT JOIN pipeline_phases pp ON pp.id = ps.phase_id
    LEFT JOIN profiles sdr_p ON sdr_p.id = ca.sdr_owner_id
    LEFT JOIN profiles vendas_p ON vendas_p.id = ca.vendas_owner_id
    LEFT JOIN profiles pos_p ON pos_p.id = ca.pos_owner_id
    LEFT JOIN profiles concierge_p ON concierge_p.id = ca.concierge_owner_id
    GROUP BY m.contact_id, lm.last_direction, lm.last_message_at, fr.frt_minutes,
             ca.id, ca.titulo, ca.sdr_owner_id, ca.vendas_owner_id, ca.pos_owner_id, ca.concierge_owner_id,
             ps.id, ps.nome, pp.slug, pp.label,
             sdr_p.nome, vendas_p.nome, pos_p.nome, concierge_p.nome
  ),

  filtered AS (
    SELECT * FROM convos
    WHERE (p_status IS NULL OR status = p_status)
      AND (p_search IS NULL OR contact_name ILIKE '%' || p_search || '%' OR contact_phone ILIKE '%' || p_search || '%')
      AND (p_phase_slug IS NULL OR phase_slug = p_phase_slug)
      AND (p_stage_id IS NULL OR stage_id = p_stage_id)
  ),

  total AS (
    SELECT count(*) AS cnt FROM filtered
  ),

  -- Summary KPIs from ALL convos (not distorted by search/filters)
  summary AS (
    SELECT jsonb_build_object(
      'total_conversations', count(*),
      'active_conversations', count(*) FILTER (WHERE status <> 'inactive'),
      'waiting_count', count(*) FILTER (WHERE status = 'waiting'),
      'responded_count', count(*) FILTER (WHERE status = 'responded'),
      'inactive_count', count(*) FILTER (WHERE status = 'inactive'),
      'avg_conversation_hours', round(COALESCE(AVG(
        EXTRACT(EPOCH FROM last_message_at - first_message_at) / 3600.0
      ), 0)::numeric, 1),
      'with_card_count', count(*) FILTER (WHERE card_id IS NOT NULL),
      'by_phase', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'phase_slug', COALESCE(sub.phase_slug, 'sem_card'),
          'phase_label', COALESCE(sub.phase_label, 'Sem Card Vinculado'),
          'count', sub.cnt
        ) ORDER BY sub.cnt DESC)
        FROM (
          SELECT phase_slug, phase_label, count(*) AS cnt
          FROM convos GROUP BY phase_slug, phase_label
        ) sub
      ), '[]'::jsonb),
      'by_instance', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'label', COALESCE(sub.instance_label, 'Não identificado'),
          'count', sub.cnt
        ) ORDER BY sub.cnt DESC)
        FROM (
          SELECT instance_label, count(*) AS cnt
          FROM convos GROUP BY instance_label
        ) sub
      ), '[]'::jsonb),
      'instance_labels', COALESCE((
        SELECT jsonb_agg(DISTINCT wm.phone_number_label ORDER BY wm.phone_number_label)
        FROM whatsapp_messages wm
        WHERE wm.phone_number_label IS NOT NULL
          AND length(wm.phone_number_label) > 3
          AND wm.phone_number_label !~ '^\d'
          AND wm.created_at >= p_from
          AND wm.created_at < (p_to + INTERVAL '1 day')
      ), '[]'::jsonb)
    ) AS val FROM convos
  ),

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
        'card_titulo', card_titulo,
        'stage_name', stage_name,
        'phase_slug', phase_slug,
        'phase_label', phase_label,
        'owner_name', owner_name,
        'instance_label', instance_label
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
