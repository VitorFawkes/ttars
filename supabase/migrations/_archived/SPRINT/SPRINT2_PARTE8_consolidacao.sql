-- SPRINT 2 - PARTE 8: Consolidação de policies duplicadas

-- teams (3 policies -> 1)
DROP POLICY IF EXISTS "Allow authenticated users to view all teams" ON teams;
DROP POLICY IF EXISTS "Read access for authenticated users" ON teams;
DROP POLICY IF EXISTS "Authenticated users can read teams" ON teams;
CREATE POLICY "teams_select_authenticated" ON teams
    FOR SELECT TO authenticated
    USING (true);

-- departments (2 policies -> 1)
DROP POLICY IF EXISTS "Read access for authenticated users" ON departments;
DROP POLICY IF EXISTS "Allow authenticated users to view all departments" ON departments;
CREATE POLICY "departments_select_authenticated" ON departments
    FOR SELECT TO authenticated
    USING (true);

-- stage_fields_settings (2 policies SELECT -> 1)
DROP POLICY IF EXISTS "Everyone can read stage_fields_settings" ON stage_fields_settings;
DROP POLICY IF EXISTS "Anyone can read stage_fields_settings" ON stage_fields_settings;
CREATE POLICY "stage_fields_settings_select_all" ON stage_fields_settings
    FOR SELECT TO public
    USING (true);

-- audit_logs (policy duplicada)
DROP POLICY IF EXISTS "Allow admin to view logs" ON audit_logs;
