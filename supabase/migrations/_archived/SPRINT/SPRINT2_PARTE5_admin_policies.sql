-- SPRINT 2 - PARTE 5: Admin policies (audit_logs, card_creation_rules, destinations, integration_*)

DROP POLICY IF EXISTS "Admins view audit logs" ON audit_logs;
CREATE POLICY "Admins view audit logs" ON audit_logs
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND profiles.role = 'admin'::app_role
        )
    );

DROP POLICY IF EXISTS "card_creation_rules_admin_delete" ON card_creation_rules;
CREATE POLICY "card_creation_rules_admin_delete" ON card_creation_rules
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (is_admin = true OR role = 'admin'::app_role)
        )
    );

DROP POLICY IF EXISTS "card_creation_rules_admin_update" ON card_creation_rules;
CREATE POLICY "card_creation_rules_admin_update" ON card_creation_rules
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (is_admin = true OR role = 'admin'::app_role)
        )
    );

DROP POLICY IF EXISTS "Team can manage destinations" ON destinations;
CREATE POLICY "Team can manage destinations" ON destinations
    FOR ALL TO public
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = ANY (ARRAY['admin', 'vendas', 'concierge']::app_role[])
        )
    );

DROP POLICY IF EXISTS "Admins can delete integration events" ON integration_events;
CREATE POLICY "Admins can delete integration events" ON integration_events
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'::app_role
        )
    );

DROP POLICY IF EXISTS "Admins can update integration events" ON integration_events;
CREATE POLICY "Admins can update integration events" ON integration_events
    FOR UPDATE TO authenticated
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

DROP POLICY IF EXISTS "Admins can view integration events" ON integration_events;
CREATE POLICY "Admins can view integration events" ON integration_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'::app_role
        )
    );

DROP POLICY IF EXISTS "Allow admin write" ON integration_field_catalog;
CREATE POLICY "Allow admin write" ON integration_field_catalog
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

DROP POLICY IF EXISTS "integration_field_map_admin_all" ON integration_field_map;
CREATE POLICY "integration_field_map_admin_all" ON integration_field_map
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

DROP POLICY IF EXISTS "Allow admin write" ON integration_outbound_field_map;
CREATE POLICY "Allow admin write" ON integration_outbound_field_map
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

DROP POLICY IF EXISTS "Allow admin write" ON integration_outbound_stage_map;
CREATE POLICY "Allow admin write" ON integration_outbound_stage_map
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

DROP POLICY IF EXISTS "integration_settings_admin_all" ON integration_settings;
CREATE POLICY "integration_settings_admin_all" ON integration_settings
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

DROP POLICY IF EXISTS "integration_settings_admin_select" ON integration_settings;
CREATE POLICY "integration_settings_admin_select" ON integration_settings
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'::app_role
        )
    );

DROP POLICY IF EXISTS "Admins can manage integrations" ON integrations;
CREATE POLICY "Admins can manage integrations" ON integrations
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'::app_role
        )
    );
