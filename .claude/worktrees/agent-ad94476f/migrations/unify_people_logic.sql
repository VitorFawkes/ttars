-- Function to atomically set the primary contact of a card
-- It updates the card's pessoa_principal_id and removes that contact from cards_contatos (travelers)
-- to ensure a person is not listed as both primary and traveler simultaneously.

CREATE OR REPLACE FUNCTION set_card_primary_contact(
  p_card_id UUID,
  p_contact_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Update the card with the new primary contact
  UPDATE cards
  SET pessoa_principal_id = p_contact_id
  WHERE id = p_card_id;

  -- 2. Remove the new primary contact from the travelers list (cards_contatos)
  -- This prevents duplication (being both primary and traveler)
  DELETE FROM cards_contatos
  WHERE card_id = p_card_id
  AND contato_id = p_contact_id;

  -- Optional: We could also insert the OLD primary contact into cards_contatos here
  -- if we wanted to "demote" them instead of removing them.
  -- For now, we stick to the "Swap/Replace" logic where the old one is removed.
END;
$$;
