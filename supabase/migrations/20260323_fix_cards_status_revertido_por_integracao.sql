-- ============================================================================
-- FIX: Corrigir cards com status revertido pela integração AC
-- Date: 2026-03-23
--
-- Bug: integration-process recebia deal[status]=0 (open) do AC e sobrescrevia
-- status_comercial de 'perdido' para 'aberto', sem checar se o card já estava
-- fechado no CRM. 14 cards afetados.
--
-- Critério: status_comercial='aberto' + motivo_perda_id preenchido = foi perdido
-- manualmente mas revertido pela integração.
-- ============================================================================

BEGIN;

-- Remarcar como perdidos os cards que foram indevidamente revertidos
UPDATE cards
SET
    status_comercial = 'perdido',
    updated_at = NOW()
WHERE status_comercial = 'aberto'
  AND motivo_perda_id IS NOT NULL
  AND deleted_at IS NULL;

COMMIT;
