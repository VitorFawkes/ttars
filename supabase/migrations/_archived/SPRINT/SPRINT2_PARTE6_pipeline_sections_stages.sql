-- SPRINT 2 - PARTE 6: pipeline_phases, pipeline_stages, sections, stage_field_config, stage_fields_settings

DROP POLICY IF EXISTS "Allow insert/delete for admins" ON pipeline_phases;
CREATE POLICY "Allow insert/delete for admins" ON pipeline_phases
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'::app_role
        )
    );

DROP POLICY IF EXISTS "Admin full access" ON pipeline_stages;
CREATE POLICY "Admin full access" ON pipeline_stages
    FOR ALL TO public
    USING (
        (SELECT auth.uid()) IN (SELECT profiles.id FROM profiles WHERE role = 'admin'::app_role)
    )
    WITH CHECK (
        (SELECT auth.uid()) IN (SELECT profiles.id FROM profiles WHERE role = 'admin'::app_role)
    );

DROP POLICY IF EXISTS "Admin delete sections" ON sections;
CREATE POLICY "Admin delete sections" ON sections
    FOR DELETE TO public
    USING (
        is_system = false
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (is_admin = true OR role = 'admin'::app_role)
        )
    );

DROP POLICY IF EXISTS "Admin update sections" ON sections;
CREATE POLICY "Admin update sections" ON sections
    FOR UPDATE TO public
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (is_admin = true OR role = 'admin'::app_role)
        )
    );

DROP POLICY IF EXISTS "Admin full access" ON stage_field_config;
CREATE POLICY "Admin full access" ON stage_field_config
    FOR ALL TO public
    USING (
        (SELECT auth.uid()) IN (SELECT profiles.id FROM profiles WHERE role = 'admin'::app_role)
    );

DROP POLICY IF EXISTS "Admins can delete stage_fields_settings" ON stage_fields_settings;
CREATE POLICY "Admins can delete stage_fields_settings" ON stage_fields_settings
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (role = 'admin'::app_role OR is_admin = true)
        )
    );

DROP POLICY IF EXISTS "Admins can update stage_fields_settings" ON stage_fields_settings;
CREATE POLICY "Admins can update stage_fields_settings" ON stage_fields_settings
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (role = 'admin'::app_role OR is_admin = true)
        )
    );
