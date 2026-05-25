-- Adiciona foto opcional para itens custom (avulsos) de presentes.
-- Itens com product_id continuam usando inventory_products.image_path automaticamente.
-- Reutiliza bucket 'inventory-images' com convenção de path 'custom/<uuid>.<ext>'.
-- RLS: card_gift_items_org_all já cobre FOR ALL (INSERT/UPDATE/SELECT/DELETE).

BEGIN;

ALTER TABLE card_gift_items
  ADD COLUMN IF NOT EXISTS custom_image_path TEXT;

COMMENT ON COLUMN card_gift_items.custom_image_path IS
  'Caminho no bucket inventory-images (prefixo custom/) para foto de item avulso (product_id IS NULL). NULL quando item vem do estoque ou quando custom sem foto.';

COMMIT;
