-- Fix: anti-loop robusto (funciona com connection pooling) + array_append

CREATE OR REPLACE FUNCTION public.log_monde_people_event()
RETURNS trigger AS $$
DECLARE
  v_changed TEXT[] := ARRAY[]::TEXT[];
BEGIN
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
    IF NEW.nome IS NULL OR trim(NEW.nome) = '' THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields)
    VALUES (NEW.id, 'created', NULL);

  ELSIF TG_OP = 'UPDATE' THEN
    -- Anti-loop: se APENAS monde_person_id e/ou monde_last_sync mudaram,
    -- é o import linkando o contato → NÃO enfileirar de volta
    -- Isso funciona com connection pooling (não depende de SET LOCAL)
    IF (OLD.nome IS NOT DISTINCT FROM NEW.nome
        AND OLD.sobrenome IS NOT DISTINCT FROM NEW.sobrenome
        AND OLD.email IS NOT DISTINCT FROM NEW.email
        AND OLD.telefone IS NOT DISTINCT FROM NEW.telefone
        AND OLD.cpf IS NOT DISTINCT FROM NEW.cpf
        AND OLD.data_nascimento IS NOT DISTINCT FROM NEW.data_nascimento
        AND OLD.sexo IS NOT DISTINCT FROM NEW.sexo
        AND OLD.passaporte IS NOT DISTINCT FROM NEW.passaporte
        AND OLD.passaporte_validade IS NOT DISTINCT FROM NEW.passaporte_validade
        AND OLD.rg IS NOT DISTINCT FROM NEW.rg
        AND OLD.observacoes IS NOT DISTINCT FROM NEW.observacoes
        AND OLD.endereco IS NOT DISTINCT FROM NEW.endereco
        AND OLD.tipo_cliente IS NOT DISTINCT FROM NEW.tipo_cliente)
    THEN
      -- Nenhum campo de negócio mudou → skip (provavelmente import setando monde_person_id)
      RETURN NEW;
    END IF;

    IF OLD.nome IS DISTINCT FROM NEW.nome THEN v_changed := array_append(v_changed, 'nome'); END IF;
    IF OLD.sobrenome IS DISTINCT FROM NEW.sobrenome THEN v_changed := array_append(v_changed, 'sobrenome'); END IF;
    IF OLD.email IS DISTINCT FROM NEW.email THEN v_changed := array_append(v_changed, 'email'); END IF;
    IF OLD.telefone IS DISTINCT FROM NEW.telefone THEN v_changed := array_append(v_changed, 'telefone'); END IF;
    IF OLD.cpf IS DISTINCT FROM NEW.cpf THEN v_changed := array_append(v_changed, 'cpf'); END IF;
    IF OLD.data_nascimento IS DISTINCT FROM NEW.data_nascimento THEN v_changed := array_append(v_changed, 'data_nascimento'); END IF;
    IF OLD.sexo IS DISTINCT FROM NEW.sexo THEN v_changed := array_append(v_changed, 'sexo'); END IF;
    IF OLD.passaporte IS DISTINCT FROM NEW.passaporte THEN v_changed := array_append(v_changed, 'passaporte'); END IF;
    IF OLD.passaporte_validade IS DISTINCT FROM NEW.passaporte_validade THEN v_changed := array_append(v_changed, 'passaporte_validade'); END IF;
    IF OLD.rg IS DISTINCT FROM NEW.rg THEN v_changed := array_append(v_changed, 'rg'); END IF;
    IF OLD.observacoes IS DISTINCT FROM NEW.observacoes THEN v_changed := array_append(v_changed, 'observacoes'); END IF;
    IF OLD.endereco IS DISTINCT FROM NEW.endereco THEN v_changed := array_append(v_changed, 'endereco'); END IF;
    IF OLD.tipo_cliente IS DISTINCT FROM NEW.tipo_cliente THEN v_changed := array_append(v_changed, 'tipo_cliente'); END IF;

    IF array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields)
      VALUES (NEW.id, 'updated', v_changed);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remover cron jobs com bearer vazio (foram criados com current_setting inválido)
SELECT cron.unschedule('monde-people-dispatch');
SELECT cron.unschedule('monde-people-import');
