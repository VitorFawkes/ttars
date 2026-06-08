-- Fix: gatilhos criados pelo builder v2 (src/pages/admin/automations/) gravam o
-- deslocamento em event_config->>'days_offset', mas fn_enqueue_temporal_events
-- só lia event_config->>'offset_days' (chave do builder antigo
-- src/pages/admin/cadence/AutomacaoBuilderPage.tsx).
-- Resultado: gatilhos do builder novo nunca disparavam (offset = NULL → a conta
-- de data nunca casava com CURRENT_DATE), em silêncio.
--
-- Correção: ler AS DUAS chaves via COALESCE(offset_days, days_offset, 0).
-- Mantém compat com gatilhos antigos e recipes (automation-recipes.ts usam
-- offset_days) e passa a disparar os do builder v2 (days_offset).
--
-- Mantém o JOIN de contato em cc.ordem = 1 (ver 20260608a — não reverter para
-- eh_principal, coluna inexistente em cards_contatos).

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
             'offset_days', COALESCE((t.event_config->>'offset_days')::INT, (t.event_config->>'days_offset')::INT),
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
          + COALESCE((t.event_config->>'offset_days')::INT, (t.event_config->>'days_offset')::INT, 0) = CURRENT_DATE
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
             'offset_days', COALESCE((t.event_config->>'offset_days')::INT, (t.event_config->>'days_offset')::INT),
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
          + COALESCE((t.event_config->>'offset_days')::INT, (t.event_config->>'days_offset')::INT, 0) = CURRENT_DATE
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
  -- Contato principal = primeiro da junção (cc.ordem = 1). cards_contatos
  -- NÃO possui coluna eh_principal.
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'contato.data_nascimento',
             'offset_days', COALESCE((t.event_config->>'offset_days')::INT, (t.event_config->>'days_offset')::INT),
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
        ) + COALESCE((t.event_config->>'offset_days')::INT, (t.event_config->>'days_offset')::INT, 0)
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
             'offset_days', COALESCE((t.event_config->>'offset_days')::INT, (t.event_config->>'days_offset')::INT),
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
          + COALESCE((t.event_config->>'offset_days')::INT, (t.event_config->>'days_offset')::INT, 0) = CURRENT_DATE
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

  -- ── time_offset_from_date: source = viagem.embarque_inicio ──
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
             'offset_days', COALESCE((t.event_config->>'offset_days')::INT, (t.event_config->>'days_offset')::INT),
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
      AND ed.data_embarque + COALESCE((t.event_config->>'offset_days')::INT, (t.event_config->>'days_offset')::INT, 0) = CURRENT_DATE
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
