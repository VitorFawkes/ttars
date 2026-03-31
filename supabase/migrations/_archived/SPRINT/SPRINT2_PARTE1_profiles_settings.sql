-- SPRINT 2 - PARTE 1: profiles e pipeline_card_settings

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE TO public
    USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Settings editable by owner" ON pipeline_card_settings;
CREATE POLICY "Settings editable by owner" ON pipeline_card_settings
    FOR ALL TO authenticated
    USING (usuario_id = (SELECT auth.uid()))
    WITH CHECK (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Settings viewable by authenticated" ON pipeline_card_settings;
CREATE POLICY "Settings viewable by authenticated" ON pipeline_card_settings
    FOR SELECT TO authenticated
    USING (usuario_id IS NULL OR usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update their own settings" ON pipeline_card_settings;
CREATE POLICY "Users can update their own settings" ON pipeline_card_settings
    FOR UPDATE TO public
    USING (usuario_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view their own settings or default settings" ON pipeline_card_settings;
CREATE POLICY "Users can view their own settings or default settings" ON pipeline_card_settings
    FOR SELECT TO public
    USING (usuario_id = (SELECT auth.uid()) OR usuario_id IS NULL);
