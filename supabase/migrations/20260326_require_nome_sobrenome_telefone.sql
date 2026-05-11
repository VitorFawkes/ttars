-- Enforce nome, sobrenome e telefone obrigatórios para contatos criados manualmente/API.
-- Origens automáticas (echo, integracao, trigger, whatsapp) são isentas pois nem sempre têm dados completos.

CREATE OR REPLACE FUNCTION check_contato_required_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Origens automáticas são isentas
    IF NEW.origem IN ('echo', 'integracao', 'trigger', 'whatsapp') THEN
        RETURN NEW;
    END IF;

    IF NULLIF(TRIM(NEW.nome), '') IS NULL THEN
        RAISE EXCEPTION 'Nome é obrigatório para criação de contato';
    END IF;

    IF NULLIF(TRIM(COALESCE(NEW.sobrenome, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Sobrenome é obrigatório para criação de contato';
    END IF;

    IF NULLIF(TRIM(COALESCE(NEW.telefone, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Telefone é obrigatório para criação de contato';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Só dispara em INSERT (criação), não em UPDATE (edição)
DROP TRIGGER IF EXISTS trg_check_contato_required ON contatos;
CREATE TRIGGER trg_check_contato_required
    BEFORE INSERT ON contatos
    FOR EACH ROW
    EXECUTE FUNCTION check_contato_required_fields();
