-- ============================================================
-- Migration: Optimize auth.uid() calls in RLS policies
-- Data: 2026-02-01
-- Autor: Vitor (via Claude)
--
-- PROPOSITO: Substituir auth.uid() por (SELECT auth.uid()) em todas
-- as policies RLS. Isso permite que o PostgreSQL cache o resultado
-- uma vez por query, em vez de chamar a funcao para cada linha.
--
-- RISCO: BAIXO - Apenas otimizacao de performance
-- ROLLBACK: Reverter para auth.uid() sem SELECT
-- ============================================================

-- ============================================================
-- PARTE 1: Policies de profiles
-- ============================================================

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE TO public
    USING ((SELECT auth.uid()) = id);

-- ============================================================
-- PARTE 2: Policies de pipeline_card_settings
-- ============================================================

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

-- ============================================================
-- PARTE 3: Policies de tarefas
-- ============================================================

DROP POLICY IF EXISTS "Tarefas delete by owner or admin" ON tarefas;
CREATE POLICY "Tarefas delete by owner or admin" ON tarefas
    FOR DELETE TO authenticated
    USING (created_by = (SELECT auth.uid()) OR responsavel_id = (SELECT auth.uid()) OR is_admin());

-- ============================================================
-- PARTE 4: Policies de reunioes
-- ============================================================

DROP POLICY IF EXISTS "Users can view own meetings" ON reunioes;
CREATE POLICY "Users can view own meetings" ON reunioes
    FOR ALL TO authenticated
    USING (created_by = (SELECT auth.uid()) OR responsavel_id = (SELECT auth.uid()) OR sdr_responsavel_id = (SELECT auth.uid()));

-- ============================================================
-- PARTE 5: Policies de text_blocks
-- ============================================================

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

-- ============================================================
-- PARTE 6: Policies de proposal_library
-- ============================================================

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

-- ============================================================
-- PARTE 7: Policies de proposal_templates
-- ============================================================

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

-- ============================================================
-- PARTE 8: Policies de proposal_comments
-- ============================================================

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

-- ============================================================
-- PARTE 9: Policies de proposal_flights
-- ============================================================

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

-- ============================================================
-- PARTE 10: Policies de cadence_* (tabelas de automacao)
-- ============================================================

DROP POLICY IF EXISTS "cadence_entry_queue_owner_select" ON cadence_entry_queue;
CREATE POLICY "cadence_entry_queue_owner_select" ON cadence_entry_queue
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM cards c
            WHERE c.id = card_id
            AND c.dono_atual_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "cadence_event_log_select" ON cadence_event_log;
CREATE POLICY "cadence_event_log_select" ON cadence_event_log
    FOR SELECT TO public
    USING (
        (card_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM cards c
            WHERE c.id = card_id
            AND c.dono_atual_id = (SELECT auth.uid())
        ))
        OR is_admin()
    );

DROP POLICY IF EXISTS "cadence_instances_select" ON cadence_instances;
CREATE POLICY "cadence_instances_select" ON cadence_instances
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM cards c
            WHERE c.id = card_id
            AND c.dono_atual_id = (SELECT auth.uid())
        )
        OR is_admin()
    );

-- ============================================================
-- PARTE 11: Policies de admin (padrao EXISTS com profiles)
-- ============================================================

-- audit_logs
DROP POLICY IF EXISTS "Admins view audit logs" ON audit_logs;
CREATE POLICY "Admins view audit logs" ON audit_logs
    FOR SELECT TO public
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND profiles.role = 'admin'
        )
    );

-- card_creation_rules
DROP POLICY IF EXISTS "card_creation_rules_admin_delete" ON card_creation_rules;
CREATE POLICY "card_creation_rules_admin_delete" ON card_creation_rules
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (is_admin = true OR role = 'admin')
        )
    );

DROP POLICY IF EXISTS "card_creation_rules_admin_update" ON card_creation_rules;
CREATE POLICY "card_creation_rules_admin_update" ON card_creation_rules
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (is_admin = true OR role = 'admin')
        )
    );

-- destinations
DROP POLICY IF EXISTS "Team can manage destinations" ON destinations;
CREATE POLICY "Team can manage destinations" ON destinations
    FOR ALL TO public
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = ANY (ARRAY['admin', 'vendas', 'concierge'])
        )
    );

-- integration_events
DROP POLICY IF EXISTS "Admins can delete integration events" ON integration_events;
CREATE POLICY "Admins can delete integration events" ON integration_events
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can update integration events" ON integration_events;
CREATE POLICY "Admins can update integration events" ON integration_events
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can view integration events" ON integration_events;
CREATE POLICY "Admins can view integration events" ON integration_events
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

-- integration_field_catalog
DROP POLICY IF EXISTS "Allow admin write" ON integration_field_catalog;
CREATE POLICY "Allow admin write" ON integration_field_catalog
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

-- integration_field_map
DROP POLICY IF EXISTS "integration_field_map_admin_all" ON integration_field_map;
CREATE POLICY "integration_field_map_admin_all" ON integration_field_map
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

-- integration_outbound_field_map
DROP POLICY IF EXISTS "Allow admin write" ON integration_outbound_field_map;
CREATE POLICY "Allow admin write" ON integration_outbound_field_map
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

-- integration_outbound_stage_map
DROP POLICY IF EXISTS "Allow admin write" ON integration_outbound_stage_map;
CREATE POLICY "Allow admin write" ON integration_outbound_stage_map
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

-- integration_settings
DROP POLICY IF EXISTS "integration_settings_admin_all" ON integration_settings;
CREATE POLICY "integration_settings_admin_all" ON integration_settings
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "integration_settings_admin_select" ON integration_settings;
CREATE POLICY "integration_settings_admin_select" ON integration_settings
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

-- integrations
DROP POLICY IF EXISTS "Admins can manage integrations" ON integrations;
CREATE POLICY "Admins can manage integrations" ON integrations
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

-- pipeline_phases
DROP POLICY IF EXISTS "Allow insert/delete for admins" ON pipeline_phases;
CREATE POLICY "Allow insert/delete for admins" ON pipeline_phases
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

-- pipeline_stages
DROP POLICY IF EXISTS "Admin full access" ON pipeline_stages;
CREATE POLICY "Admin full access" ON pipeline_stages
    FOR ALL TO public
    USING (
        (SELECT auth.uid()) IN (SELECT profiles.id FROM profiles WHERE role = 'admin')
    )
    WITH CHECK (
        (SELECT auth.uid()) IN (SELECT profiles.id FROM profiles WHERE role = 'admin')
    );

-- sections
DROP POLICY IF EXISTS "Admin delete sections" ON sections;
CREATE POLICY "Admin delete sections" ON sections
    FOR DELETE TO public
    USING (
        is_system = false
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (is_admin = true OR role = 'admin')
        )
    );

DROP POLICY IF EXISTS "Admin update sections" ON sections;
CREATE POLICY "Admin update sections" ON sections
    FOR UPDATE TO public
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (is_admin = true OR role = 'admin')
        )
    );

-- stage_field_config
DROP POLICY IF EXISTS "Admin full access" ON stage_field_config;
CREATE POLICY "Admin full access" ON stage_field_config
    FOR ALL TO public
    USING (
        (SELECT auth.uid()) IN (SELECT profiles.id FROM profiles WHERE role = 'admin')
    );

-- stage_fields_settings
DROP POLICY IF EXISTS "Admins can delete stage_fields_settings" ON stage_fields_settings;
CREATE POLICY "Admins can delete stage_fields_settings" ON stage_fields_settings
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (role = 'admin' OR is_admin = true)
        )
    );

DROP POLICY IF EXISTS "Admins can update stage_fields_settings" ON stage_fields_settings;
CREATE POLICY "Admins can update stage_fields_settings" ON stage_fields_settings
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND (role = 'admin' OR is_admin = true)
        )
    );

-- whatsapp_linha_config
DROP POLICY IF EXISTS "whatsapp_linha_config_admin_modify" ON whatsapp_linha_config;
CREATE POLICY "whatsapp_linha_config_admin_modify" ON whatsapp_linha_config
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

-- whatsapp_phase_instance_map
DROP POLICY IF EXISTS "Allow admin write" ON whatsapp_phase_instance_map;
CREATE POLICY "Allow admin write" ON whatsapp_phase_instance_map
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = (SELECT auth.uid())
            AND role = 'admin'
        )
    );

-- ============================================================
-- COMENTARIO FINAL
-- ============================================================
COMMENT ON SCHEMA public IS
    'Migration 20260201600000: Todas as policies RLS foram otimizadas para usar (SELECT auth.uid()) em vez de auth.uid() direto. Isso melhora a performance ao permitir que o PostgreSQL cache o resultado.';
