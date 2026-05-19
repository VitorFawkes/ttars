-- analytics_weddings_conversations v3 — adiciona breakdowns visuais
--
-- REBASE CONFIRMADO. Releitura das 2 migrations anteriores:
--   - 20260519c (v1): RPC original; usava p_linha_ids UUID[]. SUPERSEDED.
--   - 20260519d (v2): mudou p_linha_ids → p_line_labels TEXT[], unidade
--     customer_phone, estado em SQL, filtros por label regex. ESTA é a base.
--
-- O que a v3 PRESERVA da v2 (sem alterar):
--   - Mesma assinatura: (DATE, DATE, TEXT[], TEXT[], TEXT[], INT, BOOLEAN, INT, INT)
--   - Mesma lógica de filtros (p_include_test_lines, p_line_labels)
--   - Mesma definição de estado (hot/warm/lost/cold/won)
--   - Mesmo cálculo de FRT, KPIs, funil, paginação
--   - Mesma fonte (view vw_weddings_messages_unified)
--   - Mesmo formato dos campos kpis/funnel/conversations/pagination/lines
--
-- O que a v3 ADICIONA (puramente aditivo no retorno JSONB):
--   - by_line: KPIs separados por linha (Elopement / SDR Weddings / etc)
--   - state_distribution: contagem por estado (alimenta donut/legenda)
--   - depth_histogram: buckets (0/1/2-3/4-7/8+) de inbound_count
--
-- Nada destrutivo. Compatível com clientes da v2 (campos antigos intactos).

DROP FUNCTION IF EXISTS analytics_weddings_conversations(
  DATE, DATE, TEXT[], TEXT[], TEXT[], INT, BOOLEAN, INT, INT
) CASCADE;

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
      UNION ALL SELECT 2, 'Respondeu 1x', COUNT(*) FILTER (WHERE inbound_count >= 1)::INT          FROM conv_filtered
      UNION ALL SELECT 3, 'Respondeu 3x', COUNT(*) FILTER (WHERE inbound_count >= 3)::INT          FROM conv_filtered
      UNION ALL SELECT 4, 'Ativa',        COUNT(*) FILTER (WHERE state IN ('hot','warm'))::INT     FROM conv_filtered
      UNION ALL SELECT 5, 'Virou Card',   COUNT(*) FILTER (WHERE card_id IS NOT NULL)::INT         FROM conv_filtered
      UNION ALL SELECT 6, 'Ganhou',       COUNT(*) FILTER (WHERE state = 'won')::INT               FROM conv_filtered
    ) f
  ),
  by_line_raw AS (
    SELECT
      phone_line_label,
      COUNT(*)::INT AS total,
      ROUND(COUNT(*) FILTER (WHERE inbound_count > 0)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS reply_rate,
      ROUND(AVG(inbound_count)::NUMERIC, 1) AS depth_avg,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY frt_hours)
            FILTER (WHERE frt_hours IS NOT NULL AND frt_hours >= 0)::NUMERIC, 1) AS frt_median_hours,
      COUNT(*) FILTER (WHERE state = 'cold')::INT AS cold_count,
      COUNT(*) FILTER (WHERE state = 'lost')::INT AS lost_count,
      COUNT(*) FILTER (WHERE state IN ('hot','warm'))::INT AS active_count,
      COUNT(*) FILTER (WHERE state = 'won')::INT AS won_count
    FROM conv_filtered
    GROUP BY phone_line_label
  ),
  by_line AS (
    SELECT json_agg(
      jsonb_build_object(
        'label',            phone_line_label,
        'total',            total,
        'reply_rate',       reply_rate,
        'depth_avg',        depth_avg,
        'frt_median_hours', frt_median_hours,
        'cold_count',       cold_count,
        'lost_count',       lost_count,
        'active_count',     active_count,
        'won_count',        won_count
      ) ORDER BY phone_line_label
    ) AS data
    FROM by_line_raw
  ),
  state_distribution AS (
    SELECT json_agg(jsonb_build_object('state', state, 'count', cnt) ORDER BY ord) AS data
    FROM (
      SELECT 1 ord, 'hot'  state, COUNT(*) FILTER (WHERE state='hot')::INT  cnt FROM conv_filtered
      UNION ALL SELECT 2, 'warm', COUNT(*) FILTER (WHERE state='warm')::INT FROM conv_filtered
      UNION ALL SELECT 3, 'lost', COUNT(*) FILTER (WHERE state='lost')::INT FROM conv_filtered
      UNION ALL SELECT 4, 'cold', COUNT(*) FILTER (WHERE state='cold')::INT FROM conv_filtered
      UNION ALL SELECT 5, 'won',  COUNT(*) FILTER (WHERE state='won')::INT  FROM conv_filtered
    ) sd
  ),
  depth_histogram AS (
    SELECT json_agg(jsonb_build_object('bucket', bucket, 'count', cnt, 'order', ord) ORDER BY ord) AS data
    FROM (
      SELECT 1 ord, '0 (sem resposta)' bucket, COUNT(*) FILTER (WHERE inbound_count = 0)::INT cnt FROM conv_filtered
      UNION ALL SELECT 2, '1',   COUNT(*) FILTER (WHERE inbound_count = 1)::INT FROM conv_filtered
      UNION ALL SELECT 3, '2-3', COUNT(*) FILTER (WHERE inbound_count BETWEEN 2 AND 3)::INT FROM conv_filtered
      UNION ALL SELECT 4, '4-7', COUNT(*) FILTER (WHERE inbound_count BETWEEN 4 AND 7)::INT FROM conv_filtered
      UNION ALL SELECT 5, '8+',  COUNT(*) FILTER (WHERE inbound_count >= 8)::INT FROM conv_filtered
    ) dh
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
    'funnel',             COALESCE((SELECT data FROM funnel), '[]'::JSON)::JSONB,
    'by_line',            COALESCE((SELECT data FROM by_line), '[]'::JSON)::JSONB,
    'state_distribution', COALESCE((SELECT data FROM state_distribution), '[]'::JSON)::JSONB,
    'depth_histogram',    COALESCE((SELECT data FROM depth_histogram), '[]'::JSON)::JSONB,
    'conversations',      COALESCE((SELECT data FROM paginated), '[]'::JSON)::JSONB,
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
  'v3 (rebase confirmado da v2 - 20260519d): adiciona by_line, state_distribution, depth_histogram. Sem alterar logica anterior.';

GRANT EXECUTE ON FUNCTION analytics_weddings_conversations(
  DATE, DATE, TEXT[], TEXT[], TEXT[], INT, BOOLEAN, INT, INT
) TO authenticated;
