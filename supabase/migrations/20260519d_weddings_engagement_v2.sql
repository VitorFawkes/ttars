-- Dashboard de Engajamento Welcome Weddings — v2 (FIX crítico)
--
-- A v1 (20260519b/c) filtrava por whatsapp_messages.phone_number_id, que
-- está NULL em ~98% das linhas. Resultado: a view via apenas 218 das
-- ~33.000 mensagens reais e ignorava milhares de conversas onde o lead
-- não respondeu — que era exatamente o que o Vitor precisava ver.
--
-- Correções:
-- 1. Filtro de linha agora usa phone_number_label (regex flexível) em vez
--    de phone_number_id. Suporta as grafias "Elopement", "Elopment",
--    "SDR Weddings", "Teste Vitor".
-- 2. Unidade de análise muda de contact_id pra sender_phone (telefone
--    do lead). Isso captura conversas mesmo quando a pessoa não tem
--    contato cadastrado no CRM ainda.
-- 3. Fonte única vira whatsapp_messages — descobri que inbound está
--    sendo gravado lá (12.746 linhas), não preciso mais do JOIN com
--    whatsapp_raw_events. Simplifica e acelera muito.
-- 4. Aceita contact_id e card_id NULL (pessoa sem cadastro também
--    aparece no relatório).

DROP FUNCTION IF EXISTS analytics_weddings_conversations(
  DATE, DATE, UUID[], TEXT[], TEXT[], INT, BOOLEAN, INT, INT
) CASCADE;

DROP VIEW IF EXISTS vw_weddings_messages_unified CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- View v2 — fonte única, baseada em phone_number_label
-- ─────────────────────────────────────────────────────────────────────────

CREATE VIEW vw_weddings_messages_unified AS
SELECT
  wm.id                                                         AS message_id,
  wm.contact_id,
  wm.card_id,
  wm.sender_phone                                               AS customer_phone,
  wm.phone_number_label                                         AS phone_line_label,
  wm.direction,
  wm.body,
  wm.created_at                                                 AS sent_at,
  wm.status,
  wm.ack_status,
  wm.is_read,
  wm.sent_by_user_id,
  wm.sent_by_user_name,
  wm.ecko_agent_id,
  NULLIF(wm.metadata->>'agent_id', '')::UUID                    AS attributed_agent_id,
  wm.metadata,
  CASE
    WHEN wm.direction = 'inbound'                                          THEN 'lead'
    WHEN wm.sent_by_user_id IS NOT NULL                                    THEN 'human'
    WHEN wm.metadata->>'source' IN ('ai_agent_v2','ai_agent_v2_fallback')  THEN 'ai_agent'
    WHEN wm.metadata->>'cadence_instance_id' IS NOT NULL                   THEN 'cadence'
    WHEN wm.ecko_agent_id IS NOT NULL                                      THEN 'ai_agent'
    ELSE 'unknown'
  END                                                           AS attribution_mode
FROM whatsapp_messages wm
WHERE wm.phone_number_label IS NOT NULL
  AND wm.phone_number_label ~* '(elop|sdr.*wedd|welcome.?wedd|teste.*vitor)'
  AND wm.sender_phone IS NOT NULL;

COMMENT ON VIEW vw_weddings_messages_unified IS
  'v2 — Welcome Weddings: mensagens de todas as linhas Wedding (Elopement/Elopment, SDR Weddings, Teste Vitor) filtradas por phone_number_label regex. Unidade: customer_phone (sender_phone). Inclui pessoas sem contact_id.';

GRANT SELECT ON vw_weddings_messages_unified TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- RPC v2 — agrupa por customer_phone (não por contact_id)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION analytics_weddings_conversations(
  p_from                  DATE,
  p_to                    DATE,
  p_line_labels           TEXT[]  DEFAULT NULL,
  p_attribution_modes     TEXT[]  DEFAULT NULL,
  p_state_filter          TEXT[]  DEFAULT NULL,
  p_cold_threshold_hours  INT     DEFAULT 48,
  p_include_test_lines    BOOLEAN DEFAULT FALSE,
  p_page                  INT     DEFAULT 1,
  p_limit                 INT     DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
  v_limit  INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset INT := GREATEST(0, (COALESCE(p_page, 1) - 1) * v_limit);
BEGIN
  WITH
  filtered_msgs AS (
    SELECT v.*
    FROM vw_weddings_messages_unified v
    WHERE v.sent_at::DATE BETWEEN p_from AND p_to
      AND (p_include_test_lines OR v.phone_line_label !~* 'teste')
      AND (p_line_labels IS NULL OR v.phone_line_label = ANY(p_line_labels))
  ),
  -- 1 linha por (telefone, linha): conversa real entre nós e o lead
  conversation_summary AS (
    SELECT
      customer_phone,
      phone_line_label,
      MIN(sent_at) FILTER (WHERE direction = 'outbound')                       AS first_outbound_at,
      MAX(sent_at) FILTER (WHERE direction = 'outbound')                       AS last_outbound_at,
      MIN(sent_at) FILTER (WHERE direction = 'inbound')                        AS first_inbound_at,
      MAX(sent_at) FILTER (WHERE direction = 'inbound')                        AS last_inbound_at,
      COUNT(*)     FILTER (WHERE direction = 'outbound')::INT                  AS outbound_count,
      COUNT(*)     FILTER (WHERE direction = 'inbound') ::INT                  AS inbound_count,
      (ARRAY_AGG(contact_id ORDER BY sent_at DESC) FILTER (WHERE contact_id IS NOT NULL))[1] AS contact_id,
      (ARRAY_AGG(card_id    ORDER BY sent_at DESC) FILTER (WHERE card_id IS NOT NULL))[1]    AS card_id,
      ARRAY_REMOVE(
        ARRAY_AGG(DISTINCT attribution_mode)
          FILTER (WHERE direction = 'outbound' AND attribution_mode IS NOT NULL),
        NULL
      )                                                                        AS attribution_modes
    FROM filtered_msgs
    GROUP BY customer_phone, phone_line_label
  ),
  conv_after_attribution AS (
    SELECT *
    FROM conversation_summary
    WHERE p_attribution_modes IS NULL
       OR attribution_modes && p_attribution_modes
  ),
  card_lookup AS (
    SELECT DISTINCT ON (c.id)
      c.id                  AS card_id,
      c.status_comercial,
      c.ganho_sdr
    FROM cards c
    WHERE c.produto = 'WEDDING'
      AND c.id IN (SELECT card_id FROM conv_after_attribution WHERE card_id IS NOT NULL)
  ),
  conv_with_state AS (
    SELECT
      ca.*,
      cl.status_comercial,
      cl.ganho_sdr,
      EXTRACT(EPOCH FROM (ca.first_inbound_at - ca.first_outbound_at)) / 3600 AS frt_hours,
      EXTRACT(EPOCH FROM (NOW() - ca.last_inbound_at)) / 3600                AS hours_since_inbound,
      CASE
        WHEN cl.status_comercial = 'ganho' OR cl.ganho_sdr = TRUE             THEN 'won'
        WHEN ca.inbound_count = 0                                             THEN 'cold'
        WHEN NOW() - ca.last_inbound_at <= INTERVAL '24 hours'                THEN 'hot'
        WHEN NOW() - ca.last_inbound_at <= INTERVAL '7 days'                  THEN 'warm'
        WHEN ca.inbound_count > 0
          AND EXTRACT(EPOCH FROM (NOW() - ca.last_inbound_at)) / 3600
              > p_cold_threshold_hours                                        THEN 'lost'
        ELSE 'warm'
      END                                                                    AS state
    FROM conv_after_attribution ca
    LEFT JOIN card_lookup cl ON cl.card_id = ca.card_id
  ),
  conv_filtered AS (
    SELECT *
    FROM conv_with_state
    WHERE p_state_filter IS NULL OR state = ANY(p_state_filter)
  ),
  kpis AS (
    SELECT
      COUNT(*)::INT                                                           AS total_contacts,
      ROUND(
        COUNT(*) FILTER (WHERE inbound_count > 0)::NUMERIC
          / NULLIF(COUNT(*), 0) * 100, 1
      )                                                                       AS reply_rate,
      ROUND(AVG(inbound_count)::NUMERIC, 1)                                   AS depth_avg,
      ROUND(
        COUNT(*) FILTER (WHERE state = 'cold')::NUMERIC
          / NULLIF(COUNT(*), 0) * 100, 1
      )                                                                       AS cold_pct,
      ROUND(
        COUNT(*) FILTER (WHERE inbound_count = 1 AND state = 'lost')::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE inbound_count >= 1), 0) * 100, 1
      )                                                                       AS responded_once_left_pct,
      ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY frt_hours)
          FILTER (WHERE frt_hours IS NOT NULL AND frt_hours >= 0)::NUMERIC, 1
      )                                                                       AS frt_median_hours,
      COUNT(*) FILTER (WHERE state IN ('hot','warm'))::INT                    AS active_count,
      ROUND(
        COUNT(*) FILTER (WHERE state = 'won')::NUMERIC
          / NULLIF(COUNT(*), 0) * 100, 1
      )                                                                       AS win_rate
    FROM conv_filtered
  ),
  funnel AS (
    SELECT json_agg(json_build_object('step', step, 'count', cnt, 'order', ord) ORDER BY ord) AS data
    FROM (
      SELECT 1 AS ord, 'Contatado'    AS step, COUNT(*)::INT                                        AS cnt FROM conv_filtered
      UNION ALL SELECT 2, 'Respondeu 1×', COUNT(*) FILTER (WHERE inbound_count >= 1)::INT          FROM conv_filtered
      UNION ALL SELECT 3, 'Respondeu 3×', COUNT(*) FILTER (WHERE inbound_count >= 3)::INT          FROM conv_filtered
      UNION ALL SELECT 4, 'Ativa',        COUNT(*) FILTER (WHERE state IN ('hot','warm'))::INT     FROM conv_filtered
      UNION ALL SELECT 5, 'Virou Card',   COUNT(*) FILTER (WHERE card_id IS NOT NULL)::INT         FROM conv_filtered
      UNION ALL SELECT 6, 'Ganhou',       COUNT(*) FILTER (WHERE state = 'won')::INT               FROM conv_filtered
    ) f
  ),
  paginated AS (
    SELECT json_agg(row_data ORDER BY ord) AS data
    FROM (
      SELECT
        ROW_NUMBER() OVER (ORDER BY cf.last_inbound_at DESC NULLS LAST, cf.first_outbound_at DESC NULLS LAST) AS ord,
        json_build_object(
          'customer_phone',    cf.customer_phone,
          'contact_id',        cf.contact_id,
          'contact_name',      co.nome,
          'phone_line_label',  cf.phone_line_label,
          'first_outbound_at', cf.first_outbound_at,
          'last_outbound_at',  cf.last_outbound_at,
          'first_inbound_at',  cf.first_inbound_at,
          'last_inbound_at',   cf.last_inbound_at,
          'inbound_count',     cf.inbound_count,
          'outbound_count',    cf.outbound_count,
          'frt_hours',         ROUND(cf.frt_hours::NUMERIC, 1),
          'hours_since_inbound', ROUND(cf.hours_since_inbound::NUMERIC, 1),
          'state',             cf.state,
          'card_id',           cf.card_id,
          'attribution_modes', cf.attribution_modes
        ) AS row_data
      FROM conv_filtered cf
      LEFT JOIN contatos co ON co.id = cf.contact_id
      ORDER BY cf.last_inbound_at DESC NULLS LAST, cf.first_outbound_at DESC NULLS LAST
      LIMIT v_limit OFFSET v_offset
    ) sub
  ),
  lines_catalog AS (
    SELECT json_agg(
      json_build_object(
        'label',   label,
        'is_test', label ~* 'teste'
      ) ORDER BY label
    ) AS data
    FROM (
      SELECT DISTINCT phone_number_label AS label
      FROM whatsapp_messages
      WHERE phone_number_label IS NOT NULL
        AND phone_number_label ~* '(elop|sdr.*wedd|welcome.?wedd|teste.*vitor)'
    ) ll
  )
  SELECT jsonb_build_object(
    'kpis', (
      SELECT jsonb_build_object(
        'total_contacts',          total_contacts,
        'reply_rate',              reply_rate,
        'depth_avg',               depth_avg,
        'cold_pct',                cold_pct,
        'responded_once_left_pct', responded_once_left_pct,
        'frt_median_hours',        frt_median_hours,
        'active_count',            active_count,
        'win_rate',                win_rate
      ) FROM kpis
    ),
    'funnel',        COALESCE((SELECT data FROM funnel), '[]'::JSON)::JSONB,
    'conversations', COALESCE((SELECT data FROM paginated), '[]'::JSON)::JSONB,
    'pagination', jsonb_build_object(
      'page',  COALESCE(p_page, 1),
      'limit', v_limit,
      'total', (SELECT total_contacts FROM kpis)
    ),
    'lines', COALESCE((SELECT data FROM lines_catalog), '[]'::JSON)::JSONB
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION analytics_weddings_conversations IS
  'v2 — Dashboard Engajamento Welcome Weddings. Unidade: customer_phone (sender_phone). Linhas via regex em phone_number_label. Captura conversas mesmo sem contato cadastrado no CRM.';

GRANT EXECUTE ON FUNCTION analytics_weddings_conversations(
  DATE, DATE, TEXT[], TEXT[], TEXT[], INT, BOOLEAN, INT, INT
) TO authenticated;
