-- Permitir itens customizados (fora do estoque) nos presentes
-- product_id nullable + campo custom_name para itens avulsos

BEGIN;

-- Tornar product_id nullable para itens customizados
ALTER TABLE card_gift_items ALTER COLUMN product_id DROP NOT NULL;

-- Campo para nome do item quando não vem do estoque
ALTER TABLE card_gift_items ADD COLUMN IF NOT EXISTS custom_name TEXT;

-- Observação por item (planner → pós-venda)
ALTER TABLE card_gift_items ADD COLUMN IF NOT EXISTS notes TEXT;

COMMIT;
