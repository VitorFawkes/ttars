-- Fix: cast timestamptz para DATE antes de subtrair (interval → integer)

CREATE OR REPLACE FUNCTION calculate_reactivation_patterns()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org UUID;
  v_count INT := 0;
  v_median_value NUMERIC;
  rec RECORD;
BEGIN
  v_org := requesting_org_id();

  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(c.valor_final, c.valor_estimado, 0))
  INTO v_median_value
  FROM cards c
  WHERE c.org_id = v_org
    AND (c.ganho_planner = TRUE OR c.ganho_pos = TRUE)
    AND COALESCE(c.valor_final, c.valor_estimado, 0) > 0;

  IF v_median_value IS NULL OR v_median_value = 0 THEN
    v_median_value := 10000;
  END IF;

  FOR rec IN
    WITH contact_trips AS (
      SELECT
        co.id AS contact_id,
        co.org_id,
        c.id AS card_id,
        c.data_viagem_inicio::DATE AS data_viagem_inicio,
        c.data_viagem_fim::DATE AS data_viagem_fim,
        c.data_fechamento::DATE AS data_fechamento,
        COALESCE(c.valor_final, c.valor_estimado, 0) AS valor,
        c.produto_data,
        EXTRACT(MONTH FROM c.data_viagem_inicio)::INT AS trip_month,
        ROW_NUMBER() OVER (PARTITION BY co.id ORDER BY c.data_viagem_inicio DESC) AS rn
      FROM contatos co
      JOIN cards c ON c.pessoa_principal_id = co.id
      WHERE co.org_id = v_org
        AND co.deleted_at IS NULL
        AND (c.ganho_planner = TRUE OR c.ganho_pos = TRUE)
        AND c.data_viagem_inicio IS NOT NULL
        AND c.data_viagem_inicio <= CURRENT_DATE + INTERVAL '1 year'
    ),
    contact_agg AS (
      SELECT
        contact_id,
        org_id,
        COUNT(*) AS total_trips,
        COUNT(*) FILTER (
          WHERE data_viagem_fim >= CURRENT_DATE - INTERVAL '36 months'
        ) AS trips_36m,
        AVG(valor) AS avg_value,
        SUM(valor) AS total_value,
        MAX(data_viagem_inicio) AS last_trip_start,
        MAX(data_viagem_fim) AS last_trip_end,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY CASE
            WHEN data_fechamento IS NOT NULL AND data_viagem_inicio > data_fechamento
            THEN (data_viagem_inicio - data_fechamento)
          END
        ) AS median_lead_days,
        AVG(
          CASE WHEN data_viagem_fim IS NOT NULL AND data_viagem_inicio IS NOT NULL
          THEN (data_viagem_fim - data_viagem_inicio) END
        )::INT AS avg_duration,
        AVG(gap_days)::INT AS avg_gap_days,
        ARRAY_AGG(trip_month ORDER BY data_viagem_inicio) AS all_months
      FROM (
        SELECT ct.*,
          (ct.data_viagem_inicio - LAG(ct.data_viagem_inicio) OVER (
            PARTITION BY ct.contact_id ORDER BY ct.data_viagem_inicio
          )) AS gap_days
        FROM contact_trips ct
      ) sub
      GROUP BY contact_id, org_id
      HAVING COUNT(*) >= 2
    ),
    seasonality AS (
      SELECT
        contact_id,
        ARRAY_AGG(month_num ORDER BY month_num) FILTER (WHERE occurrence >= 2) AS peak_months,
        MAX(occurrence)::NUMERIC / NULLIF(MAX(total_trips), 0) AS peak_confidence
      FROM (
        SELECT
          ca.contact_id,
          ca.total_trips,
          m AS month_num,
          COUNT(*) AS occurrence
        FROM contact_agg ca,
          UNNEST(ca.all_months) AS m
        GROUP BY ca.contact_id, ca.total_trips, m
      ) month_counts
      GROUP BY contact_id
    ),
    last_dests AS (
      SELECT
        contact_id,
        ARRAY_AGG(dest ORDER BY rn) FILTER (WHERE rn <= 3) AS last_3_destinations
      FROM (
        SELECT
          ct.contact_id,
          ct.rn,
          CASE
            WHEN ct.produto_data IS NOT NULL AND ct.produto_data ? 'destinos'
            THEN (ct.produto_data->>'destinos')
            ELSE NULL
          END AS dest
        FROM contact_trips ct
        WHERE ct.rn <= 3
      ) d
      GROUP BY contact_id
    )
    SELECT
      ca.contact_id,
      ca.org_id,
      ca.total_trips,
      ca.trips_36m,
      ROUND(ca.trips_36m / 3.0, 2) AS freq_per_year,
      ca.avg_gap_days,
      ca.avg_value,
      ca.total_value,
      ca.last_trip_start,
      ca.last_trip_end,
      ca.median_lead_days::INT AS median_lead_days,
      ca.avg_duration,
      COALESCE(s.peak_months, ARRAY[]::INT[]) AS peak_months,
      COALESCE(s.peak_confidence, 0) AS peak_confidence,
      COALESCE(ld.last_3_destinations, ARRAY[]::TEXT[]) AS last_destinations
    FROM contact_agg ca
    LEFT JOIN seasonality s ON s.contact_id = ca.contact_id
    LEFT JOIN last_dests ld ON ld.contact_id = ca.contact_id
  LOOP
    DECLARE
      v_score INT := 0;
      v_freq_score INT := 0;
      v_recency_score INT := 0;
      v_value_score INT := 0;
      v_season_score INT := 0;
      v_timing_bonus INT := 0;
      v_days_since INT;
      v_predicted_start DATE;
      v_predicted_end DATE;
      v_ideal_contact DATE;
      v_pred_confidence NUMERIC := 0;
      v_lead_days INT;
      v_next_peak_month INT;
      v_is_high_value BOOLEAN;
    BEGIN
      v_days_since := (CURRENT_DATE - rec.last_trip_end);
      v_lead_days := COALESCE(rec.median_lead_days, 90);

      -- PREDIÇÃO
      IF ARRAY_LENGTH(rec.peak_months, 1) > 0 THEN
        SELECT m INTO v_next_peak_month
        FROM UNNEST(rec.peak_months) AS m
        WHERE MAKE_DATE(
          CASE WHEN m >= EXTRACT(MONTH FROM CURRENT_DATE)::INT
               THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT
               ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1
          END, m, 1
        ) > CURRENT_DATE
        ORDER BY MAKE_DATE(
          CASE WHEN m >= EXTRACT(MONTH FROM CURRENT_DATE)::INT
               THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT
               ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1
          END, m, 1
        )
        LIMIT 1;

        IF v_next_peak_month IS NOT NULL THEN
          v_predicted_start := MAKE_DATE(
            CASE WHEN v_next_peak_month >= EXTRACT(MONTH FROM CURRENT_DATE)::INT
                 THEN EXTRACT(YEAR FROM CURRENT_DATE)::INT
                 ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT + 1
            END, v_next_peak_month, 1
          );
          v_predicted_end := v_predicted_start + (COALESCE(rec.avg_duration, 10))::INT;
          v_pred_confidence := LEAST(rec.peak_confidence, 0.95);
        END IF;

      ELSIF rec.avg_gap_days IS NOT NULL AND rec.avg_gap_days > 0 THEN
        v_predicted_start := rec.last_trip_start + rec.avg_gap_days;
        v_predicted_end := v_predicted_start + COALESCE(rec.avg_duration, 10);
        v_pred_confidence := LEAST(0.5 + (rec.total_trips::NUMERIC * 0.05), 0.80);
      END IF;

      IF v_predicted_start IS NOT NULL THEN
        v_ideal_contact := v_predicted_start - v_lead_days;
      END IF;

      -- SCORING
      v_freq_score := LEAST(ROUND(rec.freq_per_year * 12.5)::INT, 25);

      v_recency_score := CASE
        WHEN v_days_since <= 90 THEN 15
        WHEN v_days_since <= 180 THEN 10
        WHEN v_days_since <= 365 THEN 5
        ELSE 0
      END;

      v_is_high_value := rec.avg_value >= v_median_value * 1.5;
      v_value_score := LEAST(
        ROUND((rec.avg_value / NULLIF(v_median_value * 2, 0)) * 35)::INT,
        35
      );

      IF ARRAY_LENGTH(rec.peak_months, 1) >= 2 THEN
        v_season_score := 25;
      ELSIF ARRAY_LENGTH(rec.peak_months, 1) = 1 THEN
        v_season_score := 12;
      ELSE
        v_season_score := 0;
      END IF;

      IF v_ideal_contact IS NOT NULL THEN
        IF v_ideal_contact <= CURRENT_DATE THEN
          v_timing_bonus := 10;
        ELSIF v_ideal_contact <= CURRENT_DATE + 30 THEN
          v_timing_bonus := 10;
        ELSIF v_ideal_contact <= CURRENT_DATE + 60 THEN
          v_timing_bonus := 5;
        END IF;
      END IF;

      v_score := LEAST(v_freq_score + v_recency_score + v_value_score + v_season_score + v_timing_bonus, 100);

      -- UPSERT
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
        calculated_at
      ) VALUES (
        rec.contact_id, rec.org_id,
        rec.freq_per_year, rec.avg_gap_days, rec.total_trips,
        rec.peak_months, rec.peak_confidence, v_lead_days,
        v_predicted_start, v_predicted_end,
        v_ideal_contact, v_pred_confidence,
        ROUND(rec.avg_value, 2), ROUND(rec.total_value, 2), v_is_high_value,
        v_score,
        jsonb_build_object(
          'frequency', v_freq_score,
          'recency', v_recency_score,
          'value', v_value_score,
          'seasonality', v_season_score,
          'timing', v_timing_bonus
        ),
        rec.last_destinations, rec.avg_duration,
        v_days_since,
        CASE WHEN v_ideal_contact IS NOT NULL
             THEN (v_ideal_contact - CURRENT_DATE)
             ELSE NULL END,
        NOW()
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
        calculated_at = NOW();

      v_count := v_count + 1;
    END;
  END LOOP;

  DELETE FROM reactivation_patterns
  WHERE org_id = v_org
    AND contact_id NOT IN (
      SELECT co.id
      FROM contatos co
      JOIN contact_stats cs ON cs.contact_id = co.id
      WHERE co.org_id = v_org
        AND co.deleted_at IS NULL
        AND cs.total_trips >= 2
    );

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_reactivation_patterns() TO service_role;
GRANT EXECUTE ON FUNCTION calculate_reactivation_patterns() TO authenticated;
