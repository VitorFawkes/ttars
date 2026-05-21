-- Marca wedding_guests como 'confirmado' quando o Echo dispara o template
-- extras_boasvindass — que é mandado automaticamente pelo Wedme quando o
-- convidado finaliza a reserva no site do casal.
--
-- Como o Echo não expõe o nome do template no webhook (joga o body renderizado
-- no campo template_name), detectamos pelo conteúdo único do template:
-- "Destination Wedding de X está *confirmada!*".
--
-- Match do casamento: igual ao auto-declínio — último outbound do contato
-- com card_id nos últimos 30 dias.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_guest_confirmacao_from_raw_event()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_event TEXT;
  v_msg_type TEXT;
  v_text TEXT;
  v_contact_phone TEXT;
  v_contact_phone_normalized TEXT;
  v_card_id UUID;
  v_contact_id UUID;
  v_org_id UUID;
  v_updated_rows INT;
BEGIN
  v_payload := NEW.raw_payload;
  IF v_payload IS NULL THEN RETURN NEW; END IF;

  -- Só mensagens outbound (Echo manda extras_boasvindass como message.sent)
  v_event := v_payload->>'event';
  IF v_event IS NULL OR v_event NOT IN ('message.sent', 'message.created') THEN
    RETURN NEW;
  END IF;

  -- Só templates
  v_msg_type := v_payload->>'message_type';
  IF v_msg_type IS NULL OR v_msg_type <> 'template' THEN
    RETURN NEW;
  END IF;

  -- Detecção pelo conteúdo do extras_boasvindass — string única do template
  v_text := COALESCE(v_payload->>'text', v_payload->>'template_name', '');
  IF v_text NOT ILIKE '%hospedagem para o%' OR v_text NOT ILIKE '%está%confirmada%' THEN
    RETURN NEW;
  END IF;

  -- Extrai contact_phone (pode vir em vários campos)
  v_contact_phone := COALESCE(
    v_payload->>'contact_phone',
    v_payload->'contact'->>'phone',
    v_payload->>'to'
  );
  IF v_contact_phone IS NULL THEN RETURN NEW; END IF;
  v_contact_phone_normalized := regexp_replace(v_contact_phone, '\D', '', 'g');

  -- Acha o contato + último outbound com card_id (mesmo padrão do auto-declínio)
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

  IF v_card_id IS NULL OR v_contact_id IS NULL THEN
    INSERT INTO public.guest_rsvp_events
      (org_id, contact_id, card_id, source, raw_text, decision, applied)
    VALUES
      (NULL, NULL, NULL, 'echo_extras_boasvindass', v_text, 'skipped_no_outbound', FALSE);
    RETURN NEW;
  END IF;

  UPDATE public.wedding_guests
  SET status_rsvp = 'confirmado', updated_at = now()
  WHERE card_id = v_card_id
    AND contato_id = v_contact_id
    AND status_rsvp <> 'confirmado';
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  INSERT INTO public.guest_rsvp_events
    (org_id, contact_id, card_id, source, raw_text, decision, applied)
  VALUES
    (v_org_id, v_contact_id, v_card_id, 'echo_extras_boasvindass', v_text, 'confirmado', v_updated_rows > 0);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_handle_guest_confirmacao ON public.whatsapp_raw_events;
CREATE TRIGGER trg_handle_guest_confirmacao
  AFTER INSERT ON public.whatsapp_raw_events
  FOR EACH ROW EXECUTE FUNCTION public.handle_guest_confirmacao_from_raw_event();

-- Permitir o valor novo no enum decision do guest_rsvp_events (se for enum)
-- Como a coluna é TEXT, não precisa alterar.

COMMIT;
