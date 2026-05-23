-- v12 — filtro por bucket de FRT (tempo até a 1ª resposta)
--
-- REBASE da v11 (20260519n). Adiciona p_frt_bucket TEXT (default NULL) que
-- recorta o universo de conversas pelo bucket de tempo entre a 1ª mensagem
-- nossa e a 1ª resposta da pessoa. Mesmos buckets usados no chart
-- frt_distribution: '< 5min', '5-30min', '30min-2h', '2-24h', '1-3 dias',
-- '3-7 dias', '> 7 dias', 'Sem resposta'.
--
-- O filtro entra em conv_filtered junto com state/inbound/meeting/stage, e
-- portanto propaga para todos os KPIs, breakdowns e lista paginada — mesma
-- semântica do filtro por depth bucket.
--
-- Diferença vs v11: apenas (1) novo parâmetro no final da assinatura, (2) novo
-- bloco WHERE em conv_filtered pra p_frt_bucket, (3) GRANT atualizado, (4)
-- COMMENT atualizado. Todo o resto é cópia byte-a-byte da v11.

DROP FUNCTION IF EXISTS analytics_weddings_conversations(
  DATE, DATE, TEXT[], TEXT[], TEXT[], INT, BOOLEAN, INT, INT, INT, INT, INT, INT, TEXT[], TEXT[], TEXT[]
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
  p_limit                 INT     DEFAULT 50,
  p_weekday_filter        INT     DEFAULT NULL,
  p_hour_filter           INT     DEFAULT NULL,
  p_inbound_min           INT     DEFAULT NULL,
  p_inbound_max           INT     DEFAULT NULL,
  p_meeting_states        TEXT[]  DEFAULT NULL,
  p_stage_phases          TEXT[]  DEFAULT NULL,
  p_stage_names           TEXT[]  DEFAULT NULL,
  p_frt_bucket            TEXT    DEFAULT NULL
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
  conv_passing_heatmap AS (
    SELECT DISTINCT customer_phone, phone_line_label
    FROM filtered_msgs
    WHERE direction = 'inbound'
      AND (p_weekday_filter IS NULL OR
           EXTRACT(DOW FROM sent_at AT TIME ZONE 'America/Sao_Paulo')::INT = p_weekday_filter)
      AND (p_hour_filter IS NULL OR
           EXTRACT(HOUR FROM sent_at AT TIME ZONE 'America/Sao_Paulo')::INT = p_hour_filter)
  ),
  conversation_summary AS (
    SELECT
      customer_phone, phone_line_label,
      MIN(sent_at) FILTER (WHERE direction = 'outbound') AS first_outbound_at,
      MAX(sent_at) FILTER (WHERE direction = 'outbound') AS last_outbound_at,
      MIN(sent_at) FILTER (WHERE direction = 'inbound')  AS first_inbound_at,
      MAX(sent_at) FILTER (WHERE direction = 'inbound')  AS last_inbound_at,
      COUNT(*)     FILTER (WHERE direction = 'outbound')::INT AS outbound_count,
      COUNT(*)     FILTER (WHERE direction = 'inbound') ::INT AS inbound_count,
      (ARRAY_AGG(contact_id ORDER BY sent_at DESC) FILTER (WHERE contact_id IS NOT NULL))[1] AS contact_id,
      (ARRAY_AGG(card_id    ORDER BY sent_at DESC) FILTER (WHERE card_id IS NOT NULL))[1]    AS card_id,
      ARRAY_REMOVE(
        ARRAY_AGG(DISTINCT attribution_mode)
          FILTER (WHERE direction = 'outbound' AND attribution_mode IS NOT NULL),
        NULL
      ) AS attribution_modes
    FROM filtered_msgs
    GROUP BY customer_phone, phone_line_label
  ),
  conv_after_heatmap AS (
    SELECT cs.* FROM conversation_summary cs
    WHERE (p_weekday_filter IS NULL AND p_hour_filter IS NULL)
       OR EXISTS (
         SELECT 1 FROM conv_passing_heatmap p
         WHERE p.customer_phone = cs.customer_phone
           AND p.phone_line_label = cs.phone_line_label
       )
  ),
  conv_after_attribution AS (
    SELECT * FROM conv_after_heatmap
    WHERE p_attribution_modes IS NULL OR attribution_modes && p_attribution_modes
  ),
  card_lookup AS (
    SELECT DISTINCT ON (c.id)
      c.id AS card_id, c.status_comercial, c.ganho_sdr, c.ganho_sdr_at, c.created_at,
      c.pipeline_stage_id,
      ps.nome AS stage_nome,
      ps.ordem AS stage_ordem,
      ph.slug AS stage_phase_slug
    FROM cards c
    LEFT JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
    LEFT JOIN pipeline_phases ph ON ph.id = ps.phase_id
    WHERE c.produto = 'WEDDING'
      AND c.id IN (SELECT card_id FROM conv_after_attribution WHERE card_id IS NOT NULL)
  ),
  conv_with_state AS (
    SELECT
      ca.*, cl.status_comercial, cl.ganho_sdr, cl.ganho_sdr_at,
      cl.stage_nome, cl.stage_phase_slug, cl.stage_ordem,
      EXTRACT(EPOCH FROM (ca.first_inbound_at - ca.first_outbound_at)) / 3600 AS frt_hours,
      EXTRACT(EPOCH FROM (NOW() - ca.last_inbound_at)) / 3600 AS hours_since_inbound,
      EXTRACT(EPOCH FROM (
        COALESCE(ca.last_inbound_at, ca.last_outbound_at) - ca.first_outbound_at
      )) / 86400 AS conversation_duration_days,
      CASE
        WHEN cl.stage_nome IN ('Apresentação Feita','Proposta','Proposta Enviada',
                                'Negociação','Contrato Assinado') THEN 'meeting_done'
        WHEN cl.stage_nome = 'Reunião Agendada' THEN 'meeting_scheduled'
        ELSE 'none'
      END AS meeting_state,
      CASE
        WHEN cl.status_comercial = 'ganho' OR cl.ganho_sdr = TRUE THEN 'won'
        WHEN ca.inbound_count = 0                                 THEN 'cold'
        WHEN NOW() - ca.last_inbound_at <= INTERVAL '24 hours'    THEN 'hot'
        WHEN NOW() - ca.last_inbound_at <= INTERVAL '7 days'      THEN 'warm'
        WHEN ca.inbound_count > 0
          AND EXTRACT(EPOCH FROM (NOW() - ca.last_inbound_at)) / 3600 > p_cold_threshold_hours
          THEN 'lost'
        ELSE 'warm'
      END AS state
    FROM conv_after_attribution ca
    LEFT JOIN card_lookup cl ON cl.card_id = ca.card_id
  ),
  conv_filtered AS (
    SELECT * FROM conv_with_state
    WHERE (p_state_filter IS NULL OR state = ANY(p_state_filter))
      AND (p_inbound_min IS NULL OR inbound_count >= p_inbound_min)
      AND (p_inbound_max IS NULL OR inbound_count <= p_inbound_max)
      AND (p_meeting_states IS NULL OR meeting_state = ANY(p_meeting_states))
      AND (p_stage_phases IS NULL OR
           COALESCE(stage_phase_slug, 'none') = ANY(p_stage_phases))
      AND (p_stage_names IS NULL OR
           COALESCE(stage_nome, '') = ANY(p_stage_names))
      AND (
        p_frt_bucket IS NULL
        OR (p_frt_bucket = '< 5min'       AND frt_hours >= 0          AND frt_hours < (5/60.0))
        OR (p_frt_bucket = '5-30min'      AND frt_hours >= (5/60.0)   AND frt_hours < 0.5)
        OR (p_frt_bucket = '30min-2h'     AND frt_hours >= 0.5        AND frt_hours < 2)
        OR (p_frt_bucket = '2-24h'        AND frt_hours >= 2          AND frt_hours < 24)
        OR (p_frt_bucket = '1-3 dias'     AND frt_hours >= 24         AND frt_hours < 72)
        OR (p_frt_bucket = '3-7 dias'     AND frt_hours >= 72         AND frt_hours < 168)
        OR (p_frt_bucket = '> 7 dias'     AND frt_hours >= 168)
        OR (p_frt_bucket = 'Sem resposta' AND (frt_hours IS NULL OR frt_hours < 0))
      )
  ),
  visible_msgs AS (
    SELECT fm.*
    FROM filtered_msgs fm
    INNER JOIN conv_filtered cf
      ON cf.customer_phone = fm.customer_phone
     AND cf.phone_line_label = fm.phone_line_label
  ),
  kpis AS (
    SELECT
      COUNT(*)::INT AS total_contacts,
      ROUND(COUNT(*) FILTER (WHERE inbound_count > 0)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS reply_rate,
      ROUND(AVG(inbound_count)::NUMERIC, 1) AS depth_avg,
      ROUND(COUNT(*) FILTER (WHERE state = 'cold')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS cold_pct,
      ROUND(
        COUNT(*) FILTER (WHERE inbound_count = 1 AND state = 'lost')::NUMERIC
          / NULLIF(COUNT(*) FILTER (WHERE inbound_count >= 1), 0) * 100, 1
      ) AS responded_once_left_pct,
      ROUND(
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY frt_hours)
          FILTER (WHERE frt_hours IS NOT NULL AND frt_hours >= 0)::NUMERIC, 1
      ) AS frt_median_hours,
      COUNT(*) FILTER (WHERE state IN ('hot','warm'))::INT AS active_count,
      ROUND(COUNT(*) FILTER (WHERE state = 'won')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS win_rate
    FROM conv_filtered
  ),
  meetings_kpis AS (
    SELECT jsonb_build_object(
      'meetings_scheduled', COUNT(*) FILTER (WHERE stage_nome = 'Reunião Agendada')::INT,
      'meetings_done',      COUNT(*) FILTER (WHERE meeting_state = 'meeting_done')::INT,
      'proposals_sent',     COUNT(*) FILTER (WHERE stage_nome IN ('Proposta','Proposta Enviada','Negociação','Contrato Assinado'))::INT,
      'contracts_signed',   COUNT(*) FILTER (WHERE stage_nome = 'Contrato Assinado')::INT
    ) AS data
    FROM conv_filtered
  ),
  funnel AS (
    SELECT json_agg(json_build_object('step', step, 'count', cnt, 'order', ord) ORDER BY ord) AS data
    FROM (
      SELECT 1 AS ord, 'Contatado'    AS step, COUNT(*)::INT AS cnt FROM conv_filtered
      UNION ALL SELECT 2, 'Respondeu 1x', COUNT(*) FILTER (WHERE inbound_count >= 1)::INT FROM conv_filtered
      UNION ALL SELECT 3, 'Respondeu 3x', COUNT(*) FILTER (WHERE inbound_count >= 3)::INT FROM conv_filtered
      UNION ALL SELECT 4, 'Reunião Agendada', COUNT(*) FILTER (WHERE stage_nome = 'Reunião Agendada' OR meeting_state = 'meeting_done')::INT FROM conv_filtered
      UNION ALL SELECT 5, 'Reunião Feita',    COUNT(*) FILTER (WHERE meeting_state = 'meeting_done')::INT FROM conv_filtered
      UNION ALL SELECT 6, 'Proposta',         COUNT(*) FILTER (WHERE stage_nome IN ('Proposta','Proposta Enviada','Negociação','Contrato Assinado'))::INT FROM conv_filtered
      UNION ALL SELECT 7, 'Ganhou',           COUNT(*) FILTER (WHERE state = 'won')::INT FROM conv_filtered
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
      COUNT(*) FILTER (WHERE state = 'won')::INT AS won_count,
      COUNT(*) FILTER (WHERE stage_nome = 'Reunião Agendada')::INT AS meetings_scheduled,
      COUNT(*) FILTER (WHERE meeting_state = 'meeting_done')::INT AS meetings_done
    FROM conv_filtered
    GROUP BY phone_line_label
  ),
  by_line AS (
    SELECT json_agg(
      jsonb_build_object(
        'label', phone_line_label, 'total', total, 'reply_rate', reply_rate,
        'depth_avg', depth_avg, 'frt_median_hours', frt_median_hours,
        'cold_count', cold_count, 'lost_count', lost_count,
        'active_count', active_count, 'won_count', won_count,
        'meetings_scheduled', meetings_scheduled, 'meetings_done', meetings_done
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
    SELECT json_agg(jsonb_build_object('bucket', bucket, 'count', cnt, 'order', ord, 'min', mn, 'max', mx) ORDER BY ord) AS data
    FROM (
      SELECT 1 ord, '0 mensagens' bucket, 0 mn, 0 mx, COUNT(*) FILTER (WHERE inbound_count = 0)::INT cnt FROM conv_filtered
      UNION ALL SELECT 2, '1 mensagem', 1, 1, COUNT(*) FILTER (WHERE inbound_count = 1)::INT FROM conv_filtered
      UNION ALL SELECT 3, '2-3', 2, 3, COUNT(*) FILTER (WHERE inbound_count BETWEEN 2 AND 3)::INT FROM conv_filtered
      UNION ALL SELECT 4, '4-7', 4, 7, COUNT(*) FILTER (WHERE inbound_count BETWEEN 4 AND 7)::INT FROM conv_filtered
      UNION ALL SELECT 5, '8+',  8, 999, COUNT(*) FILTER (WHERE inbound_count >= 8)::INT FROM conv_filtered
    ) dh
  ),
  frt_distribution AS (
    SELECT json_agg(jsonb_build_object('bucket', bucket, 'count', cnt, 'order', ord) ORDER BY ord) AS data
    FROM (
      SELECT 1 ord, '< 5min'   bucket, COUNT(*) FILTER (WHERE frt_hours >= 0 AND frt_hours < (5/60.0))::INT cnt FROM conv_filtered
      UNION ALL SELECT 2, '5-30min',  COUNT(*) FILTER (WHERE frt_hours >= (5/60.0) AND frt_hours < 0.5)::INT FROM conv_filtered
      UNION ALL SELECT 3, '30min-2h', COUNT(*) FILTER (WHERE frt_hours >= 0.5 AND frt_hours < 2)::INT FROM conv_filtered
      UNION ALL SELECT 4, '2-24h',    COUNT(*) FILTER (WHERE frt_hours >= 2 AND frt_hours < 24)::INT FROM conv_filtered
      UNION ALL SELECT 5, '1-3 dias', COUNT(*) FILTER (WHERE frt_hours >= 24 AND frt_hours < 72)::INT FROM conv_filtered
      UNION ALL SELECT 6, '3-7 dias', COUNT(*) FILTER (WHERE frt_hours >= 72 AND frt_hours < 168)::INT FROM conv_filtered
      UNION ALL SELECT 7, '> 7 dias', COUNT(*) FILTER (WHERE frt_hours >= 168)::INT FROM conv_filtered
      UNION ALL SELECT 8, 'Sem resposta', COUNT(*) FILTER (WHERE frt_hours IS NULL OR frt_hours < 0)::INT FROM conv_filtered
    ) fd
  ),
  weekday_hour_heatmap AS (
    SELECT json_agg(jsonb_build_object('weekday', weekday, 'hour', hour, 'count', cnt)) AS data
    FROM (
      SELECT
        EXTRACT(DOW FROM sent_at AT TIME ZONE 'America/Sao_Paulo')::INT AS weekday,
        EXTRACT(HOUR FROM sent_at AT TIME ZONE 'America/Sao_Paulo')::INT AS hour,
        COUNT(DISTINCT customer_phone)::INT AS cnt
      FROM visible_msgs WHERE direction = 'inbound'
      GROUP BY 1, 2
    ) h
  ),
  daily_timeline AS (
    SELECT json_agg(jsonb_build_object(
      'day', day, 'outbound', outbound, 'inbound', inbound, 'no_reply', no_reply,
      'reply_rate_pct', reply_rate_pct, 'frt_median_minutes', frt_median_minutes,
      'msgs_out', msgs_out, 'msgs_in', msgs_in,
      'new_contacts', new_contacts, 'new_replies', new_replies, 'wins', wins
    ) ORDER BY day) AS data
    FROM (
      WITH days AS (
        SELECT generate_series(p_from, p_to, INTERVAL '1 day')::DATE AS day
      ),
      contacted_by_day AS (
        SELECT sent_at::DATE AS day, customer_phone, phone_line_label
        FROM visible_msgs WHERE direction = 'outbound'
        GROUP BY 1, 2, 3
      ),
      day_aggregates AS (
        SELECT cb.day,
          COUNT(DISTINCT cb.customer_phone)::INT AS outbound,
          COUNT(DISTINCT cb.customer_phone) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM conv_filtered cf2
              WHERE cf2.customer_phone = cb.customer_phone
                AND cf2.phone_line_label = cb.phone_line_label
                AND cf2.inbound_count > 0
            )
          )::INT AS replied_count
        FROM contacted_by_day cb GROUP BY cb.day
      ),
      msg_volumes AS (
        SELECT sent_at::DATE AS day,
          COUNT(*) FILTER (WHERE direction = 'outbound')::INT AS msgs_out,
          COUNT(*) FILTER (WHERE direction = 'inbound')::INT  AS msgs_in,
          COUNT(DISTINCT customer_phone) FILTER (WHERE direction = 'inbound')::INT AS inbound_people
        FROM visible_msgs GROUP BY 1
      ),
      new_contacts_by_day AS (
        SELECT first_outbound_at::DATE AS day, COUNT(*)::INT AS cnt
        FROM conv_filtered WHERE first_outbound_at IS NOT NULL
        GROUP BY first_outbound_at::DATE
      ),
      new_replies_by_day AS (
        SELECT first_inbound_at::DATE AS day, COUNT(*)::INT AS cnt
        FROM conv_filtered WHERE first_inbound_at IS NOT NULL
        GROUP BY first_inbound_at::DATE
      ),
      frt_by_day AS (
        SELECT first_outbound_at::DATE AS day,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY frt_hours * 60)
            FILTER (WHERE frt_hours IS NOT NULL AND frt_hours >= 0) AS frt_median_minutes
        FROM conv_filtered WHERE first_outbound_at IS NOT NULL
        GROUP BY first_outbound_at::DATE
      ),
      wins_by_day AS (
        SELECT COALESCE(cl.ganho_sdr_at::DATE, cl.created_at::DATE) AS day, COUNT(*)::INT AS cnt
        FROM conv_filtered cf JOIN card_lookup cl ON cl.card_id = cf.card_id
        WHERE cf.state = 'won'
        GROUP BY COALESCE(cl.ganho_sdr_at::DATE, cl.created_at::DATE)
      )
      SELECT d.day,
        COALESCE(da.outbound, 0) AS outbound,
        COALESCE(mv.inbound_people, 0) AS inbound,
        GREATEST(0, COALESCE(da.outbound, 0) - COALESCE(da.replied_count, 0)) AS no_reply,
        CASE WHEN COALESCE(da.outbound, 0) > 0
             THEN ROUND(COALESCE(da.replied_count, 0)::NUMERIC / da.outbound * 100, 1)
             ELSE NULL END AS reply_rate_pct,
        ROUND(fb.frt_median_minutes::NUMERIC, 1) AS frt_median_minutes,
        COALESCE(mv.msgs_out, 0) AS msgs_out, COALESCE(mv.msgs_in, 0) AS msgs_in,
        COALESCE(nc.cnt, 0) AS new_contacts, COALESCE(nr.cnt, 0) AS new_replies,
        COALESCE(wb.cnt, 0) AS wins
      FROM days d
      LEFT JOIN day_aggregates da ON da.day = d.day
      LEFT JOIN msg_volumes mv ON mv.day = d.day
      LEFT JOIN new_contacts_by_day nc ON nc.day = d.day
      LEFT JOIN new_replies_by_day nr ON nr.day = d.day
      LEFT JOIN frt_by_day fb ON fb.day = d.day
      LEFT JOIN wins_by_day wb ON wb.day = d.day
    ) t
  ),
  time_metrics AS (
    SELECT jsonb_build_object(
      'median_conversation_duration_days',
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY conversation_duration_days)
              FILTER (WHERE conversation_duration_days IS NOT NULL AND conversation_duration_days >= 0)::NUMERIC, 1),
      'median_conversation_duration_days_won',
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY conversation_duration_days)
              FILTER (WHERE state = 'won' AND conversation_duration_days IS NOT NULL)::NUMERIC, 1),
      'median_outbounds_no_reply',
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY outbound_count)
          FILTER (WHERE inbound_count = 0),
      'max_outbounds_no_reply',
        MAX(outbound_count) FILTER (WHERE inbound_count = 0)
    ) AS data
    FROM conv_filtered
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
          'conversation_duration_days', ROUND(cf.conversation_duration_days::NUMERIC, 1),
          'state',             cf.state,
          'card_id',           cf.card_id,
          'attribution_modes', cf.attribution_modes,
          'stage_nome',        cf.stage_nome,
          'stage_phase_slug',  cf.stage_phase_slug,
          'meeting_state',     cf.meeting_state
        ) AS row_data
      FROM conv_filtered cf
      LEFT JOIN contatos co ON co.id = cf.contact_id
      ORDER BY cf.last_inbound_at DESC NULLS LAST, cf.first_outbound_at DESC NULLS LAST
      LIMIT v_limit OFFSET v_offset
    ) sub
  ),
  lines_catalog AS (
    SELECT json_agg(
      json_build_object('label', label, 'is_test', label ~* 'teste') ORDER BY label
    ) AS data
    FROM (
      SELECT DISTINCT phone_number_label AS label
      FROM whatsapp_messages
      WHERE phone_number_label IS NOT NULL
        AND phone_number_label ~* '(elop|sdr.*wedd|welcome.?wedd|teste.*vitor)'
    ) ll
  ),
  stages_catalog AS (
    SELECT json_agg(jsonb_build_object(
      'nome', stage_nome, 'phase', stage_phase_slug,
      'ordem', stage_ordem, 'count', count
    ) ORDER BY ph_ordem, stage_ordem) AS data
    FROM (
      SELECT ps.nome AS stage_nome, ph.slug AS stage_phase_slug,
             ps.ordem AS stage_ordem, ph.order_index AS ph_ordem,
             COUNT(*)::INT AS count
      FROM cards c
      JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
      JOIN pipeline_phases ph ON ph.id = ps.phase_id
      JOIN pipelines pip ON pip.id = ps.pipeline_id
      WHERE pip.produto = 'WEDDING'
      GROUP BY ps.nome, ph.slug, ps.ordem, ph.order_index
    ) s
  )
  SELECT jsonb_build_object(
    'kpis', (SELECT jsonb_build_object(
      'total_contacts', total_contacts, 'reply_rate', reply_rate, 'depth_avg', depth_avg,
      'cold_pct', cold_pct, 'responded_once_left_pct', responded_once_left_pct,
      'frt_median_hours', frt_median_hours, 'active_count', active_count, 'win_rate', win_rate
    ) FROM kpis),
    'meetings_kpis',       COALESCE((SELECT data FROM meetings_kpis), '{}'::JSONB),
    'funnel',              COALESCE((SELECT data FROM funnel), '[]'::JSON)::JSONB,
    'by_line',             COALESCE((SELECT data FROM by_line), '[]'::JSON)::JSONB,
    'state_distribution',  COALESCE((SELECT data FROM state_distribution), '[]'::JSON)::JSONB,
    'depth_histogram',     COALESCE((SELECT data FROM depth_histogram), '[]'::JSON)::JSONB,
    'frt_distribution',    COALESCE((SELECT data FROM frt_distribution), '[]'::JSON)::JSONB,
    'weekday_hour_heatmap', COALESCE((SELECT data FROM weekday_hour_heatmap), '[]'::JSON)::JSONB,
    'daily_timeline',      COALESCE((SELECT data FROM daily_timeline), '[]'::JSON)::JSONB,
    'time_metrics',        COALESCE((SELECT data FROM time_metrics), '{}'::JSONB),
    'conversations',       COALESCE((SELECT data FROM paginated), '[]'::JSON)::JSONB,
    'pagination', jsonb_build_object(
      'page', COALESCE(p_page, 1), 'limit', v_limit, 'total', (SELECT total_contacts FROM kpis)
    ),
    'lines', COALESCE((SELECT data FROM lines_catalog), '[]'::JSON)::JSONB,
    'stages', COALESCE((SELECT data FROM stages_catalog), '[]'::JSON)::JSONB
  )
  INTO v_result;
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION analytics_weddings_conversations IS
  'v12 (rebase confirmado da v11 - 20260519n): adiciona p_frt_bucket TEXT pra filtrar conv_filtered por bucket de FRT (mesmo conjunto de buckets do chart frt_distribution).';

GRANT EXECUTE ON FUNCTION analytics_weddings_conversations(
  DATE, DATE, TEXT[], TEXT[], TEXT[], INT, BOOLEAN, INT, INT, INT, INT, INT, INT, TEXT[], TEXT[], TEXT[], TEXT
) TO authenticated;
