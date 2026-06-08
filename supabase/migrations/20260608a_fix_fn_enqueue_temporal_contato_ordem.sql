-- Fix: fn_enqueue_temporal_events() voltou a quebrar com
--   ERROR: column cc.eh_principal does not exist
-- cards_contatos NÃO tem coluna eh_principal. O contato "principal" do card
-- é o primeiro da junção (ordem = 1) — convenção já usada em
-- 20260420e / 20260428c e nas views de analytics (ordem = 1).
--
-- REGRESSÃO: o hotfix de 28/04 (20260428c) trocou eh_principal -> ordem = 1,
-- mas as migrations de 26/05 (20260526o_temporal_source_data_reuniao,
-- 20260526p_calendly_meeting_exact_time) recriaram a função com
-- CREATE OR REPLACE e reintroduziram eh_principal = true, derrubando o cron
-- diário "cadence-temporal-enqueue" (falha em ~0.05s todos os dias desde então).
--
-- ATENÇÃO FUTURO: antes de CREATE OR REPLACE nesta função, manter o JOIN de
-- contato em `cc.ordem = 1`. Não reverter para eh_principal.

CREATE OR REPLACE FUNCTION public.fn_enqueue_temporal_events()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total INT := 0;
  v_count INT;
BEGIN
  -- ── time_offset_from_date: source = card.data_viagem_inicio ──
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'card.data_viagem_inicio',
             'offset_days', (t.event_config->>'offset_days')::INT,
             'target_date', CURRENT_DATE
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN public.cards c ON c.org_id = t.org_id
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'card.data_viagem_inicio'
      AND c.data_viagem_inicio IS NOT NULL
      AND DATE(c.data_viagem_inicio AT TIME ZONE 'America/Sao_Paulo')
          + ((t.event_config->>'offset_days')::INT) = CURRENT_DATE
      AND (
        t.applicable_pipeline_ids IS NULL
        OR array_length(t.applicable_pipeline_ids, 1) IS NULL
        OR c.pipeline_id = ANY(t.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = c.id AND q.trigger_id = t.id
          AND DATE(q.created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  -- ── time_offset_from_date: source = card.data_viagem_fim ──
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'card.data_viagem_fim',
             'offset_days', (t.event_config->>'offset_days')::INT,
             'target_date', CURRENT_DATE
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN public.cards c ON c.org_id = t.org_id
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'card.data_viagem_fim'
      AND c.data_viagem_fim IS NOT NULL
      AND DATE(c.data_viagem_fim AT TIME ZONE 'America/Sao_Paulo')
          + ((t.event_config->>'offset_days')::INT) = CURRENT_DATE
      AND (
        t.applicable_pipeline_ids IS NULL
        OR array_length(t.applicable_pipeline_ids, 1) IS NULL
        OR c.pipeline_id = ANY(t.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = c.id AND q.trigger_id = t.id
          AND DATE(q.created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  -- ── time_offset_from_date: source = contato.data_nascimento ──
  -- Usa cards_contatos (junção) para encontrar o contato principal do card.
  -- O contato principal é o primeiro da junção (ordem = 1) — cards_contatos
  -- NÃO possui coluna eh_principal.
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'contato.data_nascimento',
             'offset_days', (t.event_config->>'offset_days')::INT,
             'target_date', CURRENT_DATE
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN public.cards c ON c.org_id = t.org_id
    JOIN public.cards_contatos cc ON cc.card_id = c.id AND cc.ordem = 1
    JOIN public.contatos co ON co.id = cc.contato_id
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'contato.data_nascimento'
      AND co.data_nascimento IS NOT NULL
      AND (
        MAKE_DATE(
          EXTRACT(YEAR FROM CURRENT_DATE)::INT,
          EXTRACT(MONTH FROM co.data_nascimento)::INT,
          EXTRACT(DAY FROM co.data_nascimento)::INT
        ) + ((t.event_config->>'offset_days')::INT)
      ) = CURRENT_DATE
      AND (
        t.applicable_pipeline_ids IS NULL
        OR array_length(t.applicable_pipeline_ids, 1) IS NULL
        OR c.pipeline_id = ANY(t.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = c.id AND q.trigger_id = t.id
          AND DATE(q.created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  -- ── time_offset_from_date: source = proposal.expires_at ──
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'proposal.expires_at',
             'offset_days', (t.event_config->>'offset_days')::INT,
             'target_date', CURRENT_DATE
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN public.cards c ON c.org_id = t.org_id
    JOIN public.proposals p ON p.card_id = c.id AND p.status <> 'accepted'
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'proposal.expires_at'
      AND p.expires_at IS NOT NULL
      AND DATE(p.expires_at AT TIME ZONE 'America/Sao_Paulo')
          + ((t.event_config->>'offset_days')::INT) = CURRENT_DATE
      AND (
        t.applicable_pipeline_ids IS NULL
        OR array_length(t.applicable_pipeline_ids, 1) IS NULL
        OR c.pipeline_id = ANY(t.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = c.id AND q.trigger_id = t.id
          AND DATE(q.created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  -- ── NOVO: time_offset_from_date: source = viagem.embarque_inicio ──
  WITH earliest_departure AS (
    SELECT v.id AS viagem_id, v.card_id, v.org_id,
      MIN(
        CASE
          WHEN (i.operacional->>'data_inicio') ~ '^\d{4}-\d{2}-\d{2}$'
          THEN (i.operacional->>'data_inicio')::DATE
          ELSE NULL
        END
      ) AS data_embarque
    FROM viagens v
    JOIN trip_items i ON i.viagem_id = v.id AND i.deleted_at IS NULL
    WHERE v.card_id IS NOT NULL
      AND v.estado IN ('confirmada', 'em_montagem', 'aguardando_embarque')
    GROUP BY v.id, v.card_id, v.org_id
  ),
  inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT ed.org_id, ed.card_id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'viagem.embarque_inicio',
             'offset_days', (t.event_config->>'offset_days')::INT,
             'target_date', CURRENT_DATE,
             'viagem_id', ed.viagem_id,
             'data_embarque', ed.data_embarque
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN earliest_departure ed ON ed.org_id = t.org_id
    JOIN public.cards c ON c.id = ed.card_id
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'viagem.embarque_inicio'
      AND ed.data_embarque IS NOT NULL
      AND ed.data_embarque + ((t.event_config->>'offset_days')::INT) = CURRENT_DATE
      AND (
        t.applicable_pipeline_ids IS NULL
        OR array_length(t.applicable_pipeline_ids, 1) IS NULL
        OR c.pipeline_id = ANY(t.applicable_pipeline_ids)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.cadence_entry_queue q
        WHERE q.card_id = ed.card_id AND q.trigger_id = t.id
          AND DATE(q.created_at AT TIME ZONE 'America/Sao_Paulo') = CURRENT_DATE
      )
    LIMIT 1000
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;
  v_total := v_total + COALESCE(v_count, 0);

  RETURN v_total;
END
$function$;
