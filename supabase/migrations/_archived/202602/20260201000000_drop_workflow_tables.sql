-- =====================================================
-- DROP WORKFLOW ENGINE v2 TABLES AND TRIGGERS
-- Substituído pelo Cadence Engine v3
-- Data: 2026-02-01
-- =====================================================

-- Notificação de backup
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Dropping Workflow Engine v2 tables and triggers...';
    RAISE NOTICE 'Cadence Engine v3 is now the only automation system.';
    RAISE NOTICE '================================================';
END $$;

-- =====================================================
-- 1. Drop triggers on cards FIRST (causa do erro!)
-- =====================================================
DROP TRIGGER IF EXISTS trg_workflow_stage_change ON cards;

-- =====================================================
-- 2. Drop triggers on workflow tables
-- =====================================================
DROP TRIGGER IF EXISTS trg_workflow_queue_notify ON workflow_queue;
DROP TRIGGER IF EXISTS trg_workflow_instance_status ON workflow_instances;

-- =====================================================
-- 3. Drop ALL workflow-related functions
-- =====================================================
DROP FUNCTION IF EXISTS trigger_workflow_on_stage_change() CASCADE;
DROP FUNCTION IF EXISTS save_workflow_definition(UUID, TEXT, TEXT, TEXT, JSONB, BOOLEAN, JSONB, JSONB) CASCADE;
DROP FUNCTION IF EXISTS reprocess_workflow_for_stage(UUID, UUID, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS notify_workflow_queue() CASCADE;
DROP FUNCTION IF EXISTS process_workflow_queue() CASCADE;
DROP FUNCTION IF EXISTS enqueue_workflow(UUID, UUID, TEXT, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS execute_workflow_action(UUID, UUID, JSONB) CASCADE;

-- =====================================================
-- 4. Drop tables em ordem reversa de dependências
-- =====================================================

-- Tabelas de execução/log (dependem de workflows)
DROP TABLE IF EXISTS workflow_log CASCADE;
DROP TABLE IF EXISTS workflow_queue CASCADE;
DROP TABLE IF EXISTS workflow_instances CASCADE;

-- Tabelas de estrutura (dependem de workflows)
DROP TABLE IF EXISTS workflow_edges CASCADE;
DROP TABLE IF EXISTS workflow_nodes CASCADE;

-- Tabela principal
DROP TABLE IF EXISTS workflows CASCADE;

-- =====================================================
-- 5. Drop indexes órfãos (se existirem)
-- =====================================================
DROP INDEX IF EXISTS idx_workflow_queue_status;
DROP INDEX IF EXISTS idx_workflow_queue_execute_at;
DROP INDEX IF EXISTS idx_workflow_instances_status;
DROP INDEX IF EXISTS idx_workflow_instances_workflow_id;
DROP INDEX IF EXISTS idx_workflow_instances_card_id;
DROP INDEX IF EXISTS idx_workflow_nodes_workflow_id;
DROP INDEX IF EXISTS idx_workflow_edges_workflow_id;
DROP INDEX IF EXISTS idx_workflow_log_instance_id;

-- =====================================================
-- 6. Confirmação
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Workflow Engine v2 COMPLETELY removed!';
    RAISE NOTICE '- Trigger trg_workflow_stage_change removed from cards';
    RAISE NOTICE '- All workflow functions dropped';
    RAISE NOTICE '- All workflow tables dropped';
    RAISE NOTICE 'Use Cadence Engine v3 for all automation needs.';
    RAISE NOTICE '================================================';
END $$;
