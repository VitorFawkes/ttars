-- ============================================================================
-- MIGRATION: Desligar is_won da etapa "Pré-Embarque <<< 30 dias" (Welcome Trips)
-- Date: 2026-04-27
--
-- A etapa "Pré-Embarque <<< 30 dias" estava configurada com is_won=true,
-- o que marcava o card como ganho automaticamente ao entrar nela. Pela nova
-- regra, ganho só deve ocorrer após viagem realizada + NPS — não na entrada
-- da etapa pré-viagem.
--
-- Cards já existentes nessa etapa não são afetados — esta mudança apenas
-- impede que NOVOS cards virem ganho automático ao entrar.
-- ============================================================================

BEGIN;

UPDATE pipeline_stages
SET is_won = false
WHERE id = '3ce80249-b579-4a9c-9b82-f8569735cea9'
  AND is_won = true;

COMMIT;
