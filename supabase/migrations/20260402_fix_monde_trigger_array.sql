-- Fix: usar array_append() em vez de || para evitar "malformed array literal"
-- O operador || é ambíguo quando o array está vazio e o text parece um array literal

CREATE OR REPLACE FUNCTION public.log_monde_people_event()
RETURNS trigger AS $$
DECLARE
  v_sync_source TEXT;
  v_changed TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Anti-loop: skip se a origem é o import do Monde
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
    IF NEW.nome IS NULL OR trim(NEW.nome) = '' THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields)
    VALUES (NEW.id, 'created', NULL);

  ELSIF TG_OP = 'UPDATE' THEN
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

    -- Só enfileira se algo relevante mudou
    IF array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields)
      VALUES (NEW.id, 'updated', v_changed);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
