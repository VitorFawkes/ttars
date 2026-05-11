-- Fix: adicionar 'importacao' às origens isentas do trigger de campos obrigatórios
-- Import pós-venda (Monde CSV) não tem telefone dos contatos

CREATE OR REPLACE FUNCTION check_contato_required_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Origens automáticas/bulk são isentas
    IF NEW.origem IN ('echo', 'integracao', 'trigger', 'whatsapp', 'importacao') THEN
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
