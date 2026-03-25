-- Migration: Gift assignments per contact + shipping date + task link
-- Transforms gifts from 1:1 per card to 1:1 per card+contact

-- 1. Add new columns
ALTER TABLE card_gift_assignments
  ADD COLUMN IF NOT EXISTS contato_id UUID REFERENCES contatos(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scheduled_ship_date DATE,
  ADD COLUMN IF NOT EXISTS tarefa_id UUID REFERENCES tarefas(id) ON DELETE SET NULL;

-- 2. Backfill: existing assignments get the card's primary contact
UPDATE card_gift_assignments ga
SET contato_id = c.pessoa_principal_id
FROM cards c
WHERE ga.card_id = c.id
  AND ga.contato_id IS NULL
  AND c.pessoa_principal_id IS NOT NULL;

-- 3. Drop old unique constraint/index on card_id alone
ALTER TABLE card_gift_assignments DROP CONSTRAINT IF EXISTS card_gift_assignments_card_id_key;
DROP INDEX IF EXISTS idx_card_gift_assignments_card;

-- 4. Add new unique constraint (card + contact)
ALTER TABLE card_gift_assignments
  ADD CONSTRAINT card_gift_assignments_card_contato_uq UNIQUE (card_id, contato_id);

-- 5. Index for contact lookups (people page gift history)
CREATE INDEX IF NOT EXISTS idx_gift_assignments_contato ON card_gift_assignments(contato_id);

-- 6. Index for scheduled ship date (task queries)
CREATE INDEX IF NOT EXISTS idx_gift_assignments_ship_date ON card_gift_assignments(scheduled_ship_date)
  WHERE scheduled_ship_date IS NOT NULL;

-- 7. Add envio_presente task type outcomes
INSERT INTO task_type_outcomes (tipo, outcome_key, outcome_label, ordem, is_success) VALUES
  ('envio_presente', 'enviado', 'Enviado', 1, true),
  ('envio_presente', 'nao_enviado', 'Não Enviado', 2, false),
  ('envio_presente', 'cancelado', 'Cancelado', 3, false)
ON CONFLICT DO NOTHING;
