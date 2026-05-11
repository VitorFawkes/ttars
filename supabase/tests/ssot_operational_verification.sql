-- Verification Script for Wave 6: Operational Unification
-- This script verifies that view_cards_acoes correctly reflects State (Tasks) and History (Activities)

BEGIN;

-- 1. Setup Test Data
INSERT INTO cards (id, title, pipeline_id, pipeline_stage_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'Test Card Operational', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

-- Clear existing tasks/activities for this card to ensure clean state
DELETE FROM tarefas WHERE card_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM reunioes WHERE card_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM activities WHERE card_id = '00000000-0000-0000-0000-000000000001';

-- 2. Verify "No Task" State
SELECT 'Step 2: No Task' as step, proxima_tarefa, tarefas_atrasadas, estado_operacional 
FROM view_cards_acoes WHERE id = '00000000-0000-0000-0000-000000000001';
-- Expected: proxima_tarefa IS NULL, tarefas_atrasadas = 0, estado_operacional = 'sem_tarefa'

-- 3. Create Overdue Task (State)
INSERT INTO tarefas (card_id, titulo, data_vencimento, concluida, tipo)
VALUES ('00000000-0000-0000-0000-000000000001', 'Overdue Task', NOW() - INTERVAL '1 day', false, 'ligacao');

SELECT 'Step 3: Overdue Task' as step, proxima_tarefa, tarefas_atrasadas, estado_operacional 
FROM view_cards_acoes WHERE id = '00000000-0000-0000-0000-000000000001';
-- Expected: tarefas_atrasadas = 1, estado_operacional = 'atrasado'

-- 4. Complete Task (State Update)
UPDATE tarefas SET concluida = true WHERE card_id = '00000000-0000-0000-0000-000000000001';

SELECT 'Step 4: Task Completed' as step, proxima_tarefa, tarefas_atrasadas, estado_operacional 
FROM view_cards_acoes WHERE id = '00000000-0000-0000-0000-000000000001';
-- Expected: tarefas_atrasadas = 0, estado_operacional = 'sem_tarefa' (back to clean)

-- 5. Create Future Task (State)
INSERT INTO tarefas (card_id, titulo, data_vencimento, concluida, tipo)
VALUES ('00000000-0000-0000-0000-000000000001', 'Future Task', NOW() + INTERVAL '2 days', false, 'reuniao');

SELECT 'Step 5: Future Task' as step, proxima_tarefa->>'titulo' as next_task, tarefas_atrasadas, estado_operacional 
FROM view_cards_acoes WHERE id = '00000000-0000-0000-0000-000000000001';
-- Expected: next_task = 'Future Task', estado_operacional = 'em_dia'

-- 6. Verify Stagnation (History)
-- Insert old interaction
INSERT INTO activities (card_id, tipo, descricao, created_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'ligacao', 'Old Call', NOW() - INTERVAL '15 days');

SELECT 'Step 6: Stagnation' as step, tempo_sem_contato 
FROM view_cards_acoes WHERE id = '00000000-0000-0000-0000-000000000001';
-- Expected: tempo_sem_contato = 15

ROLLBACK;
