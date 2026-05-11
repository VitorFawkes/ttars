-- Sprint D — Motor temporal novo
--
-- Reconstrói os gatilhos por data em cima de cadence_event_triggers +
-- cadence_entry_queue, substituindo os 5 event_types antigos
-- (dias_antes_viagem, dias_apos_viagem, aniversario_contato, proposta_expirada,
-- dias_no_stage) e o card_won (que nunca teve emissor) por 2 famílias:
--
-- - time_offset_from_date — data-pivô + número livre de offset_days
--   sources: card.data_viagem_inicio / card.data_viagem_fim / contato.data_nascimento / proposal.expires_at
--   event_config: {source, offset_days, time_of_day?}
--
-- - time_in_stage — múltiplos stages + número livre de days_in_stage
--   event_config: {stage_ids: [...], days_in_stage: INT}
--
-- Cron diário às 9h SP (12h UTC) chama fn_enqueue_temporal_events(), que
-- enfileira disparos em cadence_entry_queue. Dedup natural: 1 disparo por
-- (card, trigger, dia).

BEGIN;

-- ============================================================================
-- 1) cards.stage_changed_at — coluna + trigger + backfill
-- ============================================================================

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.cards_update_stage_changed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id THEN
    NEW.stage_changed_at := NOW();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cards_stage_changed_at ON public.cards;
CREATE TRIGGER trg_cards_stage_changed_at
BEFORE UPDATE ON public.cards
FOR EACH ROW
EXECUTE FUNCTION public.cards_update_stage_changed_at();

-- Backfill: cards existentes não têm stage_changed_at. Usa updated_at como
-- melhor estimativa. Rodado ANTES do cron temporal ser ativado — senão o
-- primeiro disparo de time_in_stage pegaria massivamente cards antigos.
UPDATE public.cards
SET stage_changed_at = COALESCE(updated_at, created_at, NOW())
WHERE stage_changed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cards_stage_changed_at
  ON public.cards (stage_changed_at, pipeline_stage_id)
  WHERE status_comercial = 'aberto';

-- ============================================================================
-- 2) is_proactive_event_type: adiciona os 2 event_types novos
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_proactive_event_type(p_event_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_event_type IN (
    'card_created',
    'stage_enter',
    'macro_stage_enter',
    'field_changed',
    'tag_added',
    'tag_removed',
    'cron_roteamento',
    'time_offset_from_date',
    'time_in_stage'
  );
$$;

-- ============================================================================
-- 3) fn_enqueue_temporal_events: enfileira disparos diários
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_enqueue_temporal_events()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Nota: aniversário. Compara MÊS+DIA (ignora ano), aplica offset_days.
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
    JOIN public.contatos co ON co.id = c.contato_id
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'contato.data_nascimento'
      AND co.data_nascimento IS NOT NULL
      -- Aniversário deste ano + offset_days bate em hoje
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
  -- Proposta que ainda não foi aceita — status != 'accepted'.
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_offset_from_date',
           jsonb_build_object(
             'source', 'proposal.expires_at',
             'offset_days', (t.event_config->>'offset_days')::INT,
             'target_date', CURRENT_DATE,
             'proposal_id', p.id
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN public.cards c ON c.org_id = t.org_id
    JOIN public.proposals p ON p.card_id = c.id
    WHERE t.is_active = true
      AND t.event_type = 'time_offset_from_date'
      AND t.event_config->>'source' = 'proposal.expires_at'
      AND p.expires_at IS NOT NULL
      AND p.accepted_at IS NULL
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

  -- ── time_in_stage ──
  WITH inserted AS (
    INSERT INTO public.cadence_entry_queue (org_id, card_id, trigger_id, event_type, event_data, execute_at, status)
    SELECT c.org_id, c.id, t.id, 'time_in_stage',
           jsonb_build_object(
             'days_in_stage', (t.event_config->>'days_in_stage')::INT,
             'stage_id', c.pipeline_stage_id,
             'stage_changed_at', c.stage_changed_at
           ),
           NOW(), 'pending'
    FROM public.cadence_event_triggers t
    JOIN public.cards c ON c.org_id = t.org_id
    WHERE t.is_active = true
      AND t.event_type = 'time_in_stage'
      AND c.status_comercial = 'aberto'
      AND c.stage_changed_at IS NOT NULL
      AND c.stage_changed_at < NOW() - (
        (t.event_config->>'days_in_stage')::INT * INTERVAL '1 day'
      )
      -- stage_ids do event_config é um jsonb array — usa ? operator
      AND t.event_config ? 'stage_ids'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(t.event_config->'stage_ids') AS sid
        WHERE sid = c.pipeline_stage_id::TEXT
      )
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

  RETURN v_total;
END $$;

COMMENT ON FUNCTION public.fn_enqueue_temporal_events() IS
'Sprint D: enfileira disparos de automations temporais (time_offset_from_date, time_in_stage) em cadence_entry_queue. Chamado pelo pg_cron "cadence-temporal-enqueue" todo dia às 9h SP. Dedup natural: 1 linha por (card, trigger, dia SP).';

-- ============================================================================
-- 4) pg_cron: cadence-temporal-enqueue às 9h SP (12h UTC)
-- ============================================================================

-- Remove cron antigo se já existir (idempotência)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cadence-temporal-enqueue') THEN
    PERFORM cron.unschedule('cadence-temporal-enqueue');
  END IF;
END $$;

SELECT cron.schedule(
  'cadence-temporal-enqueue',
  '0 12 * * *',  -- 12h UTC = 9h SP
  $$SELECT public.fn_enqueue_temporal_events()$$
);

COMMIT;
