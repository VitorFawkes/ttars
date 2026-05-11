-- ============================================================================
-- MIGRATION: Arquiva cards do ActiveCampaign parados em etapas pré-Pós-Viagem
-- Date: 2026-04-29
--
-- Auditoria 2026-04-29 identificou 47 cards Welcome Trips com:
--   - external_source IN ('active_campaign', 'activecampaign')
--   - pipeline_stage_id em etapas 01..04 da fase Pós-venda
--   - status_comercial='ganho'
--   - sem progresso (cards parados desde a importação inicial do AC)
--
-- A maioria não tem data_viagem_inicio nem numero_venda_monde — são deals
-- que já estavam fechados no AC mas não foram importados completamente.
--
-- Decisão Vitor 2026-04-29: arquivar todos como ruído de migração.
-- (Se algum era venda real, vai aparecer em outro relatório ou via cliente.)
-- ============================================================================

BEGIN;

UPDATE cards
SET
    archived_at = NOW(),
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND archived_at IS NULL
  AND org_id = 'b0000000-0000-0000-0000-000000000001'  -- Welcome Trips
  AND external_source IN ('active_campaign', 'activecampaign')
  AND pipeline_stage_id IN (
      'b2b0679c-ea06-4b46-9dd4-ee02abff1a36',  -- 01 App & Conteúdo
      '1f684773-f8f3-434a-a44d-4994750c41aa',  -- 02 Pré-embarque >30d
      '3ce80249-b579-4a9c-9b82-f8569735cea9',  -- 03 Pré-Embarque <30d
      '0ebab355-6d0e-4b19-af13-b4b31268275f'   -- 04 Em Viagem
  )
  AND status_comercial = 'ganho';

COMMIT;
