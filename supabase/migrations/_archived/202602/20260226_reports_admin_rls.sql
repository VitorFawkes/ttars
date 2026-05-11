-- ============================================
-- Reports & Dashboards — Admin pode editar qualquer report/dashboard
-- ============================================
-- Contexto: RLS original permite UPDATE/DELETE apenas para o creator.
-- Admins (profiles.is_admin = true) precisam editar relatórios e dashboards
-- compartilhados criados por outros admins.
--
-- Alteração: Policies de UPDATE e DELETE agora incluem admins.
-- SELECT e INSERT continuam iguais.
-- ============================================

-- 1. Reports — UPDATE: owner OU admin
DROP POLICY IF EXISTS "reports_update" ON custom_reports;
CREATE POLICY "reports_update" ON custom_reports FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR (SELECT is_admin FROM profiles WHERE id = auth.uid())
    );

-- 2. Reports — DELETE: owner OU admin
DROP POLICY IF EXISTS "reports_delete" ON custom_reports;
CREATE POLICY "reports_delete" ON custom_reports FOR DELETE TO authenticated
    USING (
        created_by = auth.uid()
        OR (SELECT is_admin FROM profiles WHERE id = auth.uid())
    );

-- 3. Dashboards — UPDATE: owner OU admin
DROP POLICY IF EXISTS "dashboards_update" ON custom_dashboards;
CREATE POLICY "dashboards_update" ON custom_dashboards FOR UPDATE TO authenticated
    USING (
        created_by = auth.uid()
        OR (SELECT is_admin FROM profiles WHERE id = auth.uid())
    );

-- 4. Dashboards — DELETE: owner OU admin
DROP POLICY IF EXISTS "dashboards_delete" ON custom_dashboards;
CREATE POLICY "dashboards_delete" ON custom_dashboards FOR DELETE TO authenticated
    USING (
        created_by = auth.uid()
        OR (SELECT is_admin FROM profiles WHERE id = auth.uid())
    );

-- 5. Widgets — UPDATE: owner do dashboard OU admin
DROP POLICY IF EXISTS "widgets_update" ON dashboard_widgets;
CREATE POLICY "widgets_update" ON dashboard_widgets FOR UPDATE TO authenticated
    USING (
        dashboard_id IN (SELECT id FROM custom_dashboards WHERE created_by = auth.uid())
        OR (SELECT is_admin FROM profiles WHERE id = auth.uid())
    );

-- 6. Widgets — DELETE: owner do dashboard OU admin
DROP POLICY IF EXISTS "widgets_delete" ON dashboard_widgets;
CREATE POLICY "widgets_delete" ON dashboard_widgets FOR DELETE TO authenticated
    USING (
        dashboard_id IN (SELECT id FROM custom_dashboards WHERE created_by = auth.uid())
        OR (SELECT is_admin FROM profiles WHERE id = auth.uid())
    );

-- 7. Widgets — INSERT: owner do dashboard OU admin
DROP POLICY IF EXISTS "widgets_insert" ON dashboard_widgets;
CREATE POLICY "widgets_insert" ON dashboard_widgets FOR INSERT TO authenticated
    WITH CHECK (
        dashboard_id IN (SELECT id FROM custom_dashboards WHERE created_by = auth.uid())
        OR (SELECT is_admin FROM profiles WHERE id = auth.uid())
    );
