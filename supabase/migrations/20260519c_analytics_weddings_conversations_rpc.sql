-- RPC analytics_weddings_conversations — motor do Dashboard de Engajamento
--
-- Consome vw_weddings_messages_unified (Marco 0). Agrupa por contact_id
-- pra calcular: 6 KPIs, funil de 5 degraus, lista paginada de conversas,
-- catálogo de linhas pro filtro do frontend.
--
-- Unidade de análise: 1 contato = 1 pessoa (mesmo com múltiplos cards).
-- Janela "lost": 48h sem inbound desde último outbound (parametrizável).
-- Linhas de teste (label ILIKE '%teste%') excluídas por default.

CREATE OR REPLACE FUNCTION analytics_weddings_conversations(
  p_from                  DATE,
  p_to                    DATE,
  p_linha_ids             UUID[]  DEFAULT NULL,
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
  active_lines AS (
    SELECT id, phone_number_label
    FROM whatsapp_linha_config
    WHERE produto = 'WEDDING'
      AND ativo = TRUE
      AND (p_include_test_lines OR phone_number_label NOT ILIKE '%teste%')
      AND (p_linha_ids IS NULL OR id = ANY(p_linha_ids))
  ),
  filtered_msgs AS (
    SELECT v.*
    FROM vw_weddings_messages_unified v
    INNER JOIN active_lines al ON al.id = v.phone_line_id
    WHERE v.sent_at::DATE BETWEEN p_from AND p_to
  ),
  contact_summary AS (
    SELECT
      contact_id,
      phone_line_id,
      MIN(sent_at) FILTER (WHERE direction = 'outbound')                       AS first_outbound_at,
      MAX(sent_at) FILTER (WHERE direction = 'outbound')                       AS last_outbound_at,
      MIN(sent_at) FILTER (WHERE direction = 'inbound')                        AS first_inbound_at,
      MAX(sent_at) FILTER (WHERE direction = 'inbound')                        AS last_inbound_at,
      COUNT(*)     FILTER (WHERE direction = 'outbound')::INT                  AS outbound_count,
      COUNT(*)     FILTER (WHERE direction = 'inbound') ::INT                  AS inbound_count,
      ARRAY_REMOVE(
        ARRAY_AGG(DISTINCT attribution_mode)
          FILTER (WHERE direction = 'outbound' AND attribution_mode IS NOT NULL),
        NULL
      )                                                                        AS attribution_modes
    FROM filtered_msgs
    GROUP BY contact_id, phone_line_id
  ),
  contact_after_attribution AS (
    SELECT *
    FROM contact_summary
    WHERE p_attribution_modes IS NULL
       OR attribution_modes && p_attribution_modes
  ),
  card_lookup AS (
    SELECT DISTINCT ON (c.pessoa_principal_id)
      c.pessoa_principal_id AS contact_id,
      c.id                  AS card_id,
      c.status_comercial,
      c.ganho_sdr,
      c.ganho_planner
    FROM cards c
    WHERE c.produto = 'WEDDING'
      AND c.pessoa_principal_id IN (SELECT contact_id FROM contact_after_attribution)
    ORDER BY c.pessoa_principal_id, c.created_at DESC NULLS LAST
  ),
  contact_with_state AS (
    SELECT
      ca.*,
      cl.card_id,
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
    FROM contact_after_attribution ca
    LEFT JOIN card_lookup cl ON cl.contact_id = ca.contact_id
  ),
  contact_filtered AS (
    SELECT *
    FROM contact_with_state
    WHERE p_state_filter IS NULL
       OR state = ANY(p_state_filter)
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
          FILTER (WHERE frt_hours IS NOT NULL)::NUMERIC, 1
      )                                                                       AS frt_median_hours,
      COUNT(*) FILTER (WHERE state IN ('hot','warm'))::INT                    AS active_count,
      ROUND(
        COUNT(*) FILTER (WHERE state = 'won')::NUMERIC
          / NULLIF(COUNT(*), 0) * 100, 1
      )                                                                       AS win_rate
    FROM contact_filtered
  ),
  funnel AS (
    SELECT json_agg(json_build_object('step', step, 'count', cnt, 'order', ord) ORDER BY ord) AS data
    FROM (
      SELECT 1 AS ord, 'Contatado'    AS step, COUNT(*)::INT                                        AS cnt FROM contact_filtered
      UNION ALL SELECT 2, 'Respondeu 1×', COUNT(*) FILTER (WHERE inbound_count >= 1)::INT          FROM contact_filtered
      UNION ALL SELECT 3, 'Respondeu 3×', COUNT(*) FILTER (WHERE inbound_count >= 3)::INT          FROM contact_filtered
      UNION ALL SELECT 4, 'Ativa',        COUNT(*) FILTER (WHERE state IN ('hot','warm'))::INT     FROM contact_filtered
      UNION ALL SELECT 5, 'Virou Card',   COUNT(*) FILTER (WHERE card_id IS NOT NULL)::INT         FROM contact_filtered
      UNION ALL SELECT 6, 'Ganhou',       COUNT(*) FILTER (WHERE state = 'won')::INT               FROM contact_filtered
    ) f
  ),
  paginated AS (
    SELECT json_agg(row_data ORDER BY ord) AS data
    FROM (
      SELECT
        ROW_NUMBER() OVER (ORDER BY cf.last_inbound_at DESC NULLS LAST, cf.first_outbound_at DESC) AS ord,
        json_build_object(
          'contact_id',       cf.contact_id,
          'contact_name',     co.nome,
          'contact_phone',    co.telefone,
          'phone_line_id',    cf.phone_line_id,
          'phone_line_label', wl.phone_number_label,
          'first_outbound_at', cf.first_outbound_at,
          'last_outbound_at',  cf.last_outbound_at,
          'first_inbound_at',  cf.first_inbound_at,
          'last_inbound_at',   cf.last_inbound_at,
          'inbound_count',    cf.inbound_count,
          'outbound_count',   cf.outbound_count,
          'frt_hours',        ROUND(cf.frt_hours::NUMERIC, 1),
          'hours_since_inbound', ROUND(cf.hours_since_inbound::NUMERIC, 1),
          'state',            cf.state,
          'card_id',          cf.card_id,
          'attribution_modes', cf.attribution_modes
        ) AS row_data
      FROM contact_filtered cf
      LEFT JOIN contatos co               ON co.id = cf.contact_id
      LEFT JOIN whatsapp_linha_config wl  ON wl.id = cf.phone_line_id
      ORDER BY cf.last_inbound_at DESC NULLS LAST, cf.first_outbound_at DESC
      LIMIT v_limit OFFSET v_offset
    ) sub
  ),
  lines_catalog AS (
    SELECT json_agg(
      json_build_object(
        'id',       id,
        'label',    phone_number_label,
        'is_test',  phone_number_label ILIKE '%teste%'
      ) ORDER BY phone_number_label
    ) AS data
    FROM whatsapp_linha_config
    WHERE produto = 'WEDDING' AND ativo = TRUE
  )
  SELECT jsonb_build_object(
    'kpis', (
      SELECT jsonb_build_object(
        'total_contacts',         total_contacts,
        'reply_rate',             reply_rate,
        'depth_avg',              depth_avg,
        'cold_pct',               cold_pct,
        'responded_once_left_pct', responded_once_left_pct,
        'frt_median_hours',       frt_median_hours,
        'active_count',           active_count,
        'win_rate',               win_rate
      ) FROM kpis
    ),
    'funnel',        COALESCE((SELECT data FROM funnel), '[]'::JSON)::JSONB,
    'conversations', COALESCE((SELECT data FROM paginated), '[]'::JSON)::JSONB,
    'pagination', jsonb_build_object(
      'page',  COALESCE(p_page, 1),
      'limit', v_limit,
      'total', (SELECT total_contacts FROM kpis)
    ),
    'lines', COALESCE((SELECT data FROM lines_catalog), '[]'::JSON)::JSONB,
    'filters_applied', jsonb_build_object(
      'from',                  p_from,
      'to',                    p_to,
      'linha_ids',             p_linha_ids,
      'attribution_modes',     p_attribution_modes,
      'state_filter',          p_state_filter,
      'cold_threshold_hours',  p_cold_threshold_hours,
      'include_test_lines',    p_include_test_lines
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION analytics_weddings_conversations IS
  'Dashboard de Engajamento — Welcome Weddings. Retorna KPIs, funil, lista paginada de conversas (1 contato = 1 linha) e catálogo de linhas. Unidade: contact_id. Estados: cold/warm/hot/lost/won. Janela lost: p_cold_threshold_hours (default 48). Exclui linhas com label ILIKE %teste% por default.';

GRANT EXECUTE ON FUNCTION analytics_weddings_conversations(
  DATE, DATE, UUID[], TEXT[], TEXT[], INT, BOOLEAN, INT, INT
) TO authenticated;
