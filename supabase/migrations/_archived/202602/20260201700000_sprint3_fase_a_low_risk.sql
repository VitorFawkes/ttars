-- ============================================================
-- SPRINT 3 - FASE A: Consolidacao de Policies (BAIXO RISCO)
-- Data: 2026-02-01
-- Tabelas: 7 (apenas baixo risco)
-- ============================================================

-- ============================================================
-- 1. cadence_dead_letter (2 ALL → 1)
-- Consolidar admin + service_role em uma policy
-- ============================================================
DROP POLICY IF EXISTS "cadence_dead_letter_admin_all" ON cadence_dead_letter;
DROP POLICY IF EXISTS "cadence_dead_letter_service_role" ON cadence_dead_letter;

CREATE POLICY "cadence_dead_letter_all" ON cadence_dead_letter
    FOR ALL TO public
    USING (is_admin() OR auth.role() = 'service_role');

-- ============================================================
-- 2. cadence_entry_queue (2 ALL → 1)
-- Manter SELECT owner separado
-- ============================================================
DROP POLICY IF EXISTS "cadence_entry_queue_admin_all" ON cadence_entry_queue;
DROP POLICY IF EXISTS "cadence_entry_queue_service_role" ON cadence_entry_queue;

CREATE POLICY "cadence_entry_queue_all" ON cadence_entry_queue
    FOR ALL TO public
    USING (is_admin() OR auth.role() = 'service_role');

-- ============================================================
-- 3. cadence_queue (2 ALL → 1)
-- ============================================================
DROP POLICY IF EXISTS "cadence_queue_admin_all" ON cadence_queue;
DROP POLICY IF EXISTS "cadence_queue_service_role" ON cadence_queue;

CREATE POLICY "cadence_queue_all" ON cadence_queue
    FOR ALL TO public
    USING (is_admin() OR auth.role() = 'service_role');

-- ============================================================
-- 4. pipeline_card_settings (remover SELECT duplicado)
-- "Settings viewable by authenticated" e "Users can view..." sao identicos
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own settings or default settings" ON pipeline_card_settings;
-- Manter "Settings viewable by authenticated"

-- ============================================================
-- 5. profiles (remover SELECT redundante)
-- "Profiles viewable by authenticated" e redundante com "Allow authenticated..."
-- ============================================================
DROP POLICY IF EXISTS "Profiles viewable by authenticated" ON profiles;
-- Manter "Allow authenticated users to view all profiles"

-- ============================================================
-- 6. proposal_client_selections (remover SELECT redundante)
-- "Allow authenticated read" e redundante com "Anyone can view selections"
-- ============================================================
DROP POLICY IF EXISTS "Allow authenticated read" ON proposal_client_selections;
-- Manter "Anyone can view selections"

-- ============================================================
-- 7. proposal_templates (2 SELECT → 1 com OR)
-- ============================================================
DROP POLICY IF EXISTS "Users can view global templates" ON proposal_templates;
DROP POLICY IF EXISTS "Users can view own templates" ON proposal_templates;

CREATE POLICY "proposal_templates_select" ON proposal_templates
    FOR SELECT TO public
    USING (is_global = true OR created_by = (SELECT auth.uid()));

-- ============================================================
-- VERIFICACAO
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE 'Sprint 3 Fase A aplicada com sucesso!';
    RAISE NOTICE 'Tabelas consolidadas: cadence_dead_letter, cadence_entry_queue, cadence_queue, pipeline_card_settings, profiles, proposal_client_selections, proposal_templates';
END $$;
