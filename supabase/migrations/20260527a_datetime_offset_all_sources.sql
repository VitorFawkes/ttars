-- Generaliza o processador de hora-exata pra TODAS as fontes de data com timestamp:
--   card.data_reuniao, card.data_viagem_inicio, card.data_viagem_fim, proposal.expires_at.
-- Gate: só triggers cujo event_config tem 'minutes_offset' (modo hora-exata novo).
-- Triggers antigos (offset_days) seguem no motor diário fn_enqueue_temporal_events.
-- Aniversário fica fora (recorrente anual, sem hora).
-- Mantém o nome da função (já agendada no cron a cada 5 min na 20260526p).

CREATE OR REPLACE FUNCTION public.fn_enqueue_calendly_meeting_reminders()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT := 0;
  v_count INT;
BEGIN
  -- ── Fontes baseadas em colunas do card ──
  WITH base AS (
    SELECT
      t.id AS trigger_id, t.org_id, t.applicable_pipeline_ids,
      t.event_config->>'source' AS source,
      COALESCE((t.event_config->>'minutes_offset')::INT, 0) AS mins,
      c.id AS card_id, c.pipeline_id,
      CASE t.event_config->>'source'
        WHEN 'card.data_reuniao' THEN
          NULLIF(c.produto_data->>'data_reuniao', '')::timestamp
        WHEN 'card.data_viagem_inicio' THEN c.data_viagem_inicio::timestamp
        WHEN 'card.data_viagem_fim'    THEN c.data_viagem_fim::timestamp
        ELSE NULL
      END AS base_local_ts
    FROM cadence_event_triggers t
    JOIN cards c ON c.org_id = t.org_id
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config ? 'minutes_offset'
      AND t.event_config->>'source' IN ('card.data_reuniao', 'card.data_viagem_inicio', 'card.data_viagem_fim')
  ),
  resolved AS (
    SELECT *,
      (base_local_ts + (mins || ' minutes')::interval) AT TIME ZONE 'America/Sao_Paulo' AS target_ts
    FROM base
    WHERE base_local_ts IS NOT NULL
  ),
  inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT r.org_id, r.card_id, r.trigger_id, 'time_offset_from_date',
           jsonb_build_object('source', r.source, 'minutes_offset', r.mins, 'target_time', r.target_ts),
           NOW(), 'pending'
    FROM resolved r
    WHERE r.target_ts <= NOW()
      AND r.target_ts > NOW() - INTERVAL '1 day'
      AND (
        r.applicable_pipeline_ids IS NULL
        OR array_length(r.applicable_pipeline_ids, 1) IS NULL
        OR r.pipeline_id = ANY(r.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = r.card_id AND q.trigger_id = r.trigger_id
          AND q.created_at > NOW() - INTERVAL '2 days'
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  -- ── Fonte proposal.expires_at (join em proposals) ──
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'proposal.expires_at',
             'minutes_offset', COALESCE((t.event_config->>'minutes_offset')::INT, 0),
             'target_time', p.expires_at + (COALESCE((t.event_config->>'minutes_offset')::INT, 0) || ' minutes')::interval
           ),
           NOW(), 'pending'
    FROM cadence_event_triggers t
    JOIN cards c ON c.org_id = t.org_id
    JOIN proposals p ON p.card_id = c.id AND p.status <> 'accepted'
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config ? 'minutes_offset'
      AND t.event_config->>'source' = 'proposal.expires_at'
      AND p.expires_at IS NOT NULL
      AND (p.expires_at + (COALESCE((t.event_config->>'minutes_offset')::INT, 0) || ' minutes')::interval) <= NOW()
      AND (p.expires_at + (COALESCE((t.event_config->>'minutes_offset')::INT, 0) || ' minutes')::interval) > NOW() - INTERVAL '1 day'
      AND (
        t.applicable_pipeline_ids IS NULL
        OR array_length(t.applicable_pipeline_ids, 1) IS NULL
        OR c.pipeline_id = ANY(t.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = c.id AND q.trigger_id = t.id
          AND q.created_at > NOW() - INTERVAL '2 days'
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  RETURN v_total;
END
$$;

COMMENT ON FUNCTION public.fn_enqueue_calendly_meeting_reminders() IS
  'Dispara gatilhos time_offset_from_date no horário exato (minutes_offset) pra fontes com timestamp: data_reuniao, viagem_inicio/fim, proposal.expires_at. Roda a cada 5 min.';
