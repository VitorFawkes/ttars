-- Estende trg_enqueue_wedme_rsvp pra enfileirar DUAS rows por evento RSVP:
-- uma pra produção (app.wedme.com.br) e outra pra homologação
-- (wedme20.vercel.app). Permite validar a integração ponta-a-ponta em
-- homolog enquanto o endpoint de produção do Wedme não está deployado.
--
-- Quando produção do Wedme entrar no ar, basta remover o segundo INSERT
-- (ou manter pra observabilidade contínua — dois ambientes do Wedme têm
-- bancos separados, então o event_id idempotente do lado deles cobre
-- reenvios sem efeito colateral).

BEGIN;

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
  -- Só nao_vai aplicado dispara webhook
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

  -- (1) Enfileira pra PRODUÇÃO
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

  -- (2) Enfileira pra HOMOLOGAÇÃO em paralelo
  INSERT INTO public.wedme_rsvp_outbox
    (guest_rsvp_event_id, card_id, wedding_slug, target_url, payload, status)
  VALUES (
    NEW.id,
    NEW.card_id,
    v_slug,
    'https://wedme20.vercel.app/api/webhooks/rsvp/' || v_slug,
    v_payload,
    'pending'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
