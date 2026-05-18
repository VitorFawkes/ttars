-- Fix: data_anchor='viagem_inicio' nos 4 steps do template "Pós-venda: App & Conteúdo"
-- estava jogando vencimento das tarefas para meses depois (relativo à data da viagem)
-- em vez de ser relativo ao gatilho (entrada na fase ou conclusão da tarefa anterior).
--
-- Bug observado (18/05/2026):
--   - Card Elton (viagem 09/06): "Liberar App" vencendo 10/06 (23 dias)
--   - Card Clacir (viagem 09/10): "Adicionar vouchers" vencendo 12/10 (5 meses!)
--   - Cards sem data_viagem_inicio funcionavam por acaso (fallback usa NOW())
--
-- Causa raiz: supabase/functions/cadence-engine/index.ts:2376-2458 usa
-- step.data_anchor='viagem_inicio' como base do cálculo de data_vencimento.
-- Solução: zerar data_anchor para que use NOW() (momento de criação da tarefa).

-- ============================================================================
-- 1. Atualizar template para nascer correto daqui pra frente
-- ============================================================================
UPDATE cadence_steps
SET data_anchor = NULL
WHERE template_id = 'e14f4a48-0531-41e9-a6e2-8c17dc9539a6'
  AND data_anchor = 'viagem_inicio';

-- ============================================================================
-- 2. Recalcular vencimento das 61 tarefas ativas dessa cadência
-- ============================================================================
-- Mapeamento por título → dias úteis (alinhado ao due_offset.value do step):
--   Criar App                  -> +5 business days
--   Conferir Vouchers          -> +5 business days
--   Adicionar vouchers no App  -> +2 business days
--   Liberar App                -> +2 business days
--
-- Usa calculate_business_due_date() que já é a função usada pela engine
-- em outras situações de cálculo de prazo. 1 dia útil = 540 minutos (9h-18h).

UPDATE tarefas t
SET data_vencimento = calculate_business_due_date(
    NOW(),
    CASE
      WHEN t.titulo IN ('Criar App', 'Conferir Vouchers') THEN 5 * 540
      WHEN t.titulo IN ('Adicionar vouchers no App', 'Liberar App') THEN 2 * 540
    END,
    'business'
)
WHERE t.concluida = false
  AND t.deleted_at IS NULL
  AND t.titulo IN ('Criar App', 'Conferir Vouchers', 'Adicionar vouchers no App', 'Liberar App')
  AND (t.metadata->>'cadence_instance_id')::uuid IN (
      SELECT id FROM cadence_instances
      WHERE template_id = 'e14f4a48-0531-41e9-a6e2-8c17dc9539a6'
  );
