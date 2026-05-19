-- Auto-declínio de convidado via Quick Reply "Não vou ao evento" do WhatsApp.
--
-- Pipeline:
--   1. CRM envia template HSM (promom1..pade2m25) pelo Echo. Edge function
--      `send-echo-template` registra em whatsapp_messages com direction='outbound'
--      e card_id preenchido.
--   2. Convidado clica no botão Quick Reply "Não vou ao evento" no WhatsApp.
--   3. Echo dispara webhook → `whatsapp-webhook` grava em whatsapp_messages
--      com direction='inbound' e body='Não vou ao evento.' (ou similar).
--   4. Este trigger detecta o INSERT inbound, normaliza o texto, e se for um
--      "não vou", localiza o último outbound desse contato (últimos 30 dias)
--      que tem card_id preenchido — pega esse card_id e atualiza wedding_guests.
--
-- Botão "Ir ao site do casamento" é URL (não chega aqui — handle via webhook do Wedme).

BEGIN;

-- Tabela de audit pra rastrear cada decisão tomada pelo trigger.
CREATE TABLE IF NOT EXISTS public.guest_rsvp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  contact_id UUID,
  card_id UUID,
  source TEXT NOT NULL DEFAULT 'echo_webhook',
  raw_text TEXT,
  decision TEXT NOT NULL,  -- 'nao_vai' | 'skipped_no_match' | 'skipped_no_outbound'
  applied BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_rsvp_events_contact ON public.guest_rsvp_events(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_rsvp_events_card ON public.guest_rsvp_events(card_id, created_at DESC);

ALTER TABLE public.guest_rsvp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY guest_rsvp_events_org_read ON public.guest_rsvp_events FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());
CREATE POLICY guest_rsvp_events_service_all ON public.guest_rsvp_events TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.guest_rsvp_events TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- Trigger: detecta "Não vou ao evento" e marca wedding_guest como nao_vai
-- ────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_guest_rsvp_response()
RETURNS TRIGGER AS $$
DECLARE
  v_normalized_text TEXT;
  v_matched_card_id UUID;
  v_updated_rows INT;
BEGIN
  -- Só processa mensagens inbound (do cliente pra nós).
  IF NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;

  -- Só processa se tem contact_id resolvido.
  IF NEW.contact_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Filtro crítico: só clique em Quick Reply conta. Texto livre
  -- ("não vou conseguir hoje", "não vou te falar...") é ignorado.
  -- O Echo distingue cliques de botão via message_type='button_reply'.
  IF NEW.message_type <> 'button_reply' THEN
    RETURN NEW;
  END IF;

  -- Normaliza: lowercase, sem acento básico, sem espaços extras nem pontuação.
  v_normalized_text := lower(trim(NEW.body));
  v_normalized_text := translate(v_normalized_text, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  v_normalized_text := regexp_replace(v_normalized_text, '[[:punct:]]', '', 'g');
  v_normalized_text := regexp_replace(v_normalized_text, '\s+', ' ', 'g');

  -- Match "não vou ao evento" — aceita variações curtas do mesmo botão.
  IF v_normalized_text NOT LIKE 'nao vou%' THEN
    RETURN NEW;
  END IF;

  -- Pega card_id da última mensagem outbound desse contato (últimos 30 dias).
  SELECT card_id INTO v_matched_card_id
  FROM public.whatsapp_messages
  WHERE contact_id = NEW.contact_id
    AND direction = 'outbound'
    AND card_id IS NOT NULL
    AND created_at >= (now() - INTERVAL '30 days')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_matched_card_id IS NULL THEN
    -- Não achou envio recente — só grava audit, não atualiza nada.
    INSERT INTO public.guest_rsvp_events
      (org_id, message_id, contact_id, card_id, source, raw_text, decision, applied)
    VALUES
      (NEW.org_id, NEW.id, NEW.contact_id, NULL, 'echo_webhook', NEW.body,
       'skipped_no_outbound', FALSE);
    RETURN NEW;
  END IF;

  -- Atualiza wedding_guests (card + contato) pra nao_vai.
  UPDATE public.wedding_guests
  SET status_rsvp = 'nao_vai',
      updated_at = now()
  WHERE card_id = v_matched_card_id
    AND contato_id = NEW.contact_id
    AND status_rsvp <> 'nao_vai';

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  INSERT INTO public.guest_rsvp_events
    (org_id, message_id, contact_id, card_id, source, raw_text, decision, applied)
  VALUES
    (NEW.org_id, NEW.id, NEW.contact_id, v_matched_card_id, 'echo_webhook',
     NEW.body, 'nao_vai', v_updated_rows > 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_guest_rsvp_response ON public.whatsapp_messages;
CREATE TRIGGER trg_handle_guest_rsvp_response
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_guest_rsvp_response();

COMMIT;
