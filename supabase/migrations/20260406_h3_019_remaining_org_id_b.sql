-- H3-019: Adicionar org_id às tabelas restantes sem isolamento de tenant
-- Tabelas: contratos, document_types, inventory_products, inventory_movements,
--          monde_import_logs, monde_sales, n8n_ai_extraction_queue
--
-- Estratégia por tabela:
--   - Guard com IF EXISTS para cada tabela (seguro em staging sem todas as tabelas)
--   - Backfill via FK existente (card_id→cards.org_id, created_by→profiles.org_id)
--   - Fallback para Welcome Group em registros orphans
--   - SET NOT NULL + DEFAULT requesting_org_id()
--   - DROP políticas permissivas antigas + CREATE políticas org-scoped
--
-- Rollback de emergência: ALTER TABLE {t} DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 1. CONTRATOS — tem card_id
-- =============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contratos') THEN

    -- Adicionar coluna
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'contratos' AND column_name = 'org_id') THEN
      ALTER TABLE contratos ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;

    -- Backfill via card_id
    UPDATE contratos c SET org_id = cards.org_id FROM cards WHERE c.card_id = cards.id AND c.org_id IS NULL;

    -- Fallback Welcome Group
    UPDATE contratos SET org_id = 'a0000000-0000-0000-0000-000000000001'::UUID WHERE org_id IS NULL;

    -- NOT NULL + DEFAULT
    ALTER TABLE contratos ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE contratos ALTER COLUMN org_id SET DEFAULT requesting_org_id();

    -- Índice
    CREATE INDEX IF NOT EXISTS idx_contratos_org_id ON contratos(org_id);

    -- Drop políticas antigas
    DROP POLICY IF EXISTS "Contratos access" ON contratos;
    DROP POLICY IF EXISTS "Contratos viewable by authenticated" ON contratos;
    DROP POLICY IF EXISTS "contratos_org_select" ON contratos;
    DROP POLICY IF EXISTS "contratos_org_all" ON contratos;
    DROP POLICY IF EXISTS "contratos_service_all" ON contratos;

    -- Novas políticas org-scoped
    CREATE POLICY "contratos_org_select" ON contratos
      FOR SELECT TO authenticated USING (org_id = requesting_org_id());

    CREATE POLICY "contratos_org_all" ON contratos
      FOR ALL TO authenticated
      USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());

    CREATE POLICY "contratos_service_all" ON contratos
      FOR ALL TO service_role USING (true) WITH CHECK (true);

    RAISE NOTICE 'contratos: org_id adicionado e RLS atualizado';
  ELSE
    RAISE NOTICE 'contratos: tabela não existe neste ambiente, pulando';
  END IF;
END $$;

-- =============================================================================
-- 2. DOCUMENT_TYPES — tabela de referência
-- =============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_types') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'document_types' AND column_name = 'org_id') THEN
      ALTER TABLE document_types ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;

    UPDATE document_types SET org_id = 'a0000000-0000-0000-0000-000000000001'::UUID WHERE org_id IS NULL;

    ALTER TABLE document_types ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE document_types ALTER COLUMN org_id SET DEFAULT requesting_org_id();

    CREATE INDEX IF NOT EXISTS idx_document_types_org_id ON document_types(org_id);

    DROP POLICY IF EXISTS "dt_select" ON document_types;
    DROP POLICY IF EXISTS "dt_insert" ON document_types;
    DROP POLICY IF EXISTS "dt_update" ON document_types;
    DROP POLICY IF EXISTS "dt_delete" ON document_types;
    DROP POLICY IF EXISTS "document_types_org_select" ON document_types;
    DROP POLICY IF EXISTS "document_types_org_admin_all" ON document_types;
    DROP POLICY IF EXISTS "document_types_service_all" ON document_types;

    CREATE POLICY "document_types_org_select" ON document_types
      FOR SELECT TO authenticated USING (org_id = requesting_org_id());

    CREATE POLICY "document_types_org_admin_all" ON document_types
      FOR ALL TO authenticated
      USING (org_id = requesting_org_id() AND EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND org_id = requesting_org_id() AND (is_admin = TRUE OR role = 'admin')
      ));

    CREATE POLICY "document_types_service_all" ON document_types
      FOR ALL TO service_role USING (true) WITH CHECK (true);

    RAISE NOTICE 'document_types: org_id adicionado e RLS atualizado';
  ELSE
    RAISE NOTICE 'document_types: tabela não existe neste ambiente, pulando';
  END IF;
END $$;

-- =============================================================================
-- 3. INVENTORY_PRODUCTS — standalone
-- =============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_products') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_products' AND column_name = 'org_id') THEN
      ALTER TABLE inventory_products ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;

    UPDATE inventory_products SET org_id = 'a0000000-0000-0000-0000-000000000001'::UUID WHERE org_id IS NULL;

    ALTER TABLE inventory_products ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE inventory_products ALTER COLUMN org_id SET DEFAULT requesting_org_id();

    CREATE INDEX IF NOT EXISTS idx_inventory_products_org_id ON inventory_products(org_id);

    DROP POLICY IF EXISTS "ip_select" ON inventory_products;
    DROP POLICY IF EXISTS "ip_insert" ON inventory_products;
    DROP POLICY IF EXISTS "ip_update" ON inventory_products;
    DROP POLICY IF EXISTS "ip_delete" ON inventory_products;
    DROP POLICY IF EXISTS "inventory_products_org_select" ON inventory_products;
    DROP POLICY IF EXISTS "inventory_products_org_admin_all" ON inventory_products;
    DROP POLICY IF EXISTS "inventory_products_service_all" ON inventory_products;

    CREATE POLICY "inventory_products_org_select" ON inventory_products
      FOR SELECT TO authenticated USING (org_id = requesting_org_id());

    CREATE POLICY "inventory_products_org_admin_all" ON inventory_products
      FOR ALL TO authenticated
      USING (org_id = requesting_org_id() AND EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND org_id = requesting_org_id() AND (is_admin = TRUE OR role = 'admin')
      ));

    CREATE POLICY "inventory_products_service_all" ON inventory_products
      FOR ALL TO service_role USING (true) WITH CHECK (true);

    RAISE NOTICE 'inventory_products: org_id adicionado e RLS atualizado';
  ELSE
    RAISE NOTICE 'inventory_products: tabela não existe neste ambiente, pulando';
  END IF;
END $$;

-- =============================================================================
-- 4. INVENTORY_MOVEMENTS — tem product_id → inventory_products
-- =============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory_movements') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_movements' AND column_name = 'org_id') THEN
      ALTER TABLE inventory_movements ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;

    -- Backfill via product_id → inventory_products.org_id (inventory_products acabou de receber org_id)
    UPDATE inventory_movements im
    SET org_id = ip.org_id
    FROM inventory_products ip
    WHERE im.product_id = ip.id AND im.org_id IS NULL;

    -- Fallback Welcome Group
    UPDATE inventory_movements SET org_id = 'a0000000-0000-0000-0000-000000000001'::UUID WHERE org_id IS NULL;

    ALTER TABLE inventory_movements ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE inventory_movements ALTER COLUMN org_id SET DEFAULT requesting_org_id();

    CREATE INDEX IF NOT EXISTS idx_inventory_movements_org_id ON inventory_movements(org_id);

    DROP POLICY IF EXISTS "im_select" ON inventory_movements;
    DROP POLICY IF EXISTS "im_insert" ON inventory_movements;
    DROP POLICY IF EXISTS "im_update" ON inventory_movements;
    DROP POLICY IF EXISTS "im_delete" ON inventory_movements;
    DROP POLICY IF EXISTS "inventory_movements_org_select" ON inventory_movements;
    DROP POLICY IF EXISTS "inventory_movements_org_all" ON inventory_movements;
    DROP POLICY IF EXISTS "inventory_movements_service_all" ON inventory_movements;

    CREATE POLICY "inventory_movements_org_select" ON inventory_movements
      FOR SELECT TO authenticated USING (org_id = requesting_org_id());

    CREATE POLICY "inventory_movements_org_all" ON inventory_movements
      FOR ALL TO authenticated
      USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());

    CREATE POLICY "inventory_movements_service_all" ON inventory_movements
      FOR ALL TO service_role USING (true) WITH CHECK (true);

    RAISE NOTICE 'inventory_movements: org_id adicionado e RLS atualizado';
  ELSE
    RAISE NOTICE 'inventory_movements: tabela não existe neste ambiente, pulando';
  END IF;
END $$;

-- =============================================================================
-- 5. MONDE_IMPORT_LOGS — tem created_by → profiles
-- =============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'monde_import_logs') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'monde_import_logs' AND column_name = 'org_id') THEN
      ALTER TABLE monde_import_logs ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;

    -- Backfill via created_by → profiles.org_id
    UPDATE monde_import_logs ml
    SET org_id = p.org_id
    FROM profiles p
    WHERE ml.created_by = p.id AND ml.org_id IS NULL;

    -- Fallback Welcome Group
    UPDATE monde_import_logs SET org_id = 'a0000000-0000-0000-0000-000000000001'::UUID WHERE org_id IS NULL;

    ALTER TABLE monde_import_logs ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE monde_import_logs ALTER COLUMN org_id SET DEFAULT requesting_org_id();

    CREATE INDEX IF NOT EXISTS idx_monde_import_logs_org_id ON monde_import_logs(org_id);

    DROP POLICY IF EXISTS "authenticated_read_monde_logs" ON monde_import_logs;
    DROP POLICY IF EXISTS "authenticated_insert_monde_logs" ON monde_import_logs;
    DROP POLICY IF EXISTS "monde_import_logs_org_select" ON monde_import_logs;
    DROP POLICY IF EXISTS "monde_import_logs_org_all" ON monde_import_logs;
    DROP POLICY IF EXISTS "monde_import_logs_service_all" ON monde_import_logs;

    CREATE POLICY "monde_import_logs_org_select" ON monde_import_logs
      FOR SELECT TO authenticated USING (org_id = requesting_org_id());

    CREATE POLICY "monde_import_logs_org_all" ON monde_import_logs
      FOR ALL TO authenticated
      USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());

    CREATE POLICY "monde_import_logs_service_all" ON monde_import_logs
      FOR ALL TO service_role USING (true) WITH CHECK (true);

    RAISE NOTICE 'monde_import_logs: org_id adicionado e RLS atualizado';
  ELSE
    RAISE NOTICE 'monde_import_logs: tabela não existe neste ambiente, pulando';
  END IF;
END $$;

-- =============================================================================
-- 6. MONDE_SALES — tem card_id
-- =============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'monde_sales') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'monde_sales' AND column_name = 'org_id') THEN
      ALTER TABLE monde_sales ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;

    -- Backfill via card_id → cards.org_id
    UPDATE monde_sales ms
    SET org_id = c.org_id
    FROM cards c
    WHERE ms.card_id = c.id AND ms.org_id IS NULL;

    -- Fallback Welcome Group
    UPDATE monde_sales SET org_id = 'a0000000-0000-0000-0000-000000000001'::UUID WHERE org_id IS NULL;

    ALTER TABLE monde_sales ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE monde_sales ALTER COLUMN org_id SET DEFAULT requesting_org_id();

    CREATE INDEX IF NOT EXISTS idx_monde_sales_org_id ON monde_sales(org_id);

    DROP POLICY IF EXISTS "Users can view monde_sales" ON monde_sales;
    DROP POLICY IF EXISTS "Users can insert monde_sales" ON monde_sales;
    DROP POLICY IF EXISTS "Users can update monde_sales" ON monde_sales;
    DROP POLICY IF EXISTS "monde_sales_org_select" ON monde_sales;
    DROP POLICY IF EXISTS "monde_sales_org_all" ON monde_sales;
    DROP POLICY IF EXISTS "monde_sales_service_all" ON monde_sales;

    CREATE POLICY "monde_sales_org_select" ON monde_sales
      FOR SELECT TO authenticated USING (org_id = requesting_org_id());

    CREATE POLICY "monde_sales_org_all" ON monde_sales
      FOR ALL TO authenticated
      USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());

    CREATE POLICY "monde_sales_service_all" ON monde_sales
      FOR ALL TO service_role USING (true) WITH CHECK (true);

    RAISE NOTICE 'monde_sales: org_id adicionado e RLS atualizado';
  ELSE
    RAISE NOTICE 'monde_sales: tabela não existe neste ambiente, pulando';
  END IF;
END $$;

-- =============================================================================
-- 7. N8N_AI_EXTRACTION_QUEUE — tem card_id
-- =============================================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'n8n_ai_extraction_queue') THEN

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'n8n_ai_extraction_queue' AND column_name = 'org_id') THEN
      ALTER TABLE n8n_ai_extraction_queue ADD COLUMN org_id UUID REFERENCES organizations(id);
    END IF;

    -- Backfill via card_id → cards.org_id
    UPDATE n8n_ai_extraction_queue q
    SET org_id = c.org_id
    FROM cards c
    WHERE q.card_id = c.id AND q.org_id IS NULL;

    -- Fallback Welcome Group
    UPDATE n8n_ai_extraction_queue SET org_id = 'a0000000-0000-0000-0000-000000000001'::UUID WHERE org_id IS NULL;

    ALTER TABLE n8n_ai_extraction_queue ALTER COLUMN org_id SET NOT NULL;
    ALTER TABLE n8n_ai_extraction_queue ALTER COLUMN org_id SET DEFAULT requesting_org_id();

    CREATE INDEX IF NOT EXISTS idx_n8n_ai_extraction_queue_org_id ON n8n_ai_extraction_queue(org_id);

    DROP POLICY IF EXISTS "Service role full access" ON n8n_ai_extraction_queue;
    DROP POLICY IF EXISTS "n8n_ai_queue_org_select" ON n8n_ai_extraction_queue;
    DROP POLICY IF EXISTS "n8n_ai_queue_org_all" ON n8n_ai_extraction_queue;
    DROP POLICY IF EXISTS "n8n_ai_queue_service_all" ON n8n_ai_extraction_queue;

    CREATE POLICY "n8n_ai_queue_org_select" ON n8n_ai_extraction_queue
      FOR SELECT TO authenticated USING (org_id = requesting_org_id());

    CREATE POLICY "n8n_ai_queue_org_all" ON n8n_ai_extraction_queue
      FOR ALL TO authenticated
      USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());

    CREATE POLICY "n8n_ai_queue_service_all" ON n8n_ai_extraction_queue
      FOR ALL TO service_role USING (true) WITH CHECK (true);

    RAISE NOTICE 'n8n_ai_extraction_queue: org_id adicionado e RLS atualizado';
  ELSE
    RAISE NOTICE 'n8n_ai_extraction_queue: tabela não existe neste ambiente, pulando';
  END IF;
END $$;
