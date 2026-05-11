-- log_monde_people_event: se contato sem monde_person_id for editado,
-- enfileirar como 'created' (não 'updated'). O dispatcher faz search-before-create
-- em 'created' e vincula monde_person_id quando encontra match no Monde.
-- Sem essa mudança, edições de contatos nunca-sincronizados ficavam só no CRM.

BEGIN;

CREATE OR REPLACE FUNCTION public.log_monde_people_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_sync_source TEXT;
  v_changed TEXT[];
  v_event_type TEXT;
BEGIN
  -- Anti-loop: skip se a origem é o import do Monde
  v_sync_source := current_setting('app.monde_sync_source', true);
  IF v_sync_source = 'import' THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.integration_settings
    WHERE key = 'MONDE_V2_SYNC_ENABLED' AND value = 'true'
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.integration_settings
    WHERE key = 'MONDE_V2_SYNC_DIRECTION' AND value = 'inbound_only'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.nome IS NULL OR trim(NEW.nome) = '' THEN
      RETURN NEW;
    END IF;

    -- Se monde_person_id já preenchido no INSERT, veio do import — não enfileirar
    IF NEW.monde_person_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields)
    VALUES (NEW.id, 'created', NULL);

  ELSIF TG_OP = 'UPDATE' THEN
    v_changed := ARRAY[]::TEXT[];

    IF OLD.nome IS DISTINCT FROM NEW.nome THEN v_changed := v_changed || ARRAY['nome']::TEXT[]; END IF;
    IF OLD.sobrenome IS DISTINCT FROM NEW.sobrenome THEN v_changed := v_changed || ARRAY['sobrenome']::TEXT[]; END IF;
    IF OLD.email IS DISTINCT FROM NEW.email THEN v_changed := v_changed || ARRAY['email']::TEXT[]; END IF;
    IF OLD.telefone IS DISTINCT FROM NEW.telefone THEN v_changed := v_changed || ARRAY['telefone']::TEXT[]; END IF;
    IF OLD.cpf IS DISTINCT FROM NEW.cpf THEN v_changed := v_changed || ARRAY['cpf']::TEXT[]; END IF;
    IF OLD.data_nascimento IS DISTINCT FROM NEW.data_nascimento THEN v_changed := v_changed || ARRAY['data_nascimento']::TEXT[]; END IF;
    IF OLD.sexo IS DISTINCT FROM NEW.sexo THEN v_changed := v_changed || ARRAY['sexo']::TEXT[]; END IF;
    IF OLD.passaporte IS DISTINCT FROM NEW.passaporte THEN v_changed := v_changed || ARRAY['passaporte']::TEXT[]; END IF;
    IF OLD.passaporte_validade IS DISTINCT FROM NEW.passaporte_validade THEN v_changed := v_changed || ARRAY['passaporte_validade']::TEXT[]; END IF;
    IF OLD.rg IS DISTINCT FROM NEW.rg THEN v_changed := v_changed || ARRAY['rg']::TEXT[]; END IF;
    IF OLD.observacoes IS DISTINCT FROM NEW.observacoes THEN v_changed := v_changed || ARRAY['observacoes']::TEXT[]; END IF;
    IF OLD.endereco IS DISTINCT FROM NEW.endereco THEN v_changed := v_changed || ARRAY['endereco']::TEXT[]; END IF;

    IF array_length(v_changed, 1) > 0 THEN
      -- Contato sem monde_person_id: enfileirar como 'created' para disparar
      -- search-before-create no dispatcher (vincula se encontrar match no Monde,
      -- cria novo se não encontrar). Antes ficava skipado sem nunca vincular.
      IF NEW.monde_person_id IS NULL THEN
        v_event_type := 'created';
      ELSE
        v_event_type := 'updated';
      END IF;

      INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields)
      VALUES (NEW.id, v_event_type, v_changed);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMIT;
