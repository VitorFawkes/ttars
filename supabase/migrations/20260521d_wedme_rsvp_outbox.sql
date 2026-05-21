-- Webhook RSVP pro Wedme: sempre que um convidado é marcado automaticamente
-- como nao_vai (trigger handle_guest_rsvp_from_raw_event a partir do Quick
-- Reply "Não vou ao evento" no WhatsApp), enfileira um POST pro Wedme avisando.
--
-- Outbox pattern:
-- 1. Trigger em guest_rsvp_events insere row em wedme_rsvp_outbox com payload
--    pronto.
-- 2. Trigger em wedme_rsvp_outbox chama edge function via pg_net.http_post
--    (fire-and-forget). Edge function faz POST pro Wedme e atualiza outbox
--    com response_code/response_body.
-- 3. pg_cron a cada 5min processa retries de rows com status='failed' e
--    attempts < 5 (backoff exponencial em next_retry_at).
--
-- Contrato Wedme: docs/rsvp-webhook.pdf

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- Constantes hardcoded (são fixas do projeto)
-- ────────────────────────────────────────────────────────────────────────

-- Project URL e service_role_key serão lidos via env vars do edge function.
-- Pra triggers SQL precisamos do project URL fixo:
DO $$
BEGIN
  PERFORM set_config('app.supabase_url', 'https://szyrzxvlptqqheizyrxu.supabase.co', false);
END $$;

-- ────────────────────────────────────────────────────────────────────────
-- Helpers SQL
-- ────────────────────────────────────────────────────────────────────────

-- Extrai slug do site Wedme. Ex: https://www.wedme.com.br/chriseguilherme/ → chriseguilherme
CREATE OR REPLACE FUNCTION public.extract_wedme_slug(produto_data JSONB) RETURNS TEXT AS $$
  SELECT NULLIF(
    regexp_replace(
      COALESCE(produto_data->>'ww_site_casamento', ''),
      '^https?://[^/]+/([^/?#]+).*$', '\1'
    ),
    ''
  )
$$ LANGUAGE SQL IMMUTABLE;

-- Normaliza telefone pra E.164 BR: +55XXXXXXXXXXX
CREATE OR REPLACE FUNCTION public.format_phone_e164_br(telefone TEXT) RETURNS TEXT AS $$
DECLARE digits TEXT;
BEGIN
  digits := regexp_replace(COALESCE(telefone, ''), '\D', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;
  IF digits ~ '^55\d{10,11}$' THEN RETURN '+' || digits; END IF;
  IF digits ~ '^\d{10,11}$' THEN RETURN '+55' || digits; END IF;
  RETURN '+' || digits;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ────────────────────────────────────────────────────────────────────────
-- Tabela outbox
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wedme_rsvp_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_rsvp_event_id UUID REFERENCES public.guest_rsvp_events(id) ON DELETE SET NULL,
  card_id UUID REFERENCES public.cards(id) ON DELETE SET NULL,
  wedding_slug TEXT NOT NULL,
  target_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempts INT NOT NULL DEFAULT 0,
  response_code INT,
  response_body TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  next_retry_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_wedme_rsvp_outbox_status_retry
  ON public.wedme_rsvp_outbox(status, next_retry_at) WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_wedme_rsvp_outbox_event
  ON public.wedme_rsvp_outbox(guest_rsvp_event_id);

ALTER TABLE public.wedme_rsvp_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wedme_rsvp_outbox_service_all ON public.wedme_rsvp_outbox;
CREATE POLICY wedme_rsvp_outbox_service_all ON public.wedme_rsvp_outbox TO service_role
  USING (true) WITH CHECK (true);

-- Realtime opcional pra dashboard futuro
ALTER PUBLICATION supabase_realtime ADD TABLE public.wedme_rsvp_outbox;

-- ────────────────────────────────────────────────────────────────────────
-- Trigger em guest_rsvp_events: enfileira webhook
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_enqueue_wedme_rsvp() RETURNS TRIGGER AS $$
DECLARE
  v_card_produto_data JSONB;
  v_contato_nome TEXT;
  v_contato_sobrenome TEXT;
  v_contato_telefone TEXT;
  v_slug TEXT;
  v_phone TEXT;
  v_nome TEXT;
  v_occurred_at TEXT;
  v_payload JSONB;
BEGIN
  -- Só nao_vai aplicado
  IF NEW.decision <> 'nao_vai' OR NEW.applied <> TRUE THEN RETURN NEW; END IF;
  IF NEW.card_id IS NULL OR NEW.contact_id IS NULL THEN RETURN NEW; END IF;

  SELECT produto_data INTO v_card_produto_data FROM public.cards WHERE id = NEW.card_id;
  v_slug := public.extract_wedme_slug(v_card_produto_data);

  IF v_slug IS NULL OR length(v_slug) = 0 THEN
    INSERT INTO public.wedme_rsvp_outbox
      (guest_rsvp_event_id, card_id, wedding_slug, target_url, payload, status, last_error)
    VALUES
      (NEW.id, NEW.card_id, '(missing)', '', '{}'::jsonb, 'skipped',
       'wedding_slug não encontrado em produto_data.ww_site_casamento');
    RETURN NEW;
  END IF;

  SELECT nome, sobrenome, telefone
    INTO v_contato_nome, v_contato_sobrenome, v_contato_telefone
  FROM public.contatos WHERE id = NEW.contact_id;

  v_phone := public.format_phone_e164_br(v_contato_telefone);
  v_nome := trim(concat_ws(' ', v_contato_nome, v_contato_sobrenome));

  IF v_phone IS NULL OR v_nome = '' THEN
    INSERT INTO public.wedme_rsvp_outbox
      (guest_rsvp_event_id, card_id, wedding_slug, target_url, payload, status, last_error)
    VALUES
      (NEW.id, NEW.card_id, v_slug, '', '{}'::jsonb, 'skipped',
       'contato sem telefone ou nome válido');
    RETURN NEW;
  END IF;

  v_occurred_at := to_char(NEW.created_at AT TIME ZONE 'America/Sao_Paulo',
                           'YYYY-MM-DD"T"HH24:MI:SS-03:00');

  v_payload := jsonb_build_object(
    'event_id', NEW.id::text,
    'event_type', 'rsvp.response',
    'occurred_at', v_occurred_at,
    'wedding_slug', v_slug,
    'responsavel', jsonb_build_object('nome', v_nome, 'telefone', v_phone),
    'convidados', jsonb_build_array(
      jsonb_build_object(
        'nome', v_nome,
        'status', 'nao_vai',
        'respondido_em', v_occurred_at
      )
    ),
    'mensagem_original', COALESCE(NEW.raw_text, '')
  );

  INSERT INTO public.wedme_rsvp_outbox
    (guest_rsvp_event_id, card_id, wedding_slug, target_url, payload, status)
  VALUES (
    NEW.id,
    NEW.card_id,
    v_slug,
    'https://app.wedme.com.br/api/webhooks/rsvp/' || v_slug,
    v_payload,
    'pending'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enqueue_wedme_rsvp_after_event ON public.guest_rsvp_events;
CREATE TRIGGER trg_enqueue_wedme_rsvp_after_event
  AFTER INSERT ON public.guest_rsvp_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_enqueue_wedme_rsvp();

-- ────────────────────────────────────────────────────────────────────────
-- Trigger no outbox: dispara edge function via pg_net
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_dispatch_wedme_rsvp() RETURNS TRIGGER AS $$
DECLARE
  v_service_key TEXT;
BEGIN
  -- Só dispara se for pending (skipped/sent/failed não precisam)
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  -- Lê service_role_key de uma fonte segura. Como não temos secret store
  -- em SQL, lemos via vault/secrets se disponível, senão pulamos o dispatch
  -- inline (cron pega no próximo ciclo).
  BEGIN
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_service_key := NULL;
  END;

  -- Sem service_key, o trigger não chama o dispatcher direto — cron pega depois.
  IF v_service_key IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/wedme-rsvp-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object('outbox_id', NEW.id::text)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_dispatch_wedme_rsvp_after_insert ON public.wedme_rsvp_outbox;
CREATE TRIGGER trg_dispatch_wedme_rsvp_after_insert
  AFTER INSERT ON public.wedme_rsvp_outbox
  FOR EACH ROW EXECUTE FUNCTION public.trg_dispatch_wedme_rsvp();

-- ────────────────────────────────────────────────────────────────────────
-- pg_cron pra retry de pendentes/falhas (5min)
-- ────────────────────────────────────────────────────────────────────────
-- O cron usa a mesma estratégia: lê service_role_key do vault. Sem ele, no-op.

DO $body$
DECLARE
  v_service_key TEXT;
  v_job_exists INT;
BEGIN
  -- Remove job antigo se existir (re-aplica idempotente)
  SELECT count(*)::int INTO v_job_exists FROM cron.job WHERE jobname = 'wedme-rsvp-retry';
  IF v_job_exists > 0 THEN
    PERFORM cron.unschedule('wedme-rsvp-retry');
  END IF;

  -- Agenda novo job. O job tenta ler service_key na hora de executar.
  PERFORM cron.schedule(
    'wedme-rsvp-retry',
    '*/5 * * * *',
    $sql$
      DO $inner$
      DECLARE v_key TEXT;
      BEGIN
        BEGIN
          SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
        EXCEPTION WHEN OTHERS THEN v_key := NULL;
        END;
        IF v_key IS NULL THEN RETURN; END IF;
        PERFORM net.http_post(
          url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/wedme-rsvp-dispatcher',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
          body := jsonb_build_object('action', 'process_pending')
        );
      END $inner$;
    $sql$
  );
END $body$;

COMMIT;
