-- Migration: Suporte a presentes premium (sem viagem) + índices para hub de presentes
-- Backward-compatible: todos os registros existentes ficam com gift_type='trip'

-- 1. Tipo de presente (trip = vinculado a card, premium = avulso para cliente)
ALTER TABLE card_gift_assignments
  ADD COLUMN IF NOT EXISTS gift_type TEXT NOT NULL DEFAULT 'trip'
    CHECK (gift_type IN ('trip', 'premium'));

-- 2. Ocasião/motivo do presente (texto livre para flexibilidade)
ALTER TABLE card_gift_assignments
  ADD COLUMN IF NOT EXISTS occasion TEXT;

-- 3. Garantir que contato_id existe
ALTER TABLE card_gift_assignments
  ADD COLUMN IF NOT EXISTS contato_id UUID;

-- 4. Garantir que scheduled_ship_date existe
ALTER TABLE card_gift_assignments
  ADD COLUMN IF NOT EXISTS scheduled_ship_date DATE;

-- 5. Garantir que status existe
ALTER TABLE card_gift_assignments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente';

-- 6. Relaxar constraint única para permitir múltiplos presentes premium por contato
ALTER TABLE card_gift_assignments
  DROP CONSTRAINT IF EXISTS card_gift_assignments_card_contato_uq;
DROP INDEX IF EXISTS idx_card_gift_assignments_card;

-- Manter unicidade apenas para trip gifts (1 presente por contato por card)
CREATE UNIQUE INDEX IF NOT EXISTS idx_gift_assignments_card_contato_uq
  ON card_gift_assignments(card_id, contato_id) WHERE card_id IS NOT NULL;

-- 7. Índices para queries do hub
CREATE INDEX IF NOT EXISTS idx_gift_assignments_type
  ON card_gift_assignments(gift_type);

CREATE INDEX IF NOT EXISTS idx_gift_assignments_occasion
  ON card_gift_assignments(occasion) WHERE occasion IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gift_assignments_status
  ON card_gift_assignments(status);

CREATE INDEX IF NOT EXISTS idx_gift_assignments_ship_date
  ON card_gift_assignments(scheduled_ship_date) WHERE scheduled_ship_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gift_assignments_contato
  ON card_gift_assignments(contato_id);
