-- Fix: trigger log_monde_people_event inserts em monde_people_queue sem org_id.
-- Quando chamada via edge function (service_role), requesting_org_id() retorna NULL
-- e o insert falha por violar NOT NULL. Pegar org_id diretamente do contato.
--
-- Preserva o fix anterior (20260408) de array concat com cast explícito TEXT[].

CREATE OR REPLACE FUNCTION public.log_monde_people_event()
RETURNS trigger AS $$
DECLARE
  v_sync_source TEXT;
  v_changed TEXT[];
BEGIN
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

    IF NEW.monde_person_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields, org_id)
    VALUES (NEW.id, 'created', NULL, NEW.org_id);

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
      INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields, org_id)
      VALUES (NEW.id, 'updated', v_changed, NEW.org_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
