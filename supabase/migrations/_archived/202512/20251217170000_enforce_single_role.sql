-- Enforce Single Role Rule: A contact cannot be both Main Contact and Companion for the same card.

-- 1. Trigger on cards_contatos (Before Insert/Update)
-- Prevents adding a companion if they are already the Main Contact.
CREATE OR REPLACE FUNCTION check_single_role_cards_contatos()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM cards
        WHERE id = NEW.card_id
        AND pessoa_principal_id = NEW.contato_id
    ) THEN
        RAISE EXCEPTION 'Contact % cannot be a companion because they are already the Main Contact for card %.', NEW.contato_id, NEW.card_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_single_role_cards_contatos ON cards_contatos;
CREATE TRIGGER enforce_single_role_cards_contatos
    BEFORE INSERT OR UPDATE ON cards_contatos
    FOR EACH ROW
    EXECUTE FUNCTION check_single_role_cards_contatos();


-- 2. Trigger on cards (Before Update)
-- Automatically removes the contact from cards_contatos if they become the Main Contact.
CREATE OR REPLACE FUNCTION cleanup_single_role_cards()
RETURNS TRIGGER AS $$
BEGIN
    -- If main contact is changing
    IF NEW.pessoa_principal_id IS DISTINCT FROM OLD.pessoa_principal_id AND NEW.pessoa_principal_id IS NOT NULL THEN
        -- Remove from companions if exists
        DELETE FROM cards_contatos
        WHERE card_id = NEW.id
        AND contato_id = NEW.pessoa_principal_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_single_role_cards ON cards;
CREATE TRIGGER enforce_single_role_cards
    BEFORE UPDATE ON cards
    FOR EACH ROW
    EXECUTE FUNCTION cleanup_single_role_cards();
