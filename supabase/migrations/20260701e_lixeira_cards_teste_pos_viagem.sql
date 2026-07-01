-- ============================================================================
-- MIGRATION: Lixeira — cards de teste sem venda na última etapa de pós-venda
-- Date: 2026-07-01
--
-- Spec: docs/superpowers/specs/2026-07-01-encerrar-viagem-trips-design.md
--
-- Dois cards de teste puro (sem venda, sem ganho de planner) estavam poluindo a
-- última etapa de pós-venda TRIPS. Mandar para a lixeira (soft-delete via
-- deleted_at). IDs explícitos — sem heurística de nome. "Marina / Miami /
-- Fevereiro 2026" NÃO é teste e não está aqui.
--
-- IDs específicos de produção; em staging (ids diferentes) o UPDATE afeta 0 linhas
-- (seguro/idempotente).
-- ============================================================================

BEGIN;

DO $$
DECLARE
    v_removidos INT := 0;
BEGIN
    UPDATE cards SET
        deleted_at = NOW(),
        updated_at = NOW()
    WHERE id IN (
        '6211038e-2ceb-4d0d-b038-8cd1e6697035',  -- "CARD TESTE"
        '919f9bc0-4da6-49bf-9426-5508046f5bdb'   -- "teste0005"
    )
    AND deleted_at IS NULL;
    GET DIAGNOSTICS v_removidos = ROW_COUNT;

    RAISE NOTICE 'Lixeira cards de teste (pós-viagem TRIPS): removidos=%', v_removidos;
END $$;

COMMIT;
