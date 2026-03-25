-- ============================================================
-- Sistema de Presentes & Estoque
-- 4 tabelas: inventory_products, inventory_movements,
--            card_gift_assignments, card_gift_items
-- 1 trigger: auto-atualiza current_stock
-- 1 bucket: inventory-images
-- Seed: 10 produtos da planilha de estoque atual
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. inventory_products (catálogo de produtos)
-- FK → profiles (Three Suns ✓)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'geral',
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  image_path TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_products_sku ON inventory_products(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_products_category ON inventory_products(category);
CREATE INDEX IF NOT EXISTS idx_inventory_products_active ON inventory_products(active);

-- RLS
ALTER TABLE inventory_products ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_products' AND policyname = 'ip_select') THEN
    CREATE POLICY ip_select ON inventory_products FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_products' AND policyname = 'ip_insert') THEN
    CREATE POLICY ip_insert ON inventory_products FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_products' AND policyname = 'ip_update') THEN
    CREATE POLICY ip_update ON inventory_products FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_products' AND policyname = 'ip_delete') THEN
    CREATE POLICY ip_delete ON inventory_products FOR DELETE USING (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. inventory_movements (log de entrada/saída)
-- FK → profiles, inventory_products
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('entrada', 'saida_gift', 'ajuste', 'devolucao')),
  reason TEXT,
  reference_id UUID,
  performed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created ON inventory_movements(created_at DESC);

-- RLS
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_movements' AND policyname = 'im_select') THEN
    CREATE POLICY im_select ON inventory_movements FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_movements' AND policyname = 'im_insert') THEN
    CREATE POLICY im_insert ON inventory_movements FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_movements' AND policyname = 'im_update') THEN
    CREATE POLICY im_update ON inventory_movements FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory_movements' AND policyname = 'im_delete') THEN
    CREATE POLICY im_delete ON inventory_movements FOR DELETE USING (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. card_gift_assignments (pacote de presentes por card — 1:1)
-- FK → cards, profiles (Three Suns ✓)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS card_gift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'preparando', 'enviado', 'entregue', 'cancelado')),
  delivery_address TEXT,
  delivery_date DATE,
  delivery_method TEXT,
  budget DECIMAL(10,2),
  notes TEXT,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  shipped_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_card_gift_assignments_card ON card_gift_assignments(card_id);
CREATE INDEX IF NOT EXISTS idx_card_gift_assignments_status ON card_gift_assignments(status);

-- RLS
ALTER TABLE card_gift_assignments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_gift_assignments' AND policyname = 'cga_select') THEN
    CREATE POLICY cga_select ON card_gift_assignments FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_gift_assignments' AND policyname = 'cga_insert') THEN
    CREATE POLICY cga_insert ON card_gift_assignments FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_gift_assignments' AND policyname = 'cga_update') THEN
    CREATE POLICY cga_update ON card_gift_assignments FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_gift_assignments' AND policyname = 'cga_delete') THEN
    CREATE POLICY cga_delete ON card_gift_assignments FOR DELETE USING (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. card_gift_items (itens do pacote)
-- FK → card_gift_assignments (CASCADE), inventory_products (RESTRICT)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS card_gift_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES card_gift_assignments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_snapshot DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_gift_items_assignment ON card_gift_items(assignment_id);
CREATE INDEX IF NOT EXISTS idx_card_gift_items_product ON card_gift_items(product_id);

-- RLS
ALTER TABLE card_gift_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_gift_items' AND policyname = 'cgi_select') THEN
    CREATE POLICY cgi_select ON card_gift_items FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_gift_items' AND policyname = 'cgi_insert') THEN
    CREATE POLICY cgi_insert ON card_gift_items FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_gift_items' AND policyname = 'cgi_update') THEN
    CREATE POLICY cgi_update ON card_gift_items FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'card_gift_items' AND policyname = 'cgi_delete') THEN
    CREATE POLICY cgi_delete ON card_gift_items FOR DELETE USING (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. Trigger: auto-atualiza current_stock em inventory_products
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_inventory_stock()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE inventory_products
  SET current_stock = current_stock + NEW.quantity,
      updated_at = now()
  WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_inventory_stock ON inventory_movements;
CREATE TRIGGER trg_update_inventory_stock
  AFTER INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION update_inventory_stock();

-- ────────────────────────────────────────────────────────────
-- 6. Storage bucket: inventory-images (público, 5MB, imagens)
-- ────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('inventory-images', 'inventory-images', true, 5242880,
  ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'inventory-images-select') THEN
    CREATE POLICY "inventory-images-select" ON storage.objects FOR SELECT USING (bucket_id = 'inventory-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'inventory-images-insert') THEN
    CREATE POLICY "inventory-images-insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'inventory-images');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'inventory-images-delete') THEN
    CREATE POLICY "inventory-images-delete" ON storage.objects FOR DELETE USING (bucket_id = 'inventory-images');
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 7. Seção "Presentes" no card (todos os produtos)
-- ────────────────────────────────────────────────────────────
INSERT INTO sections (key, label, icon, color, position, order_index, is_system, is_governable, active, widget_component)
VALUES ('gifts', 'Presentes', 'gift', 'bg-pink-50 text-pink-700 border-pink-100', 'left_column', 17, true, false, true, 'gifts')
ON CONFLICT (key) DO UPDATE SET
  widget_component = EXCLUDED.widget_component,
  active = true;

-- ────────────────────────────────────────────────────────────
-- 8. Seed: produtos da planilha de estoque atual
-- ────────────────────────────────────────────────────────────
INSERT INTO inventory_products (name, sku, category, unit_price, current_stock) VALUES
  ('SmartTag', 'SMARTTAG', 'tecnologia', 0, 58),
  ('Tag Bagagem', 'TAG-BAGAGEM', 'viagem', 0, 45),
  ('Porta Documento', 'PORTA-DOC', 'viagem', 0, 27),
  ('Organizador Bagagem', 'ORG-BAGAGEM', 'viagem', 0, 22),
  ('Garrafa Menino', 'GARRAFA-M', 'infantil', 0, 8),
  ('Garrafa Menina', 'GARRAFA-F', 'infantil', 0, 3),
  ('Pochete', 'POCHETE', 'acessorio', 0, 0),
  ('Garrafa Welcome', 'GARRAFA-WELCOME', 'brinde', 0, 0),
  ('Capa de Mala', 'CAPA-MALA', 'viagem', 0, 6),
  ('Cordão Crachá', 'CORDAO-CRACHA', 'acessorio', 0, 0)
ON CONFLICT (sku) DO NOTHING;

COMMIT;
