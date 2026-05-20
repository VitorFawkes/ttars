-- Processa "Não vou ao evento" direto de whatsapp_raw_events.
--
-- O trigger existente em whatsapp_messages (handle_guest_rsvp_response) só
-- dispara se a mensagem chegar a ser inserida em whatsapp_messages. Mas o
-- pipeline atual pula o INSERT pra linhas marcadas como "ignore" (caso da
-- linha "Convidados" — não tem agente IA). Resultado: o webhook do Echo
-- chegava em whatsapp_raw_events com status='ignored' e não atualizava o RSVP.
--
-- Esta versão roda direto sobre whatsapp_raw_events e usa
-- raw_payload->quoted->whatsapp_message_id pra fazer o match exato com a
-- mensagem outbound que o convidado está respondendo (sem heurística de
-- janela de 30 dias).

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_guest_rsvp_from_raw_event()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_msg_type TEXT;
  v_text TEXT;
  v_normalized TEXT;
  v_quoted_wamid TEXT;
  v_contact_phone TEXT;
  v_contact_phone_normalized TEXT;
  v_card_id UUID;
  v_contact_id UUID;
  v_org_id UUID;
  v_updated_rows INT;
BEGIN
  v_payload := NEW.raw_payload;
  IF v_payload IS NULL THEN RETURN NEW; END IF;

  -- Só clique em Quick Reply
  v_msg_type := v_payload->>'message_type';
  IF v_msg_type IS NULL OR v_msg_type <> 'button_reply' THEN
    RETURN NEW;
  END IF;

  -- Match no texto "não vou"
  v_text := v_payload->>'text';
  IF v_text IS NULL OR length(trim(v_text)) = 0 THEN RETURN NEW; END IF;
  v_normalized := lower(trim(v_text));
  v_normalized := translate(v_normalized, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  v_normalized := regexp_replace(v_normalized, '[[:punct:]]', '', 'g');
  v_normalized := regexp_replace(v_normalized, '\s+', ' ', 'g');
  IF v_normalized NOT LIKE 'nao vou%' THEN RETURN NEW; END IF;

  -- Match preferencial: quoted.whatsapp_message_id aponta direto pra
  -- mensagem outbound que o convidado está respondendo.
  v_quoted_wamid := v_payload->'quoted'->>'whatsapp_message_id';
  IF v_quoted_wamid IS NOT NULL THEN
    SELECT card_id, contact_id, org_id
      INTO v_card_id, v_contact_id, v_org_id
    FROM public.whatsapp_messages
    WHERE whatsapp_message_id = v_quoted_wamid
      AND direction = 'outbound'
      AND card_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Fallback: busca último outbound do contato pelo telefone (30 dias)
  IF v_card_id IS NULL THEN
    v_contact_phone := COALESCE(
      v_payload->'contact'->>'phone',
      v_payload->>'contact_phone',
      v_payload->>'from'
    );
    IF v_contact_phone IS NOT NULL THEN
      v_contact_phone_normalized := regexp_replace(v_contact_phone, '\D', '', 'g');
      SELECT wm.card_id, wm.contact_id, wm.org_id
        INTO v_card_id, v_contact_id, v_org_id
      FROM public.whatsapp_messages wm
      JOIN public.contatos c ON c.id = wm.contact_id
      WHERE c.telefone_normalizado = v_contact_phone_normalized
        AND wm.direction = 'outbound'
        AND wm.card_id IS NOT NULL
        AND wm.created_at >= (now() - INTERVAL '30 days')
      ORDER BY wm.created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  -- Sem match — registra skipped
  IF v_card_id IS NULL OR v_contact_id IS NULL THEN
    INSERT INTO public.guest_rsvp_events
      (org_id, message_id, contact_id, card_id, source, raw_text, decision, applied)
    VALUES
      (v_org_id, NULL, v_contact_id, NULL, 'echo_raw_event', v_text, 'skipped_no_outbound', FALSE);
    RETURN NEW;
  END IF;

  -- Atualiza wedding_guests
  UPDATE public.wedding_guests
  SET status_rsvp = 'nao_vai', updated_at = now()
  WHERE card_id = v_card_id
    AND contato_id = v_contact_id
    AND status_rsvp <> 'nao_vai';
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  INSERT INTO public.guest_rsvp_events
    (org_id, message_id, contact_id, card_id, source, raw_text, decision, applied)
  VALUES
    (v_org_id, NULL, v_contact_id, v_card_id, 'echo_raw_event', v_text, 'nao_vai', v_updated_rows > 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_guest_rsvp_from_raw_event ON public.whatsapp_raw_events;
CREATE TRIGGER trg_handle_guest_rsvp_from_raw_event
  AFTER INSERT ON public.whatsapp_raw_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_guest_rsvp_from_raw_event();

COMMIT;
