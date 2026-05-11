-- =====================================================
-- FIX: Drop missing workflow trigger on tarefas
-- Esta trigger foi esquecida na migration 20260201000000
-- e causa erro: relation "workflow_instances" does not exist
-- Data: 2026-02-02
-- =====================================================

-- 1. Drop trigger on tarefas table
DROP TRIGGER IF EXISTS trg_workflow_on_task_outcome ON tarefas;

-- 2. Drop the associated function
DROP FUNCTION IF EXISTS trigger_workflow_on_task_outcome() CASCADE;

-- Confirmação
DO $$
BEGIN
    RAISE NOTICE 'Fixed: trg_workflow_on_task_outcome trigger and function removed from tarefas table';
END $$;
