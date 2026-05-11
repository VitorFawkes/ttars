-- Migration: Allow gift assignments without a card (historical imports)
-- card_id becomes nullable to support gifts linked only to a contact

ALTER TABLE card_gift_assignments ALTER COLUMN card_id DROP NOT NULL;

-- Recreate unique constraint to handle NULLs properly
ALTER TABLE card_gift_assignments DROP CONSTRAINT IF EXISTS card_gift_assignments_card_contato_uq;
ALTER TABLE card_gift_assignments
  ADD CONSTRAINT card_gift_assignments_card_contato_uq
  UNIQUE NULLS NOT DISTINCT (card_id, contato_id);
