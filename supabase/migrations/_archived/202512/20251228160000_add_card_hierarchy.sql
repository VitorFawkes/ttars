-- Add hierarchy columns to cards table
ALTER TABLE cards 
ADD COLUMN IF NOT EXISTS parent_card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_group_parent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS group_capacity INTEGER,
ADD COLUMN IF NOT EXISTS group_total_revenue NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS group_total_pax INTEGER DEFAULT 0;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_cards_parent_card_id ON cards(parent_card_id);

-- Function to calculate totals
CREATE OR REPLACE FUNCTION calculate_group_totals()
RETURNS TRIGGER AS $$
DECLARE
    target_parent_id UUID;
BEGIN
    -- Determine which parent to update
    IF (TG_OP = 'DELETE') THEN
        target_parent_id := OLD.parent_card_id;
    ELSE
        target_parent_id := NEW.parent_card_id;
    END IF;

    -- If there is a parent, update its totals
    IF target_parent_id IS NOT NULL THEN
        UPDATE cards
        SET 
            group_total_revenue = (
                SELECT COALESCE(SUM(valor_final), 0)
                FROM cards
                WHERE parent_card_id = target_parent_id
            ),
            group_total_pax = (
                -- Sum of pax from all child cards. 
                -- We assume 'cards_contatos' counts or a specific field. 
                -- For now, let's count the number of linked contacts in child cards.
                SELECT COUNT(cc.id)
                FROM cards c
                JOIN cards_contatos cc ON c.id = cc.card_id
                WHERE c.parent_card_id = target_parent_id
            )
        WHERE id = target_parent_id;
    END IF;

    -- Handle case where a card is moved FROM a parent (UPDATE only)
    IF (TG_OP = 'UPDATE' AND OLD.parent_card_id IS NOT NULL AND OLD.parent_card_id IS DISTINCT FROM NEW.parent_card_id) THEN
        UPDATE cards
        SET 
            group_total_revenue = (
                SELECT COALESCE(SUM(valor_final), 0)
                FROM cards
                WHERE parent_card_id = OLD.parent_card_id
            ),
            group_total_pax = (
                SELECT COUNT(cc.id)
                FROM cards c
                JOIN cards_contatos cc ON c.id = cc.card_id
                WHERE c.parent_card_id = OLD.parent_card_id
            )
        WHERE id = OLD.parent_card_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for Card changes (Revenue)
DROP TRIGGER IF EXISTS trg_update_group_totals_cards ON cards;
CREATE TRIGGER trg_update_group_totals_cards
AFTER INSERT OR UPDATE OF parent_card_id, valor_final OR DELETE ON cards
FOR EACH ROW EXECUTE FUNCTION calculate_group_totals();

-- Function to handle contact changes (Pax count)
CREATE OR REPLACE FUNCTION calculate_group_totals_from_contacts()
RETURNS TRIGGER AS $$
DECLARE
    target_card_id UUID;
    target_parent_id UUID;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        target_card_id := OLD.card_id;
    ELSE
        target_card_id := NEW.card_id;
    END IF;

    -- Get the parent of the card that had contacts changed
    SELECT parent_card_id INTO target_parent_id FROM cards WHERE id = target_card_id;

    -- If the card has a parent, update the parent's totals
    IF target_parent_id IS NOT NULL THEN
        UPDATE cards
        SET 
            group_total_revenue = (
                SELECT COALESCE(SUM(valor_final), 0)
                FROM cards
                WHERE parent_card_id = target_parent_id
            ),
            group_total_pax = (
                SELECT COUNT(cc.id)
                FROM cards c
                JOIN cards_contatos cc ON c.id = cc.card_id
                WHERE c.parent_card_id = target_parent_id
            )
        WHERE id = target_parent_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for Contact changes (Pax)
DROP TRIGGER IF EXISTS trg_update_group_totals_contacts ON cards_contatos;
CREATE TRIGGER trg_update_group_totals_contacts
AFTER INSERT OR UPDATE OR DELETE ON cards_contatos
FOR EACH ROW EXECUTE FUNCTION calculate_group_totals_from_contacts();
