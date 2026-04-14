-- ============================================================
-- Reativação v4 — RPC calculate_reactivation_patterns()
-- Exclui contatos com card aberto em org IRMÃ + suprimidos
-- Popula last_lost_reason_id, last_responsavel_id, recent_interaction_warning
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_reactivation_patterns()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org UUID;
  v_parent_org UUID;
  v_shares BOOLEAN := FALSE;
  v_count INT := 0;
  v_median_value NUMERIC;
  v_p80_value NUMERIC;
  rec RECORD;
BEGIN
  v_org := requesting_org_id();

  SELECT o.parent_org_id, COALESCE(parent.shares_contacts_with_children, FALSE)
    INTO v_parent_org, v_shares
  FROM organizations o
  LEFT JOIN organizations parent ON parent.id = o.parent_org_id
  WHERE o.id = v_org;

  SELECT
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(c.valor_final, c.valor_estimado, 0)),
    PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY COALESCE(c.valor_final, c.valor_estimado, 0))
  INTO v_median_value, v_p80_value
  FROM cards c
  WHERE c.org_id = v_org
    AND (c.ganho_planner = TRUE OR c.ganho_pos = TRUE)
    AND COALESCE(c.valor_final, c.valor_estimado, 0) > 0;

  IF v_median_value IS NULL OR v_median_value = 0 THEN v_median_value := 10000; END IF;
  IF v_p80_value IS NULL OR v_p80_value = 0 THEN v_p80_value := v_median_value * 2; END IF;

  FOR rec IN
    WITH sibling_orgs AS (
      SELECT id FROM organizations
      WHERE v_shares = TRUE
        AND parent_org_id = v_parent_org
        AND id IS NOT NULL
      UNION
      SELECT v_org
    ),
    won_trips AS (
      SELECT
        co.id AS contact_id,
        co.org_id,
        co.data_nascimento,
        c.id AS card_id,
        c.data_viagem_inicio::DATE AS data_viagem_inicio,
        c.data_viagem_fim::DATE AS data_viagem_fim,
        c.data_fechamento::DATE AS data_fechamento,
        COALESCE(c.valor_final, c.valor_estimado, 0) AS valor,
        c.produto_data,
        c.titulo,
        EXTRACT(MONTH FROM c.data_viagem_inicio)::INT AS trip_month,
        ROW_NUMBER() OVER (PARTITION BY co.id ORDER BY c.data_viagem_inicio DESC) AS rn
      FROM contatos co
      JOIN cards c ON c.pessoa_principal_id = co.id
      WHERE co.org_id = v_org
        AND co.deleted_at IS NULL
        AND (c.ganho_planner = TRUE OR c.ganho_pos = TRUE)
        AND c.data_viagem_inicio IS NOT NULL
        AND c.data_viagem_fim IS NOT NULL
        AND c.data_viagem_fim::DATE >= c.data_viagem_inicio::DATE
        AND c.data_viagem_inicio <= CURRENT_DATE + INTERVAL '1 year'
    ),
    active_contacts_self AS (
      SELECT DISTINCT c.pessoa_principal_id AS contact_id
      FROM cards c
      WHERE c.org_id = v_org
        AND c.status_comercial = 'aberto'
        AND c.pessoa_principal_id IS NOT NULL
    ),
    active_contacts_siblings AS (
      SELECT DISTINCT c.pessoa_principal_id AS contact_id
      FROM cards c
      WHERE c.org_id IN (SELECT id FROM sibling_orgs)
        AND c.org_id <> v_org
        AND c.status_comercial = 'aberto'
        AND c.pessoa_principal_id IS NOT NULL
    ),
    suppressed AS (
      SELECT contact_id
      FROM reactivation_suppressions
      WHERE org_id = v_org
        AND (suppressed_until IS NULL OR suppressed_until > now())
    ),
    lost_deals AS (
      SELECT
        c.pessoa_principal_id AS contact_id,
        COUNT(*) AS lost_count,
        MAX(c.updated_at)::DATE AS last_lost_date
      FROM cards c
      WHERE c.org_id = v_org
        AND c.status_comercial = 'perdido'
        AND c.pessoa_principal_id IS NOT NULL
        AND c.updated_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY c.pessoa_principal_id
    ),
    last_lost AS (
      SELECT DISTINCT ON (c.pessoa_principal_id)
        c.pessoa_principal_id AS contact_id,
        c.motivo_perda_id,
        mp.nome AS motivo_perda_nome
      FROM cards c
      LEFT JOIN motivos_perda mp ON mp.id = c.motivo_perda_id
      WHERE c.org_id = v_org
        AND c.status_comercial = 'perdido'
        AND c.motivo_perda_id IS NOT NULL
        AND c.pessoa_principal_id IS NOT NULL
      ORDER BY c.pessoa_principal_id, c.updated_at DESC
    ),
    last_responsavel AS (
      SELECT DISTINCT ON (c.pessoa_principal_id)
        c.pessoa_principal_id AS contact_id,
        COALESCE(c.vendas_owner_id, c.pos_owner_id, c.sdr_owner_id) AS responsavel_id
      FROM cards c
      WHERE c.org_id = v_org
        AND c.pessoa_principal_id IS NOT NULL
        AND (c.status_comercial IN ('ganho','perdido') OR c.ganho_planner = TRUE OR c.ganho_pos = TRUE)
      ORDER BY c.pessoa_principal_id, c.updated_at DESC
    ),
    companions AS (
      SELECT
        wt.contact_id,
        COUNT(DISTINCT cc.contato_id) AS companion_count,
        ARRAY_AGG(DISTINCT co2.nome || COALESCE(' ' || co2.sobrenome, ''))
          FILTER (WHERE co2.nome IS NOT NULL) AS companion_names
      FROM won_trips wt
      JOIN cards_contatos cc ON cc.card_id = wt.card_id AND cc.contato_id != wt.contact_id
      JOIN contatos co2 ON co2.id = cc.contato_id AND co2.deleted_at IS NULL
      WHERE wt.rn <= 5
      GROUP BY wt.contact_id
    ),
    last_interaction AS (
      SELECT
        contact_id,
        interaction_date,
        interaction_type
      FROM (
        SELECT co.id AS contact_id, co.last_whatsapp_sync::DATE AS interaction_date, 'whatsapp' AS interaction_type
        FROM contatos co
        WHERE co.org_id = v_org AND co.last_whatsapp_sync IS NOT NULL AND co.deleted_at IS NULL
        UNION ALL
        SELECT c.pessoa_principal_id, t.concluida_em::DATE, 'tarefa'
        FROM tarefas t JOIN cards c ON c.id = t.card_id
        WHERE c.org_id = v_org AND t.concluida_em IS NOT NULL AND c.pessoa_principal_id IS NOT NULL
        UNION ALL
        SELECT c.pessoa_principal_id, a.created_at::DATE, 'atividade'
        FROM activities a JOIN cards c ON c.id = a.card_id
        WHERE c.org_id = v_org AND a.created_at IS NOT NULL AND c.pessoa_principal_id IS NOT NULL
      ) all_interactions
      WHERE interaction_date IS NOT NULL AND interaction_date <= CURRENT_DATE
      ORDER BY interaction_date DESC
    ),
    last_interaction_per_contact AS (
      SELECT DISTINCT ON (contact_id) contact_id, interaction_date, interaction_type
      FROM last_interaction
      ORDER BY contact_id, interaction_date DESC
    ),
    referrals AS (
      SELECT c.indicado_por_id AS contact_id, COUNT(*) AS referral_count
      FROM cards c
      WHERE c.org_id = v_org AND c.indicado_por_id IS NOT NULL
      GROUP BY c.indicado_por_id
    ),
    gifts AS (
      SELECT g.contato_id AS contact_id, COUNT(*) AS gifts_count,
        MAX(COALESCE(g.delivered_at, g.shipped_at, g.created_at))::DATE AS last_gift_date
      FROM card_gift_assignments g
      WHERE g.contato_id IS NOT NULL AND g.status NOT IN ('cancelado')
      GROUP BY g.contato_id
    ),
    contact_agg AS (
      SELECT
        wt.contact_id, wt.org_id,
        (SELECT wt2.data_nascimento FROM won_trips wt2 WHERE wt2.contact_id = wt.contact_id LIMIT 1) AS data_nascimento,
        COUNT(*) AS total_trips,
        COUNT(*) FILTER (WHERE wt.data_viagem_fim >= CURRENT_DATE - INTERVAL '36 months') AS trips_36m,
        AVG(wt.valor) AS avg_value,
        SUM(wt.valor) AS total_value,
        MAX(wt.data_viagem_inicio) AS last_trip_start,
        MAX(wt.data_viagem_fim) AS last_trip_end,
        LEAST(365, GREATEST(30,
          COALESCE(
            PERCENTILE_CONT(0.5) WITHIN GROUP (
              ORDER BY CASE
                WHEN wt.data_fechamento IS NOT NULL
                  AND wt.data_viagem_inicio > wt.data_fechamento
                  AND (wt.data_viagem_inicio - wt.data_fechamento) BETWEEN 7 AND 365
                THEN (wt.data_viagem_inicio - wt.data_fechamento)
              END
            ), 90)
        ))::INT AS median_lead_days,
        GREATEST(1, AVG(wt.data_viagem_fim - wt.data_viagem_inicio)::INT) AS avg_duration,
        AVG(gap_days)::INT AS avg_gap_days,
        ARRAY_AGG(wt.trip_month ORDER BY wt.data_viagem_inicio) AS all_months
      FROM (
        SELECT wt2.*,
          CASE WHEN LAG(wt2.data_viagem_inicio) OVER (PARTITION BY wt2.contact_id ORDER BY wt2.data_viagem_inicio) IS NOT NULL
          THEN (wt2.data_viagem_inicio - LAG(wt2.data_viagem_inicio) OVER (PARTITION BY wt2.contact_id ORDER BY wt2.data_viagem_inicio)) END AS gap_days
        FROM won_trips wt2
      ) wt
      WHERE wt.contact_id NOT IN (SELECT contact_id FROM active_contacts_self)
        AND wt.contact_id NOT IN (SELECT contact_id FROM active_contacts_siblings)
        AND wt.contact_id NOT IN (SELECT contact_id FROM suppressed)
      GROUP BY wt.contact_id, wt.org_id
      HAVING COUNT(*) >= 2
    ),
    seasonality AS (
      SELECT contact_id,
        ARRAY_AGG(month_num ORDER BY month_num) FILTER (WHERE pct_of_trips >= 0.25) AS peak_months,
        MAX(CASE WHEN pct_of_trips >= 0.25 THEN pct_of_trips ELSE 0 END) AS peak_confidence
      FROM (
        SELECT ca.contact_id, m AS month_num, COUNT(*)::NUMERIC / ca.total_trips AS pct_of_trips
        FROM contact_agg ca, UNNEST(ca.all_months) AS m
        GROUP BY ca.contact_id, ca.total_trips, m
      ) mp
      GROUP BY contact_id
    ),
    last_dests AS (
      SELECT contact_id,
        ARRAY_AGG(DISTINCT dest ORDER BY dest) FILTER (WHERE dest IS NOT NULL) AS destinations
      FROM (
        SELECT wt.contact_id, d.elem AS dest
        FROM won_trips wt,
          LATERAL jsonb_array_elements_text(
            CASE WHEN wt.produto_data IS NOT NULL AND wt.produto_data ? 'destinos'
              AND jsonb_typeof(wt.produto_data->'destinos') = 'array'
            THEN wt.produto_data->'destinos' ELSE '[]'::JSONB END
          ) AS d(elem)
        WHERE wt.rn <= 5
        UNION
        SELECT wt.contact_id, TRIM(split_part(wt.titulo, '/', 2)) AS dest
        FROM won_trips wt
        WHERE wt.rn <= 5 AND wt.titulo LIKE '%/%'
          AND LENGTH(TRIM(split_part(wt.titulo, '/', 2))) BETWEEN 3 AND 50
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(
              CASE WHEN wt.produto_data IS NOT NULL AND wt.produto_data ? 'destinos'
                AND jsonb_typeof(wt.produto_data->'destinos') = 'array'
                AND jsonb_array_length(wt.produto_data->'destinos') > 0
              THEN wt.produto_data->'destinos' ELSE NULL END
            )
          )
      ) all_dests
      GROUP BY contact_id
    )
    SELECT
      ca.*,
      ROUND(ca.trips_36m / 3.0, 2) AS freq_per_year,
      COALESCE(s.peak_months, ARRAY[]::INT[]) AS peak_months,
      COALESCE(s.peak_confidence, 0) AS peak_confidence,
      COALESCE(ld.destinations, ARRAY[]::TEXT[]) AS last_destinations,
      COALESCE(lo.lost_count, 0) AS lost_count,
      lo.last_lost_date,
      ll.motivo_perda_id AS last_lost_reason_id,
      ll.motivo_perda_nome AS last_lost_reason_name,
      lr.responsavel_id AS last_responsavel_id,
      comp.companion_count, comp.companion_names,
      li.interaction_date AS last_interaction_date,
      li.interaction_type AS last_interaction_type,
      COALESCE(ref.referral_count, 0) AS referral_count,
      gi.gifts_count, gi.last_gift_date
    FROM contact_agg ca
    LEFT JOIN seasonality s ON s.contact_id = ca.contact_id
    LEFT JOIN last_dests ld ON ld.contact_id = ca.contact_id
    LEFT JOIN lost_deals lo ON lo.contact_id = ca.contact_id
    LEFT JOIN last_lost ll ON ll.contact_id = ca.contact_id
    LEFT JOIN last_responsavel lr ON lr.contact_id = ca.contact_id
    LEFT JOIN companions comp ON comp.contact_id = ca.contact_id
    LEFT JOIN last_interaction_per_contact li ON li.contact_id = ca.contact_id
    LEFT JOIN referrals ref ON ref.contact_id = ca.contact_id
    LEFT JOIN gifts gi ON gi.contact_id = ca.contact_id
  LOOP
    DECLARE
      v_score INT := 0; v_freq_score INT := 0; v_recency_score INT := 0; v_value_score INT := 0;
      v_season_score INT := 0; v_timing_bonus INT := 0; v_interest_bonus INT := 0;
      v_days_since INT; v_predicted_start DATE; v_predicted_end DATE; v_ideal_contact DATE;
      v_pred_confidence NUMERIC := 0; v_lead_days INT; v_next_peak_month INT;
      v_is_high_value BOOLEAN; v_decay_factor NUMERIC;
      v_birthday DATE; v_days_until_bday INT; v_days_since_interaction INT;
      v_recent_warning BOOLEAN := FALSE;
    BEGIN
      v_days_since := (CURRENT_DATE - rec.last_trip_end);
      v_lead_days := rec.median_lead_days;
      v_decay_factor := GREATEST(0.1, 1.0 - (GREATEST(v_days_since - 180, 0)::NUMERIC / 1200.0));

      IF rec.data_nascimento IS NOT NULL THEN
        BEGIN
          v_birthday := MAKE_DATE(
            CASE WHEN MAKE_DATE(EXTRACT(YEAR FROM CURRENT_DATE)::INT,
                                EXTRACT(MONTH FROM rec.data_nascimento::DATE)::INT,
                                EXTRACT(DAY FROM rec.data_nascimento::DATE)::INT) >= CURRENT_DATE
                 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT
                 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1 END,
            EXTRACT(MONTH FROM rec.data_nascimento::DATE)::INT,
            EXTRACT(DAY FROM rec.data_nascimento::DATE)::INT
          );
          v_days_until_bday := (v_birthday - CURRENT_DATE);
        EXCEPTION WHEN OTHERS THEN
          v_birthday := NULL; v_days_until_bday := NULL;
        END;
      END IF;

      IF rec.last_interaction_date IS NOT NULL THEN
        v_days_since_interaction := (CURRENT_DATE - rec.last_interaction_date);
        v_recent_warning := v_days_since_interaction < 30;
      END IF;

      IF ARRAY_LENGTH(rec.peak_months, 1) > 0 THEN
        SELECT m INTO v_next_peak_month
        FROM UNNEST(rec.peak_months) AS m
        WHERE MAKE_DATE(
          CASE WHEN m >= EXTRACT(MONTH FROM CURRENT_DATE)::INT
               THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT
               ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1 END, m, 1) > CURRENT_DATE
        ORDER BY MAKE_DATE(
          CASE WHEN m >= EXTRACT(MONTH FROM CURRENT_DATE)::INT
               THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT
               ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1 END, m, 1)
        LIMIT 1;

        IF v_next_peak_month IS NOT NULL THEN
          v_predicted_start := MAKE_DATE(
            CASE WHEN v_next_peak_month >= EXTRACT(MONTH FROM CURRENT_DATE)::INT
                 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT
                 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1 END, v_next_peak_month, 1);
          v_predicted_end := v_predicted_start + rec.avg_duration;
          v_pred_confidence := LEAST(rec.peak_confidence * v_decay_factor, 0.95);
        END IF;
      ELSIF rec.avg_gap_days IS NOT NULL AND rec.avg_gap_days > 0 THEN
        v_predicted_start := rec.last_trip_start + rec.avg_gap_days;
        v_predicted_end := v_predicted_start + rec.avg_duration;
        v_pred_confidence := LEAST((0.4 + (rec.total_trips::NUMERIC * 0.05)) * v_decay_factor, 0.80);
      END IF;

      IF v_predicted_start IS NOT NULL THEN
        v_ideal_contact := v_predicted_start - v_lead_days;
      END IF;

      v_freq_score := LEAST(ROUND(rec.freq_per_year * 10 * v_decay_factor)::INT, 20);
      v_recency_score := CASE
        WHEN v_days_since <= 120 THEN 20 WHEN v_days_since <= 240 THEN 15
        WHEN v_days_since <= 365 THEN 10 WHEN v_days_since <= 730 THEN 4 ELSE 0 END;
      v_is_high_value := rec.avg_value >= v_p80_value;
      v_value_score := LEAST(ROUND((rec.avg_value / NULLIF(v_p80_value, 0)) * 15)::INT, 20);

      IF ARRAY_LENGTH(rec.peak_months, 1) >= 2 AND rec.peak_confidence >= 0.30 THEN v_season_score := 10;
      ELSIF ARRAY_LENGTH(rec.peak_months, 1) = 1 AND rec.peak_confidence >= 0.25 THEN v_season_score := 5; END IF;

      IF v_ideal_contact IS NOT NULL THEN
        IF v_ideal_contact BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE + 30 THEN v_timing_bonus := 5;
        ELSIF v_ideal_contact BETWEEN CURRENT_DATE - 90 AND CURRENT_DATE - 31 THEN v_timing_bonus := 3; END IF;
      END IF;

      IF rec.lost_count > 0 AND rec.last_lost_date >= CURRENT_DATE - INTERVAL '6 months' THEN v_interest_bonus := 10;
      ELSIF rec.lost_count > 0 AND rec.last_lost_date >= CURRENT_DATE - INTERVAL '12 months' THEN v_interest_bonus := 5; END IF;

      DECLARE v_engagement INT := 0;
      BEGIN
        IF v_days_since_interaction IS NOT NULL THEN
          IF v_days_since_interaction <= 30 THEN v_engagement := v_engagement + 5;
          ELSIF v_days_since_interaction <= 90 THEN v_engagement := v_engagement + 3;
          ELSIF v_days_since_interaction <= 180 THEN v_engagement := v_engagement + 1; END IF;
        END IF;
        IF rec.referral_count >= 3 THEN v_engagement := v_engagement + 5;
        ELSIF rec.referral_count >= 1 THEN v_engagement := v_engagement + 3; END IF;
        IF v_days_until_bday IS NOT NULL THEN
          IF v_days_until_bday BETWEEN 0 AND 30 THEN v_engagement := v_engagement + 5;
          ELSIF v_days_until_bday BETWEEN 31 AND 60 THEN v_engagement := v_engagement + 3; END IF;
        END IF;
        v_engagement := LEAST(v_engagement, 15);

        v_score := LEAST(v_freq_score + v_recency_score + v_value_score + v_season_score
          + v_timing_bonus + v_interest_bonus + v_engagement, 100);

        INSERT INTO reactivation_patterns (
          contact_id, org_id,
          travel_frequency_per_year, avg_days_between_trips, total_completed_trips,
          peak_months, peak_months_confidence, typical_booking_lead_days,
          predicted_next_trip_start, predicted_next_trip_end,
          ideal_contact_date, prediction_confidence,
          avg_trip_value, total_revenue, is_high_value,
          reactivation_score, score_breakdown,
          last_destinations, preferred_duration_days,
          days_since_last_trip, days_until_ideal_contact,
          birthday_date, days_until_birthday,
          companion_names, companion_count,
          last_interaction_date, last_interaction_type, days_since_interaction,
          referral_count, is_referrer,
          last_gift_date, gifts_sent_count,
          last_lost_reason_id, last_lost_reason_name,
          last_responsavel_id, recent_interaction_warning,
          has_sibling_open_card, calculated_at
        ) VALUES (
          rec.contact_id, rec.org_id,
          rec.freq_per_year, rec.avg_gap_days, rec.total_trips,
          rec.peak_months, rec.peak_confidence, v_lead_days,
          v_predicted_start, v_predicted_end,
          v_ideal_contact, v_pred_confidence,
          ROUND(rec.avg_value, 2), ROUND(rec.total_value, 2), v_is_high_value,
          v_score,
          jsonb_build_object('frequency', v_freq_score, 'recency', v_recency_score,
            'value', v_value_score, 'seasonality', v_season_score,
            'timing', v_timing_bonus, 'interest', v_interest_bonus, 'engagement', v_engagement),
          rec.last_destinations, rec.avg_duration,
          v_days_since,
          CASE WHEN v_ideal_contact IS NOT NULL THEN (v_ideal_contact - CURRENT_DATE) ELSE NULL END,
          v_birthday, v_days_until_bday,
          COALESCE(rec.companion_names, ARRAY[]::TEXT[]),
          COALESCE(rec.companion_count, 0),
          rec.last_interaction_date, rec.last_interaction_type, v_days_since_interaction,
          rec.referral_count, rec.referral_count > 0,
          rec.last_gift_date, COALESCE(rec.gifts_count, 0),
          rec.last_lost_reason_id, rec.last_lost_reason_name,
          rec.last_responsavel_id, v_recent_warning,
          FALSE, NOW()
        )
        ON CONFLICT (contact_id) DO UPDATE SET
          org_id = EXCLUDED.org_id,
          travel_frequency_per_year = EXCLUDED.travel_frequency_per_year,
          avg_days_between_trips = EXCLUDED.avg_days_between_trips,
          total_completed_trips = EXCLUDED.total_completed_trips,
          peak_months = EXCLUDED.peak_months,
          peak_months_confidence = EXCLUDED.peak_months_confidence,
          typical_booking_lead_days = EXCLUDED.typical_booking_lead_days,
          predicted_next_trip_start = EXCLUDED.predicted_next_trip_start,
          predicted_next_trip_end = EXCLUDED.predicted_next_trip_end,
          ideal_contact_date = EXCLUDED.ideal_contact_date,
          prediction_confidence = EXCLUDED.prediction_confidence,
          avg_trip_value = EXCLUDED.avg_trip_value,
          total_revenue = EXCLUDED.total_revenue,
          is_high_value = EXCLUDED.is_high_value,
          reactivation_score = EXCLUDED.reactivation_score,
          score_breakdown = EXCLUDED.score_breakdown,
          last_destinations = EXCLUDED.last_destinations,
          preferred_duration_days = EXCLUDED.preferred_duration_days,
          days_since_last_trip = EXCLUDED.days_since_last_trip,
          days_until_ideal_contact = EXCLUDED.days_until_ideal_contact,
          birthday_date = EXCLUDED.birthday_date,
          days_until_birthday = EXCLUDED.days_until_birthday,
          companion_names = EXCLUDED.companion_names,
          companion_count = EXCLUDED.companion_count,
          last_interaction_date = EXCLUDED.last_interaction_date,
          last_interaction_type = EXCLUDED.last_interaction_type,
          days_since_interaction = EXCLUDED.days_since_interaction,
          referral_count = EXCLUDED.referral_count,
          is_referrer = EXCLUDED.is_referrer,
          last_gift_date = EXCLUDED.last_gift_date,
          gifts_sent_count = EXCLUDED.gifts_sent_count,
          last_lost_reason_id = EXCLUDED.last_lost_reason_id,
          last_lost_reason_name = EXCLUDED.last_lost_reason_name,
          last_responsavel_id = EXCLUDED.last_responsavel_id,
          recent_interaction_warning = EXCLUDED.recent_interaction_warning,
          has_sibling_open_card = EXCLUDED.has_sibling_open_card,
          calculated_at = NOW();

        v_count := v_count + 1;
      END;
    END;
  END LOOP;

  DELETE FROM reactivation_patterns rp
  WHERE rp.org_id = v_org
    AND (
      rp.contact_id IN (
        SELECT DISTINCT c.pessoa_principal_id FROM cards c
        WHERE c.org_id = v_org AND c.status_comercial = 'aberto' AND c.pessoa_principal_id IS NOT NULL
      )
      OR (v_shares = TRUE AND rp.contact_id IN (
        SELECT DISTINCT c.pessoa_principal_id FROM cards c
        WHERE c.org_id IN (SELECT id FROM organizations WHERE parent_org_id = v_parent_org AND id <> v_org)
          AND c.status_comercial = 'aberto' AND c.pessoa_principal_id IS NOT NULL
      ))
      OR rp.contact_id IN (
        SELECT contact_id FROM reactivation_suppressions
        WHERE org_id = v_org AND (suppressed_until IS NULL OR suppressed_until > now())
      )
      OR rp.contact_id NOT IN (
        SELECT co.id FROM contatos co
        JOIN cards c ON c.pessoa_principal_id = co.id
        WHERE co.org_id = v_org AND co.deleted_at IS NULL
          AND (c.ganho_planner = TRUE OR c.ganho_pos = TRUE)
          AND c.data_viagem_inicio IS NOT NULL
        GROUP BY co.id HAVING COUNT(*) >= 2
      )
    );

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_reactivation_patterns() TO service_role;
GRANT EXECUTE ON FUNCTION calculate_reactivation_patterns() TO authenticated;
