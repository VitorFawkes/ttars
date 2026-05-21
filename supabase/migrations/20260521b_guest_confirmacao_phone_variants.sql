-- Corrige match de telefone no trigger handle_guest_confirmacao_from_raw_event.
-- O Echo manda contact_phone com/sem código do país e com/sem o 9º dígito
-- (variações brasileiras), e o telefone_normalizado dos contatos pode estar
-- em qualquer um dos formatos. Geramos as 4 variações e procuramos por
-- todas no lookup.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_guest_confirmacao_from_raw_event()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_event TEXT;
  v_msg_type TEXT;
  v_text TEXT;
  v_contact_phone TEXT;
  v_phone_digits TEXT;
  v_phone_variants TEXT[];
  v_card_id UUID;
  v_contact_id UUID;
  v_org_id UUID;
  v_updated_rows INT;
BEGIN
  v_payload := NEW.raw_payload;
  IF v_payload IS NULL THEN RETURN NEW; END IF;

  v_event := v_payload->>'event';
  IF v_event IS NULL OR v_event NOT IN ('message.sent', 'message.created') THEN
    RETURN NEW;
  END IF;

  v_msg_type := v_payload->>'message_type';
  IF v_msg_type IS NULL OR v_msg_type <> 'template' THEN
    RETURN NEW;
  END IF;

  v_text := COALESCE(v_payload->>'text', v_payload->>'template_name', '');
  IF v_text NOT ILIKE '%hospedagem para o%' OR v_text NOT ILIKE '%está%confirmada%' THEN
    RETURN NEW;
  END IF;

  v_contact_phone := COALESCE(
    v_payload->>'contact_phone',
    v_payload->'contact'->>'phone',
    v_payload->>'to'
  );
  IF v_contact_phone IS NULL THEN RETURN NEW; END IF;
  v_phone_digits := regexp_replace(v_contact_phone, '\D', '', 'g');

  -- Gera variações BR: com/sem código país, com/sem 9° dígito
  v_phone_variants := ARRAY[v_phone_digits];
  -- Remove código país 55 do começo (se tiver e for BR-shaped)
  IF v_phone_digits ~ '^55\d{10,11}$' THEN
    v_phone_variants := array_append(v_phone_variants, substring(v_phone_digits FROM 3));
  END IF;
  -- Adiciona ou remove 9° dígito (apenas celulares BR: DDD + 9XXXXXXXX vs DDD + XXXXXXXX)
  FOR i IN 1..array_length(v_phone_variants, 1) LOOP
    DECLARE v TEXT := v_phone_variants[i];
    BEGIN
      -- DDD 2 dígitos + 9 + 8 dígitos = 11 → remove o 9
      IF length(v) = 11 AND substring(v FROM 3 FOR 1) = '9' THEN
        v_phone_variants := array_append(v_phone_variants, substring(v FROM 1 FOR 2) || substring(v FROM 4));
      END IF;
      -- DDD 2 dígitos + 8 dígitos = 10 → adiciona o 9
      IF length(v) = 10 THEN
        v_phone_variants := array_append(v_phone_variants, substring(v FROM 1 FOR 2) || '9' || substring(v FROM 3));
      END IF;
      -- 55 + DDD + 9 + 8 dígitos = 13 → remove o 9
      IF length(v) = 13 AND substring(v FROM 1 FOR 2) = '55' AND substring(v FROM 5 FOR 1) = '9' THEN
        v_phone_variants := array_append(v_phone_variants, substring(v FROM 1 FOR 4) || substring(v FROM 6));
      END IF;
      -- 55 + DDD + 8 dígitos = 12 → adiciona o 9
      IF length(v) = 12 AND substring(v FROM 1 FOR 2) = '55' THEN
        v_phone_variants := array_append(v_phone_variants, substring(v FROM 1 FOR 4) || '9' || substring(v FROM 5));
      END IF;
    END;
  END LOOP;

  -- Acha o contato + último outbound com card_id usando QUALQUER variação
  SELECT wm.card_id, wm.contact_id, wm.org_id
    INTO v_card_id, v_contact_id, v_org_id
  FROM public.whatsapp_messages wm
  JOIN public.contatos c ON c.id = wm.contact_id
  WHERE c.telefone_normalizado = ANY(v_phone_variants)
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

-- Aplica o mesmo fix no trigger de "Não vou ao evento" pra consistência
CREATE OR REPLACE FUNCTION public.handle_guest_rsvp_from_raw_event()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_msg_type TEXT;
  v_text TEXT;
  v_normalized TEXT;
  v_quoted_wamid TEXT;
  v_contact_phone TEXT;
  v_phone_digits TEXT;
  v_phone_variants TEXT[];
  v_card_id UUID;
  v_contact_id UUID;
  v_org_id UUID;
  v_updated_rows INT;
BEGIN
  v_payload := NEW.raw_payload;
  IF v_payload IS NULL THEN RETURN NEW; END IF;

  v_msg_type := v_payload->>'message_type';
  IF v_msg_type IS NULL OR v_msg_type <> 'button_reply' THEN
    RETURN NEW;
  END IF;

  v_text := v_payload->>'text';
  IF v_text IS NULL OR length(trim(v_text)) = 0 THEN RETURN NEW; END IF;
  v_normalized := lower(trim(v_text));
  v_normalized := translate(v_normalized, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  v_normalized := regexp_replace(v_normalized, '[[:punct:]]', '', 'g');
  v_normalized := regexp_replace(v_normalized, '\s+', ' ', 'g');
  IF v_normalized NOT LIKE 'nao vou%' THEN RETURN NEW; END IF;

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

  IF v_card_id IS NULL THEN
    v_contact_phone := COALESCE(
      v_payload->'contact'->>'phone',
      v_payload->>'contact_phone',
      v_payload->>'from'
    );
    IF v_contact_phone IS NOT NULL THEN
      v_phone_digits := regexp_replace(v_contact_phone, '\D', '', 'g');
      v_phone_variants := ARRAY[v_phone_digits];
      IF v_phone_digits ~ '^55\d{10,11}$' THEN
        v_phone_variants := array_append(v_phone_variants, substring(v_phone_digits FROM 3));
      END IF;
      FOR i IN 1..array_length(v_phone_variants, 1) LOOP
        DECLARE v TEXT := v_phone_variants[i];
        BEGIN
          IF length(v) = 11 AND substring(v FROM 3 FOR 1) = '9' THEN
            v_phone_variants := array_append(v_phone_variants, substring(v FROM 1 FOR 2) || substring(v FROM 4));
          END IF;
          IF length(v) = 10 THEN
            v_phone_variants := array_append(v_phone_variants, substring(v FROM 1 FOR 2) || '9' || substring(v FROM 3));
          END IF;
          IF length(v) = 13 AND substring(v FROM 1 FOR 2) = '55' AND substring(v FROM 5 FOR 1) = '9' THEN
            v_phone_variants := array_append(v_phone_variants, substring(v FROM 1 FOR 4) || substring(v FROM 6));
          END IF;
          IF length(v) = 12 AND substring(v FROM 1 FOR 2) = '55' THEN
            v_phone_variants := array_append(v_phone_variants, substring(v FROM 1 FOR 4) || '9' || substring(v FROM 5));
          END IF;
        END;
      END LOOP;

      SELECT wm.card_id, wm.contact_id, wm.org_id
        INTO v_card_id, v_contact_id, v_org_id
      FROM public.whatsapp_messages wm
      JOIN public.contatos c ON c.id = wm.contact_id
      WHERE c.telefone_normalizado = ANY(v_phone_variants)
        AND wm.direction = 'outbound'
        AND wm.card_id IS NOT NULL
        AND wm.created_at >= (now() - INTERVAL '30 days')
      ORDER BY wm.created_at DESC
      LIMIT 1;
    END IF;
  END IF;

  IF v_card_id IS NULL OR v_contact_id IS NULL THEN
    INSERT INTO public.guest_rsvp_events
      (org_id, message_id, contact_id, card_id, source, raw_text, decision, applied)
    VALUES
      (v_org_id, NULL, v_contact_id, NULL, 'echo_raw_event', v_text, 'skipped_no_outbound', FALSE);
    RETURN NEW;
  END IF;

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

COMMIT;
