-- ============================================================
-- H3 Shared Pool — Parent Org Fallback para tabelas "global"
--
-- Tabelas da H3-019 que devem ser lidas como pool compartilhado
-- entre orgs filhas (Welcome Trips + Welcome Weddings) herdam o
-- padrão de `contatos`: RLS permite org ativa OR parent_org.
--
-- Afetadas:
--   - document_types (Passaporte, RG, CPF, Vouchers, etc.)
--   - monde_import_logs
--   - contratos
--   - monde_sales
--   - n8n_ai_extraction_queue
--
-- Regra: `(org_id = requesting_org_id()) OR
--         (org_id = (SELECT parent_org_id FROM organizations
--                   WHERE id = requesting_org_id()))`
--
-- OBS: `inventory_products` e `inventory_movements` NÃO estão aqui —
-- foram MOVIDOS para Welcome Trips em 20260414_fix_gifts_inventory_org_isolation
-- porque gifts é exclusivo de TRIPS (não compartilhado com Weddings).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. document_types — SELECT/INSERT/UPDATE/DELETE com fallback
--    Write admin-only (mantém a semântica da H3-019 original)
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='document_types') THEN

    DROP POLICY IF EXISTS document_types_org_select ON document_types;
    DROP POLICY IF EXISTS document_types_org_admin_all ON document_types;
    DROP POLICY IF EXISTS document_types_service_all ON document_types;

    CREATE POLICY document_types_org_select ON document_types
      FOR SELECT TO authenticated USING (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      );

    CREATE POLICY document_types_org_admin_all ON document_types
      FOR ALL TO authenticated
      USING (
        (org_id = requesting_org_id()
         OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id()))
        AND EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid()
            AND org_id = requesting_org_id()
            AND (is_admin = TRUE OR role = 'admin')
        )
      )
      WITH CHECK (
        (org_id = requesting_org_id()
         OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id()))
        AND EXISTS (
          SELECT 1 FROM profiles
          WHERE id = auth.uid()
            AND org_id = requesting_org_id()
            AND (is_admin = TRUE OR role = 'admin')
        )
      );

    CREATE POLICY document_types_service_all ON document_types
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2. monde_import_logs — todos os roles podem CRUD com fallback
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='monde_import_logs') THEN

    DROP POLICY IF EXISTS monde_import_logs_org_select ON monde_import_logs;
    DROP POLICY IF EXISTS monde_import_logs_org_all ON monde_import_logs;
    DROP POLICY IF EXISTS monde_import_logs_service_all ON monde_import_logs;

    CREATE POLICY monde_import_logs_org_select ON monde_import_logs
      FOR SELECT TO authenticated USING (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      );

    CREATE POLICY monde_import_logs_org_all ON monde_import_logs
      FOR ALL TO authenticated
      USING (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      )
      WITH CHECK (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      );

    CREATE POLICY monde_import_logs_service_all ON monde_import_logs
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3. contratos
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='contratos') THEN

    DROP POLICY IF EXISTS contratos_org_select ON contratos;
    DROP POLICY IF EXISTS contratos_org_all ON contratos;
    DROP POLICY IF EXISTS contratos_service_all ON contratos;

    CREATE POLICY contratos_org_select ON contratos
      FOR SELECT TO authenticated USING (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      );

    CREATE POLICY contratos_org_all ON contratos
      FOR ALL TO authenticated
      USING (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      )
      WITH CHECK (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      );

    CREATE POLICY contratos_service_all ON contratos
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4. monde_sales
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='monde_sales') THEN

    DROP POLICY IF EXISTS monde_sales_org_select ON monde_sales;
    DROP POLICY IF EXISTS monde_sales_org_all ON monde_sales;
    DROP POLICY IF EXISTS monde_sales_service_all ON monde_sales;

    CREATE POLICY monde_sales_org_select ON monde_sales
      FOR SELECT TO authenticated USING (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      );

    CREATE POLICY monde_sales_org_all ON monde_sales
      FOR ALL TO authenticated
      USING (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      )
      WITH CHECK (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      );

    CREATE POLICY monde_sales_service_all ON monde_sales
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 5. n8n_ai_extraction_queue
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='n8n_ai_extraction_queue') THEN

    DROP POLICY IF EXISTS n8n_ai_queue_org_select ON n8n_ai_extraction_queue;
    DROP POLICY IF EXISTS n8n_ai_queue_org_all ON n8n_ai_extraction_queue;
    DROP POLICY IF EXISTS n8n_ai_queue_service_all ON n8n_ai_extraction_queue;

    CREATE POLICY n8n_ai_queue_org_select ON n8n_ai_extraction_queue
      FOR SELECT TO authenticated USING (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      );

    CREATE POLICY n8n_ai_queue_org_all ON n8n_ai_extraction_queue
      FOR ALL TO authenticated
      USING (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      )
      WITH CHECK (
        org_id = requesting_org_id()
        OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id())
      );

    CREATE POLICY n8n_ai_queue_service_all ON n8n_ai_extraction_queue
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
