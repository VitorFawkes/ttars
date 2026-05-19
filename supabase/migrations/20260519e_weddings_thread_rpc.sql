-- Nova RPC pra puxar a thread completa de uma conversa Weddings.
--
-- Motivo: o drawer atual filtra a view e em alguns casos pode ser barrado
-- por RLS quando o frontend chama. Esta RPC usa SECURITY DEFINER pra
-- garantir entrega da thread, e ainda une duas fontes:
--   1. whatsapp_messages (fonte principal — 790 inbound + 1489 outbound no Elopement)
--   2. ai_conversation_turns (mensagens que a Patricia processou via router v2)
--
-- Dedup por (direção, minuto, primeiros 50 chars do body) pra evitar
-- duplicação quando a mesma mensagem foi gravada nas duas tabelas.

DROP FUNCTION IF EXISTS get_weddings_conversation_thread(TEXT, TEXT, INT) CASCADE;

CREATE OR REPLACE FUNCTION get_weddings_conversation_thread(
  p_customer_phone   TEXT,
  p_phone_line_label TEXT,
  p_limit            INT DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result   JSONB;
  v_limit    INT := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_contact  UUID;
BEGIN
  -- Resolve contact_id pra também ler ai_conversation_turns
  SELECT (ARRAY_AGG(contact_id ORDER BY sent_at DESC) FILTER (WHERE contact_id IS NOT NULL))[1]
  INTO v_contact
  FROM vw_weddings_messages_unified
  WHERE customer_phone = p_customer_phone
    AND phone_line_label = p_phone_line_label;

  WITH from_messages AS (
    SELECT
      message_id::TEXT       AS message_id,
      direction,
      body,
      sent_at,
      attribution_mode,
      sent_by_user_name,
      'whatsapp_messages'    AS source
    FROM vw_weddings_messages_unified
    WHERE customer_phone = p_customer_phone
      AND phone_line_label = p_phone_line_label
  ),
  from_ai_turns AS (
    SELECT
      t.id::TEXT                                                 AS message_id,
      CASE WHEN t.role = 'user' THEN 'inbound' ELSE 'outbound' END AS direction,
      t.content                                                  AS body,
      t.created_at                                               AS sent_at,
      CASE WHEN t.role = 'user' THEN 'lead' ELSE 'ai_agent' END  AS attribution_mode,
      NULL::TEXT                                                 AS sent_by_user_name,
      'ai_conversation_turns'                                    AS source
    FROM ai_conversation_turns t
    JOIN ai_conversations c ON c.id = t.conversation_id
    WHERE v_contact IS NOT NULL
      AND c.contact_id = v_contact
      AND t.content IS NOT NULL
      AND t.content !~ '^[[:space:]]*$'
  ),
  combined AS (
    SELECT * FROM from_messages
    UNION ALL
    SELECT * FROM from_ai_turns
  ),
  -- Dedup: mesma direção + mesmo minuto + body parecido = considera mesma msg
  deduped AS (
    SELECT DISTINCT ON (
      direction,
      DATE_TRUNC('minute', sent_at),
      LEFT(COALESCE(body, ''), 50)
    )
      message_id, direction, body, sent_at, attribution_mode,
      sent_by_user_name, source
    FROM combined
    ORDER BY direction, DATE_TRUNC('minute', sent_at), LEFT(COALESCE(body, ''), 50), sent_at
  )
  SELECT jsonb_build_object(
    'thread', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'message_id',        message_id,
          'direction',         direction,
          'body',              body,
          'sent_at',           sent_at,
          'attribution_mode',  attribution_mode,
          'sent_by_user_name', sent_by_user_name,
          'source',            source
        ) ORDER BY sent_at ASC
      ) FROM (SELECT * FROM deduped ORDER BY sent_at DESC LIMIT v_limit) sub),
      '[]'::JSONB
    ),
    'stats', jsonb_build_object(
      'total',         (SELECT COUNT(*) FROM deduped),
      'inbound',       (SELECT COUNT(*) FROM deduped WHERE direction = 'inbound'),
      'outbound',      (SELECT COUNT(*) FROM deduped WHERE direction = 'outbound'),
      'sources_used',  (SELECT jsonb_agg(DISTINCT source) FROM deduped)
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_weddings_conversation_thread IS
  'Thread completa de uma conversa Weddings unindo whatsapp_messages + ai_conversation_turns. Dedup por (direction, minuto, body). SECURITY DEFINER pra atravessar RLS no drawer.';

GRANT EXECUTE ON FUNCTION get_weddings_conversation_thread(TEXT, TEXT, INT) TO authenticated;
