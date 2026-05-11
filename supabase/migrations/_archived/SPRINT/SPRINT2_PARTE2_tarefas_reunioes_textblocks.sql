-- SPRINT 2 - PARTE 2: tarefas, reunioes, text_blocks

DROP POLICY IF EXISTS "Tarefas delete by owner or admin" ON tarefas;
CREATE POLICY "Tarefas delete by owner or admin" ON tarefas
    FOR DELETE TO authenticated
    USING (created_by = (SELECT auth.uid()) OR responsavel_id = (SELECT auth.uid()) OR is_admin());

DROP POLICY IF EXISTS "Users can view own meetings" ON reunioes;
CREATE POLICY "Users can view own meetings" ON reunioes
    FOR ALL TO authenticated
    USING (created_by = (SELECT auth.uid()) OR responsavel_id = (SELECT auth.uid()) OR sdr_responsavel_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete own text_blocks" ON text_blocks;
CREATE POLICY "Users can delete own text_blocks" ON text_blocks
    FOR DELETE TO public
    USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own text_blocks" ON text_blocks;
CREATE POLICY "Users can update own text_blocks" ON text_blocks
    FOR UPDATE TO public
    USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view own and global text_blocks" ON text_blocks;
CREATE POLICY "Users can view own and global text_blocks" ON text_blocks
    FOR SELECT TO public
    USING (ownership_type = 'global' OR created_by = (SELECT auth.uid()));
