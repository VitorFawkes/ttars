-- SPRINT 2 - PARTE 7: whatsapp_linha_config, whatsapp_phase_instance_map

DROP POLICY IF EXISTS "whatsapp_linha_config_admin_modify" ON whatsapp_linha_config;
CREATE POLICY "whatsapp_linha_config_admin_modify" ON whatsapp_linha_config
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'::app_role
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'::app_role
        )
    );

DROP POLICY IF EXISTS "Allow admin write" ON whatsapp_phase_instance_map;
CREATE POLICY "Allow admin write" ON whatsapp_phase_instance_map
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'::app_role
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'::app_role
        )
    );
