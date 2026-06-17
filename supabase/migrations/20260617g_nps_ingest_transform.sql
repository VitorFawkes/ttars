-- ============================================================================
-- MIGRATION: NPS Fase 2 — transform de nps_webhook_events -> nps_surveys/responses
-- Date: 2026-06-17
--
-- A Edge Function nps-webhook (Fase 1) guarda respostas cruas em
-- nps_webhook_events (status='pending'). Esta migration cria a transformação:
--
--   1. ingest_nps_from_event(uuid): parse tolerante do payload (shape Typeform
--      answers[] OU campos planos), match do contato por TELEFONE (fallback
--      e-mail), palpite do card TRIPS mais recente do contato, e insert
--      idempotente em nps_surveys + nps_responses (espelha o backfill
--      20260516c). Defensiva: nunca propaga erro (marca evento 'failed').
--   2. Trigger AFTER INSERT em nps_webhook_events -> processa toda resposta nova
--      automaticamente (sem cron, sem redeploy de função).
--   3. Backfill: processa os eventos 'pending' já existentes.
--
-- Match por telefone usa normalize_phone_brazil() + contatos.telefone_normalizado
-- (mesma trilha do resto do CRM). Contato pode ter vários cards — o card aqui é
-- só o "principal" (palpite p/ KPIs); a tela de resultados mostra TODOS os cards
-- do contato (ver useContactAvailableCards no frontend).
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

-- ----------------------------------------------------------------------------
-- Função de ingest (1 evento -> survey + response)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ingest_nps_from_event(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_evt        public.nps_webhook_events%ROWTYPE;
  v_payload    jsonb;
  v_answers    jsonb;
  v_org_id     uuid;
  v_phone_raw  text;
  v_phone_norm text;
  v_email      text;
  v_score_txt  text;
  v_score      int;
  v_comment    text;
  v_destino    text;
  v_external   text;
  v_responded  timestamptz;
  v_contact_id uuid;
  v_card_id    uuid;
  v_survey_id  uuid;
BEGIN
  SELECT * INTO v_evt FROM public.nps_webhook_events WHERE id = p_event_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_evt.status = 'processed' THEN RETURN; END IF;

  BEGIN  -- subtransação: em erro, reverte inserts parciais e marca 'failed'
    v_payload := v_evt.payload;
    v_answers := v_payload->'answers';

    SELECT id INTO v_org_id FROM public.organizations WHERE slug = 'welcome-trips' LIMIT 1;
    IF v_org_id IS NULL THEN
      RAISE EXCEPTION 'org welcome-trips nao encontrada';
    END IF;

    -- ---- Extração de campos ----
    IF jsonb_typeof(v_answers) = 'array' THEN
      -- Shape Typeform: answers[] = {title, value}
      v_phone_raw := (SELECT a->>'value' FROM jsonb_array_elements(v_answers) a
                      WHERE unaccent(lower(a->>'title')) LIKE '%telefone%' LIMIT 1);
      v_score_txt := (SELECT a->>'value' FROM jsonb_array_elements(v_answers) a
                      WHERE unaccent(lower(a->>'title')) LIKE '%0 a 10%'
                         OR unaccent(lower(a->>'title')) LIKE '%indicaria%' LIMIT 1);
      IF v_score_txt IS NULL THEN
        -- fallback: a resposta cujo valor é número 0-10
        v_score_txt := (SELECT a->>'value' FROM jsonb_array_elements(v_answers) a
                        WHERE (a->>'value') ~ '^[0-9]{1,2}$'
                          AND (a->>'value')::int BETWEEN 0 AND 10 LIMIT 1);
      END IF;
      v_comment := (SELECT a->>'value' FROM jsonb_array_elements(v_answers) a
                    WHERE unaccent(lower(a->>'title')) LIKE '%experi%' LIMIT 1);
      v_destino := (SELECT a->>'value' FROM jsonb_array_elements(v_answers) a
                    WHERE unaccent(lower(a->>'title')) LIKE '%destino%' LIMIT 1);
    ELSE
      -- Fallback: outras fontes com campos planos
      v_phone_raw := coalesce(v_payload->>'telefone', v_payload->>'phone');
      v_score_txt := coalesce(v_payload->>'score', v_payload->>'nota');
      v_comment   := coalesce(v_payload->>'comment', v_payload->>'comentario');
      v_destino   := coalesce(v_payload->>'proximo_destino', v_payload->>'destino');
    END IF;

    v_email    := coalesce(v_payload#>>'{response,respondentEmail}', v_payload->>'email');
    v_external := coalesce(v_payload#>>'{response,id}', v_payload->>'event_id',
                           v_payload->>'id', v_evt.idempotency_key);
    IF v_external IS NULL OR v_external = '' THEN
      v_external := 'nps_evt_' || p_event_id::text;  -- garante idempotência por evento
    END IF;
    v_responded := coalesce(
      nullif(v_payload#>>'{response,submittedAt}', '')::timestamptz,
      v_evt.received_at
    );

    -- Score 0-10 obrigatório; sem isso, não é resposta NPS válida.
    v_score := nullif(regexp_replace(coalesce(v_score_txt, ''), '\D', '', 'g'), '')::int;
    IF v_score IS NULL OR v_score < 0 OR v_score > 10 THEN
      UPDATE public.nps_webhook_events
        SET status = 'ignored', processed_at = now(), error = 'sem score 0-10 reconhecivel'
        WHERE id = p_event_id;
      RETURN;
    END IF;

    -- ---- Match do contato: telefone (normalizado) -> fallback e-mail ----
    IF v_phone_raw IS NOT NULL THEN
      v_phone_norm := public.normalize_phone_brazil(v_phone_raw);
      IF v_phone_norm IS NOT NULL AND v_phone_norm <> '' THEN
        SELECT id INTO v_contact_id FROM public.contatos
          WHERE telefone_normalizado = v_phone_norm
          ORDER BY created_at ASC NULLS LAST LIMIT 1;
      END IF;
    END IF;
    IF v_contact_id IS NULL AND v_email IS NOT NULL AND v_email <> '' THEN
      SELECT id INTO v_contact_id FROM public.contatos
        WHERE lower(email) = lower(v_email)
        ORDER BY created_at ASC NULLS LAST LIMIT 1;
    END IF;

    -- ---- Card "principal" (palpite): card TRIPS mais recente do contato ----
    IF v_contact_id IS NOT NULL THEN
      SELECT c.id INTO v_card_id
      FROM public.cards c
      WHERE c.org_id = v_org_id
        AND c.deleted_at IS NULL
        AND (
          c.pessoa_principal_id = v_contact_id
          OR EXISTS (SELECT 1 FROM public.cards_contatos cc
                     WHERE cc.card_id = c.id AND cc.contato_id = v_contact_id)
        )
      ORDER BY (c.pessoa_principal_id = v_contact_id) DESC, c.created_at DESC NULLS LAST
      LIMIT 1;
    END IF;

    -- ---- Insert idempotente (espelha 20260516c) ----
    INSERT INTO public.nps_surveys
      (org_id, card_id, contact_id, channel, sent_at, source_external_id, created_at)
    VALUES
      (v_org_id, v_card_id, v_contact_id, 'form', v_responded, v_external, v_responded)
    ON CONFLICT (source_external_id) WHERE source_external_id IS NOT NULL DO NOTHING
    RETURNING id INTO v_survey_id;

    IF v_survey_id IS NULL THEN
      SELECT id INTO v_survey_id FROM public.nps_surveys
        WHERE source_external_id = v_external LIMIT 1;
    END IF;

    INSERT INTO public.nps_responses
      (survey_id, org_id, card_id, score, comment, proximo_destino, responded_at, raw_payload, created_at)
    VALUES
      (v_survey_id, v_org_id, v_card_id, v_score, nullif(v_comment, ''), nullif(v_destino, ''),
       v_responded, v_payload, v_responded)
    ON CONFLICT (survey_id) DO NOTHING;

    UPDATE public.nps_webhook_events
      SET status = 'processed', processed_at = now(), error = NULL
      WHERE id = p_event_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.nps_webhook_events
      SET status = 'failed', processed_at = now(), error = left(SQLERRM, 500)
      WHERE id = p_event_id;
  END;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.ingest_nps_from_event(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- Trigger: processa toda resposta nova automaticamente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_nps_webhook_events_ingest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $tg$
BEGIN
  PERFORM public.ingest_nps_from_event(NEW.id);  -- nunca propaga erro (função é defensiva)
  RETURN NULL;
END;
$tg$;

DROP TRIGGER IF EXISTS trg_nps_webhook_events_ingest ON public.nps_webhook_events;
CREATE TRIGGER trg_nps_webhook_events_ingest
  AFTER INSERT ON public.nps_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_nps_webhook_events_ingest();

-- ----------------------------------------------------------------------------
-- Backfill: eventos pendentes já recebidos
-- ----------------------------------------------------------------------------
DO $bf$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.nps_webhook_events WHERE status = 'pending' LOOP
    PERFORM public.ingest_nps_from_event(r.id);
  END LOOP;
END
$bf$;

COMMIT;
