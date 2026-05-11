-- Fix: "malformed array literal: nome" ao editar contato
--
-- A migration 20260406 reintroduziu o bug que 20260402 tinha corrigido.
-- O operador || com TEXT[] e texto literal é ambíguo no PostgreSQL.
-- Fix: usar ARRAY['campo']::TEXT[] explícito em cada concatenação.

CREATE OR REPLACE FUNCTION public.log_monde_people_event()
RETURNS trigger AS $$
DECLARE
  v_sync_source TEXT;
  v_changed TEXT[];
BEGIN
  -- Anti-loop: skip se a origem é o import do Monde (via set_config, quando disponível)
  v_sync_source := current_setting('app.monde_sync_source', true);
  IF v_sync_source = 'import' THEN
    RETURN NEW;
  END IF;

  -- Skip se sync não está habilitado
  IF NOT EXISTS (
    SELECT 1 FROM public.integration_settings
    WHERE key = 'MONDE_V2_SYNC_ENABLED' AND value = 'true'
  ) THEN
    RETURN NEW;
  END IF;

  -- Skip se direção é inbound_only
  IF EXISTS (
    SELECT 1 FROM public.integration_settings
    WHERE key = 'MONDE_V2_SYNC_DIRECTION' AND value = 'inbound_only'
  ) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Skip contatos sem nome (incomplete records)
    IF NEW.nome IS NULL OR trim(NEW.nome) = '' THEN
      RETURN NEW;
    END IF;

    -- Fix Bug 1: se monde_person_id já está preenchido no INSERT,
    -- o contato foi importado do Monde — não enfileirar para evitar loop
    IF NEW.monde_person_id IS NOT NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields)
    VALUES (NEW.id, 'created', NULL);

  ELSIF TG_OP = 'UPDATE' THEN
    -- Construir array de campos mudados com cast explícito TEXT[]
    -- para evitar ambiguidade do operador ||
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

    -- Só enfileira se algo relevante mudou
    IF array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields)
      VALUES (NEW.id, 'updated', v_changed);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
