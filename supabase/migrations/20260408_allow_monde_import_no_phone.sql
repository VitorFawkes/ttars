-- Permite import de contatos do Monde sem telefone.
-- Antes: trigger exigia telefone para todas as origens exceto echo/integracao/trigger/whatsapp.
-- Agora: adiciona 'monde' à lista de isenções, pois muitos contatos no Monde não têm telefone cadastrado.

CREATE OR REPLACE FUNCTION check_contato_required_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Origens automáticas são isentas
    IF NEW.origem IN ('echo', 'integracao', 'trigger', 'whatsapp', 'monde') THEN
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
