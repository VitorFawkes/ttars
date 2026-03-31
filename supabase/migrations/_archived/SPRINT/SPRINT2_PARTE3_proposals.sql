-- SPRINT 2 - PARTE 3: proposal_library, proposal_templates, proposal_comments, proposal_flights

DROP POLICY IF EXISTS "Users can delete own library items" ON proposal_library;
CREATE POLICY "Users can delete own library items" ON proposal_library
    FOR DELETE TO authenticated
    USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own library items" ON proposal_library;
CREATE POLICY "Users can update own library items" ON proposal_library
    FOR UPDATE TO authenticated
    USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view shared or own library items" ON proposal_library;
CREATE POLICY "Users can view shared or own library items" ON proposal_library
    FOR SELECT TO authenticated
    USING (is_shared = true OR created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own templates" ON proposal_templates;
CREATE POLICY "Users can delete own templates" ON proposal_templates
    FOR DELETE TO public
    USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own templates" ON proposal_templates;
CREATE POLICY "Users can update own templates" ON proposal_templates
    FOR UPDATE TO public
    USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view own templates" ON proposal_templates;
CREATE POLICY "Users can view own templates" ON proposal_templates
    FOR SELECT TO public
    USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Team can update comments" ON proposal_comments;
CREATE POLICY "Team can update comments" ON proposal_comments
    FOR UPDATE TO public
    USING (author_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Team can view proposal comments" ON proposal_comments;
CREATE POLICY "Team can view proposal comments" ON proposal_comments
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM proposals p
            WHERE p.id = proposal_id
            AND (
                p.created_by = (SELECT auth.uid())
                OR EXISTS (
                    SELECT 1 FROM cards c
                    WHERE c.id = p.card_id
                    AND (c.dono_atual_id = (SELECT auth.uid()) OR c.created_by = (SELECT auth.uid()))
                )
            )
        )
    );

DROP POLICY IF EXISTS "Users can manage proposal flights" ON proposal_flights;
CREATE POLICY "Users can manage proposal flights" ON proposal_flights
    FOR ALL TO public
    USING (
        EXISTS (
            SELECT 1 FROM proposals p
            WHERE p.id = proposal_id
            AND p.created_by = (SELECT auth.uid())
        )
    );
