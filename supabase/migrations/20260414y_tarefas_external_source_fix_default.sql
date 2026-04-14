-- ============================================================================
-- FIX: tarefas.external_source DEFAULT 'activecampaign' contaminava TODAS as
-- inserts (manuais, cadência, automação) fazendo o CRM classificar qualquer
-- tarefa como "Integração". Correto: só preencher external_source quando
-- também há external_id (tarefa veio de verdade de um sistema externo).
--
-- Aplicado em: 2026-04-14
-- Contexto: a migration 20260307_task_sync_bidirectional adicionou a coluna
-- com DEFAULT 'activecampaign'. O DEFAULT nunca foi apropriado.
-- ============================================================================

-- 1) Remover o DEFAULT errado
ALTER TABLE tarefas ALTER COLUMN external_source DROP DEFAULT;

-- 2) Limpar dados contaminados: tarefas SEM external_id não deveriam ter
--    external_source. Restringimos à combinação atual ('activecampaign' /
--    'active_campaign') para não mexer em outros providers futuros.
UPDATE tarefas
   SET external_source = NULL
 WHERE external_id IS NULL
   AND external_source IN ('activecampaign', 'active_campaign');

-- 3) Registro de auditoria simples (para debug futuro — nada destrutivo)
DO $$
DECLARE
    v_affected INT;
BEGIN
    SELECT COUNT(*) INTO v_affected
      FROM tarefas
     WHERE external_id IS NOT NULL
       AND external_source IS NOT NULL;
    RAISE NOTICE 'tarefas de integracao legitimas remanescentes: %', v_affected;
END$$;
