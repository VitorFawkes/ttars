-- ============================================================
-- Fix: Policies remanescentes com padrão quebrado pós-Org Split
--
-- Causa raiz (mesma do fix do estoque em 20260422):
--   Policies criadas antes do Org Split comparam
--   profiles.org_id = requesting_org_id() dentro de EXISTS.
--   Pós-split, profiles.org_id aponta para a ACCOUNT (a0000000)
--   e requesting_org_id() retorna o WORKSPACE (b0000000). A
--   subquery nunca retorna linha → escrita/leitura bloqueadas
--   até mesmo para admins.
--
-- Solução:
--   Substituir o subquery inline pelo helper `public.is_admin()`,
--   que já foi corrigido para reconhecer admin via org_members
--   além do profile.org_id legado.
--
-- Idempotente: cada bloco é guardado por IF EXISTS para funcionar
-- tanto em staging (defasado) quanto em produção.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- configuracao_taxa_trips
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='configuracao_taxa_trips') THEN
    EXECUTE $sql$
      DROP POLICY IF EXISTS "configuracao_taxa_trips_org_admin_all" ON configuracao_taxa_trips;
      CREATE POLICY "configuracao_taxa_trips_org_admin_all" ON configuracao_taxa_trips
        FOR ALL TO authenticated
        USING (org_id = requesting_org_id() AND is_admin())
        WITH CHECK (org_id = requesting_org_id() AND is_admin());
    $sql$;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- document_types (mantém capacidade de ler/escrever na parent org)
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='document_types') THEN
    EXECUTE $sql$
      DROP POLICY IF EXISTS "document_types_org_admin_all" ON document_types;
      CREATE POLICY "document_types_org_admin_all" ON document_types
        FOR ALL TO authenticated
        USING (
          (org_id = requesting_org_id()
           OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id()))
          AND is_admin()
        )
        WITH CHECK (
          (org_id = requesting_org_id()
           OR org_id = (SELECT parent_org_id FROM organizations WHERE id = requesting_org_id()))
          AND is_admin()
        );
    $sql$;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- email_log
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='email_log') THEN
    EXECUTE $sql$
      DROP POLICY IF EXISTS "email_log_org_select" ON email_log;
      CREATE POLICY "email_log_org_select" ON email_log
        FOR SELECT TO authenticated
        USING (org_id = requesting_org_id() AND is_admin());
    $sql$;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- email_templates
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='email_templates') THEN
    EXECUTE $sql$
      DROP POLICY IF EXISTS "email_templates_org_admin_all" ON email_templates;
      CREATE POLICY "email_templates_org_admin_all" ON email_templates
        FOR ALL TO authenticated
        USING (org_id = requesting_org_id() AND is_admin())
        WITH CHECK (org_id = requesting_org_id() AND is_admin());
    $sql$;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- terms_acceptance (admin lê de todos; usuário lê o próprio via self_read)
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='terms_acceptance') THEN
    EXECUTE $sql$
      DROP POLICY IF EXISTS "terms_acceptance_admin_read" ON terms_acceptance;
      CREATE POLICY "terms_acceptance_admin_read" ON terms_acceptance
        FOR SELECT TO authenticated
        USING (org_id = requesting_org_id() AND is_admin());
    $sql$;
  END IF;
END $$;

COMMIT;
