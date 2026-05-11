-- ============================================================
-- Migration: Consolidate Duplicate RLS Policies
-- Data: 2026-02-01
-- Autor: Vitor (via Claude)
--
-- PROPOSITO: Consolidar policies duplicadas que fazem a mesma coisa
-- em uma unica policy. Reduz overhead de avaliacao do PostgreSQL.
--
-- RISCO: MEDIO - Mudancas em policies podem afetar acesso
-- ROLLBACK: Recriar policies individuais
-- ============================================================

-- ============================================================
-- PARTE 1: teams (3 policies SELECT -> 1)
-- Policies atuais:
-- - "Allow authenticated users to view all teams"
-- - "Read access for authenticated users"
-- - "Authenticated users can read teams"
-- Todas fazem a mesma coisa: authenticated pode ler
-- ============================================================

DROP POLICY IF EXISTS "Allow authenticated users to view all teams" ON teams;
DROP POLICY IF EXISTS "Read access for authenticated users" ON teams;
DROP POLICY IF EXISTS "Authenticated users can read teams" ON teams;

CREATE POLICY "teams_select_authenticated" ON teams
    FOR SELECT TO authenticated
    USING (true);

COMMENT ON POLICY "teams_select_authenticated" ON teams IS
    'CONSOLIDADA: Substitui 3 policies duplicadas. Authenticated users podem ler todos os teams.';

-- ============================================================
-- PARTE 2: departments (2 policies SELECT -> 1)
-- Policies atuais:
-- - "Read access for authenticated users"
-- - "Allow authenticated users to view all departments"
-- ============================================================

DROP POLICY IF EXISTS "Read access for authenticated users" ON departments;
DROP POLICY IF EXISTS "Allow authenticated users to view all departments" ON departments;

CREATE POLICY "departments_select_authenticated" ON departments
    FOR SELECT TO authenticated
    USING (true);

COMMENT ON POLICY "departments_select_authenticated" ON departments IS
    'CONSOLIDADA: Substitui 2 policies duplicadas. Authenticated users podem ler todos os departments.';

-- ============================================================
-- PARTE 3: stage_fields_settings (2 policies SELECT -> 1)
-- Policies atuais:
-- - "Everyone can read stage_fields_settings"
-- - "Anyone can read stage_fields_settings"
-- Nomes quase identicos, mesma funcao
-- ============================================================

DROP POLICY IF EXISTS "Everyone can read stage_fields_settings" ON stage_fields_settings;
DROP POLICY IF EXISTS "Anyone can read stage_fields_settings" ON stage_fields_settings;

CREATE POLICY "stage_fields_settings_select_all" ON stage_fields_settings
    FOR SELECT TO public
    USING (true);

COMMENT ON POLICY "stage_fields_settings_select_all" ON stage_fields_settings IS
    'CONSOLIDADA: Substitui 2 policies duplicadas. Todos podem ler stage_fields_settings.';

-- ============================================================
-- PARTE 4: profiles (2 policies SELECT - manter separadas)
-- - "Allow authenticated users to view all profiles" -> public role
-- - "Profiles viewable by authenticated" -> authenticated role
-- DECISAO: Manter ambas pois sao para roles diferentes
-- ============================================================

-- NAO CONSOLIDAR - roles diferentes

-- ============================================================
-- PARTE 5: audit_logs (2 policies SELECT - consolidar)
-- - "Admins view audit logs"
-- - "Allow admin to view logs"
-- Ambas verificam admin
-- ============================================================

DROP POLICY IF EXISTS "Admins view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Allow admin to view logs" ON audit_logs;

CREATE POLICY "audit_logs_select_admin" ON audit_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (profiles.role = 'admin' OR profiles.is_admin = true)
        )
    );

COMMENT ON POLICY "audit_logs_select_admin" ON audit_logs IS
    'CONSOLIDADA: Substitui 2 policies duplicadas. Apenas admins podem ler audit_logs.';

-- ============================================================
-- NOTA SOBRE POLICIES NAO CONSOLIDADAS
-- ============================================================
--
-- As seguintes duplicatas NAO foram consolidadas por serem intencionais:
--
-- 1. cadence_dead_letter, cadence_entry_queue, cadence_queue:
--    - service_role + admin: Patterns diferentes para service vs UI
--
-- 2. integration_field_map, integration_settings, whatsapp_linha_config:
--    - service_role + admin: Patterns diferentes para service vs UI
--
-- 3. proposal_* tabelas (items, options, sections, versions):
--    - public + authenticated: Acesso via token publico vs acesso autenticado
--
-- 4. pipeline_card_settings:
--    - SELECT para owner vs SELECT para defaults: Logicas diferentes
--
-- 5. storage.objects:
--    - Policies de storage sao gerenciadas pelo Supabase Storage
--
-- ============================================================

-- ============================================================
-- VERIFICACAO POS-MIGRACAO
-- ============================================================
-- Executar apos aplicar:
-- SELECT tablename, cmd, COUNT(*) as policy_count
-- FROM pg_policies
-- WHERE permissive = 'PERMISSIVE'
-- GROUP BY tablename, cmd
-- HAVING COUNT(*) > 1
-- ORDER BY policy_count DESC;
-- ============================================================
