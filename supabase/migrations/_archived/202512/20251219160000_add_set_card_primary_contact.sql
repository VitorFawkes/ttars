-- Create the RPC function to set the primary contact for a card
-- This function relies on the existing triggers to handle the cleanup of the old primary and the removal of the new primary from the travelers list.

CREATE OR REPLACE FUNCTION set_card_primary_contact(p_card_id uuid, p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE cards
    SET pessoa_principal_id = p_contact_id
    WHERE id = p_card_id;
END;
$$;
