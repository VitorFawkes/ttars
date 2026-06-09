-- ============================================================================
-- MIGRATION: GRANT marcar_ganho / marcar_perdido para service_role
-- Date: 2026-06-09
--
-- Contexto: o nó "Marcar resultado do card" das Automações (action.mark_card_result)
-- faz o cadence-engine chamar as RPCs marcar_ganho / marcar_perdido. O engine roda
-- como service_role. As migrations originais (20260504r) só deram GRANT EXECUTE
-- para `authenticated`. Este GRANT é defensivo — garante que o motor consegue
-- executar as RPCs SECURITY DEFINER independentemente das default privileges do schema.
--
-- Nenhuma coluna nova é necessária: card_action_config já existe em cadence_steps.
-- ============================================================================

BEGIN;

GRANT EXECUTE ON FUNCTION public.marcar_ganho(UUID, UUID, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.marcar_perdido(UUID, UUID, TEXT) TO service_role;

COMMIT;
