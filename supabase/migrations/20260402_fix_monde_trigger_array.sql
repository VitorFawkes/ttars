-- Fix: cast explícito TEXT[] para evitar "malformed array literal"
-- O PostgreSQL interpreta 'nome'::text || ARRAY[]::text[] de forma ambígua

CREATE OR REPLACE FUNCTION public.log_monde_people_event()
RETURNS trigger AS $$
DECLARE
  v_changed TEXT[];
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
    -- é o import linkando o contato → NÃO enfileirar
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
      RETURN NEW;
    END IF;

    -- Construir array de campos mudados via SELECT INTO (evita ambiguidade do ||)
    SELECT ARRAY(
      SELECT unnest FROM unnest(ARRAY[
        CASE WHEN OLD.nome IS DISTINCT FROM NEW.nome THEN 'nome'::text END,
        CASE WHEN OLD.sobrenome IS DISTINCT FROM NEW.sobrenome THEN 'sobrenome'::text END,
        CASE WHEN OLD.email IS DISTINCT FROM NEW.email THEN 'email'::text END,
        CASE WHEN OLD.telefone IS DISTINCT FROM NEW.telefone THEN 'telefone'::text END,
        CASE WHEN OLD.cpf IS DISTINCT FROM NEW.cpf THEN 'cpf'::text END,
        CASE WHEN OLD.data_nascimento IS DISTINCT FROM NEW.data_nascimento THEN 'data_nascimento'::text END,
        CASE WHEN OLD.sexo IS DISTINCT FROM NEW.sexo THEN 'sexo'::text END,
        CASE WHEN OLD.passaporte IS DISTINCT FROM NEW.passaporte THEN 'passaporte'::text END,
        CASE WHEN OLD.passaporte_validade IS DISTINCT FROM NEW.passaporte_validade THEN 'passaporte_validade'::text END,
        CASE WHEN OLD.rg IS DISTINCT FROM NEW.rg THEN 'rg'::text END,
        CASE WHEN OLD.observacoes IS DISTINCT FROM NEW.observacoes THEN 'observacoes'::text END,
        CASE WHEN OLD.endereco IS DISTINCT FROM NEW.endereco THEN 'endereco'::text END,
        CASE WHEN OLD.tipo_cliente IS DISTINCT FROM NEW.tipo_cliente THEN 'tipo_cliente'::text END
      ]) WHERE unnest IS NOT NULL
    ) INTO v_changed;

    IF array_length(v_changed, 1) > 0 THEN
      INSERT INTO public.monde_people_queue (contato_id, event_type, changed_fields)
      VALUES (NEW.id, 'updated', v_changed);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
