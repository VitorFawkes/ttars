-- Fix: set_card_primary_contact quebrada por search_path = ''
-- Root cause: migration 20260128 aplicou search_path='' mas corpo referencia 'cards' sem prefixo public.
-- Resultado: "relation 'cards' does not exist" ao trocar contato principal em card existente

CREATE OR REPLACE FUNCTION public.set_card_primary_contact(p_card_id uuid, p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.cards
    SET pessoa_principal_id = p_contact_id
    WHERE id = p_card_id;
END;
$$;
