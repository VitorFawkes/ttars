-- Add card_financial_item_id to monde_sale_items
-- Allows creating Monde sales from card_financial_items (no proposal required)

ALTER TABLE monde_sale_items
    ADD COLUMN IF NOT EXISTS card_financial_item_id UUID REFERENCES card_financial_items(id) ON DELETE SET NULL;

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_monde_sale_items_financial_item
    ON monde_sale_items(card_financial_item_id)
    WHERE card_financial_item_id IS NOT NULL;

-- Unique constraint to prevent duplicate items in the same sale
CREATE UNIQUE INDEX IF NOT EXISTS idx_monde_sale_items_unique_financial_item
    ON monde_sale_items(sale_id, card_financial_item_id)
    WHERE card_financial_item_id IS NOT NULL;
