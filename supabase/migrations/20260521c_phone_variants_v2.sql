-- v2: corrige geração de variações de telefone — a versão anterior usava
-- FOR i IN 1..array_length que avalia uma vez, então variações geradas durante
-- o loop não eram processadas (perdíamos: phone=554184251655 → derivava
-- 4184251655 mas não chegava em 41984251655 que era o normalized real).
--
-- Agora gera todas as variações de uma vez com helpers explícitos.

BEGIN;

CREATE OR REPLACE FUNCTION public.br_phone_variants(p_phone TEXT)
RETURNS TEXT[] AS $$
DECLARE
  v TEXT;
  out TEXT[] := ARRAY[]::TEXT[];
  with_country TEXT;
  without_country TEXT;
BEGIN
  v := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF v = '' THEN RETURN out; END IF;
  out := array_append(out, v);

  -- Determina versões com/sem código país
  IF v ~ '^55\d{10,11}$' THEN
    with_country := v;
    without_country := substring(v FROM 3);
  ELSIF v ~ '^\d{10,11}$' THEN
    without_country := v;
    with_country := '55' || v;
  ELSE
    RETURN out;  -- formato inesperado, retorna só o original
  END IF;

  -- Adiciona ambas
  out := array_append(out, with_country);
  out := array_append(out, without_country);

  -- Variantes com/sem 9° dígito (só celulares: DDD + 9XXXXXXXX)
  -- without_country tem 10 ou 11 dígitos
  IF length(without_country) = 11 AND substring(without_country FROM 3 FOR 1) = '9' THEN
    -- Tem 9 → gera versão sem 9
    DECLARE without_nine TEXT := substring(without_country FROM 1 FOR 2) || substring(without_country FROM 4);
    BEGIN
      out := array_append(out, without_nine);
      out := array_append(out, '55' || without_nine);
    END;
  ELSIF length(without_country) = 10 THEN
    -- Não tem 9 → gera versão com 9
    DECLARE with_nine TEXT := substring(without_country FROM 1 FOR 2) || '9' || substring(without_country FROM 3);
    BEGIN
      out := array_append(out, with_nine);
      out := array_append(out, '55' || with_nine);
    END;
  END IF;

  RETURN ARRAY(SELECT DISTINCT unnest(out));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Atualiza ambas funções de RSVP pra usar o helper
CREATE OR REPLACE FUNCTION public.handle_guest_confirmacao_from_raw_event()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_event TEXT;
  v_msg_type TEXT;
  v_text TEXT;
  v_contact_phone TEXT;
  v_phone_variants TEXT[];
  v_card_id UUID;
  v_contact_id UUID;
  v_org_id UUID;
  v_updated_rows INT;
BEGIN
  v_payload := NEW.raw_payload;
  IF v_payload IS NULL THEN RETURN NEW; END IF;
  v_event := v_payload->>'event';
  IF v_event IS NULL OR v_event NOT IN ('message.sent', 'message.created') THEN RETURN NEW; END IF;
  v_msg_type := v_payload->>'message_type';
  IF v_msg_type IS NULL OR v_msg_type <> 'template' THEN RETURN NEW; END IF;
  v_text := COALESCE(v_payload->>'text', v_payload->>'template_name', '');
  IF v_text NOT ILIKE '%hospedagem para o%' OR v_text NOT ILIKE '%está%confirmada%' THEN RETURN NEW; END IF;

  v_contact_phone := COALESCE(v_payload->>'contact_phone', v_payload->'contact'->>'phone', v_payload->>'to');
  IF v_contact_phone IS NULL THEN RETURN NEW; END IF;
  v_phone_variants := public.br_phone_variants(v_contact_phone);

  SELECT wm.card_id, wm.contact_id, wm.org_id INTO v_card_id, v_contact_id, v_org_id
  FROM public.whatsapp_messages wm JOIN public.contatos c ON c.id = wm.contact_id
  WHERE c.telefone_normalizado = ANY(v_phone_variants)
    AND wm.direction = 'outbound' AND wm.card_id IS NOT NULL
    AND wm.created_at >= (now() - INTERVAL '30 days')
  ORDER BY wm.created_at DESC LIMIT 1;

  IF v_card_id IS NULL OR v_contact_id IS NULL THEN
    INSERT INTO public.guest_rsvp_events (org_id, contact_id, card_id, source, raw_text, decision, applied)
    VALUES (NULL, NULL, NULL, 'echo_extras_boasvindass', v_text, 'skipped_no_outbound', FALSE);
    RETURN NEW;
  END IF;

  UPDATE public.wedding_guests SET status_rsvp = 'confirmado', updated_at = now()
  WHERE card_id = v_card_id AND contato_id = v_contact_id AND status_rsvp <> 'confirmado';
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  INSERT INTO public.guest_rsvp_events (org_id, contact_id, card_id, source, raw_text, decision, applied)
  VALUES (v_org_id, v_contact_id, v_card_id, 'echo_extras_boasvindass', v_text, 'confirmado', v_updated_rows > 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.handle_guest_rsvp_from_raw_event()
RETURNS TRIGGER AS $$
DECLARE
  v_payload JSONB;
  v_msg_type TEXT;
  v_text TEXT;
  v_normalized TEXT;
  v_quoted_wamid TEXT;
  v_contact_phone TEXT;
  v_phone_variants TEXT[];
  v_card_id UUID;
  v_contact_id UUID;
  v_org_id UUID;
  v_updated_rows INT;
BEGIN
  v_payload := NEW.raw_payload;
  IF v_payload IS NULL THEN RETURN NEW; END IF;
  v_msg_type := v_payload->>'message_type';
  IF v_msg_type IS NULL OR v_msg_type <> 'button_reply' THEN RETURN NEW; END IF;
  v_text := v_payload->>'text';
  IF v_text IS NULL OR length(trim(v_text)) = 0 THEN RETURN NEW; END IF;
  v_normalized := lower(trim(v_text));
  v_normalized := translate(v_normalized, 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
  v_normalized := regexp_replace(v_normalized, '[[:punct:]]', '', 'g');
  v_normalized := regexp_replace(v_normalized, '\s+', ' ', 'g');
  IF v_normalized NOT LIKE 'nao vou%' THEN RETURN NEW; END IF;

  v_quoted_wamid := v_payload->'quoted'->>'whatsapp_message_id';
  IF v_quoted_wamid IS NOT NULL THEN
    SELECT card_id, contact_id, org_id INTO v_card_id, v_contact_id, v_org_id
    FROM public.whatsapp_messages
    WHERE whatsapp_message_id = v_quoted_wamid AND direction = 'outbound' AND card_id IS NOT NULL
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_card_id IS NULL THEN
    v_contact_phone := COALESCE(v_payload->'contact'->>'phone', v_payload->>'contact_phone', v_payload->>'from');
    IF v_contact_phone IS NOT NULL THEN
      v_phone_variants := public.br_phone_variants(v_contact_phone);
      SELECT wm.card_id, wm.contact_id, wm.org_id INTO v_card_id, v_contact_id, v_org_id
      FROM public.whatsapp_messages wm JOIN public.contatos c ON c.id = wm.contact_id
      WHERE c.telefone_normalizado = ANY(v_phone_variants)
        AND wm.direction = 'outbound' AND wm.card_id IS NOT NULL
        AND wm.created_at >= (now() - INTERVAL '30 days')
      ORDER BY wm.created_at DESC LIMIT 1;
    END IF;
  END IF;

  IF v_card_id IS NULL OR v_contact_id IS NULL THEN
    INSERT INTO public.guest_rsvp_events (org_id, message_id, contact_id, card_id, source, raw_text, decision, applied)
    VALUES (v_org_id, NULL, v_contact_id, NULL, 'echo_raw_event', v_text, 'skipped_no_outbound', FALSE);
    RETURN NEW;
  END IF;

  UPDATE public.wedding_guests SET status_rsvp = 'nao_vai', updated_at = now()
  WHERE card_id = v_card_id AND contato_id = v_contact_id AND status_rsvp <> 'nao_vai';
  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  INSERT INTO public.guest_rsvp_events (org_id, message_id, contact_id, card_id, source, raw_text, decision, applied)
  VALUES (v_org_id, NULL, v_contact_id, v_card_id, 'echo_raw_event', v_text, 'nao_vai', v_updated_rows > 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
