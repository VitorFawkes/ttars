-- =============================================================================
-- FIX card_created: adicionar trigger INSERT para log_outbound_card_event
--
-- Problema: trg_card_outbound_sync dispara só em AFTER UPDATE, mas a função
-- log_outbound_card_event() também trata o caminho INSERT (card_created).
-- Ao dropar tr_log_outbound_card_event (que era INSERT OR UPDATE) na migration
-- 20260302_fix_outbound_duplicates.sql, o INSERT para card_created ficou sem cobertura.
--
-- Fix: adicionar trg_card_outbound_insert (AFTER INSERT) separado,
-- mantendo trg_card_outbound_sync (AFTER UPDATE com WHEN guard) intacto.
-- Dois triggers bem nomeados = sem ambiguidade, sem duplicatas.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cards'
    ) THEN
        -- Remove qualquer vestigio de trigger INSERT órfão
        EXECUTE 'DROP TRIGGER IF EXISTS trg_card_outbound_insert ON public.cards';

        -- Cria trigger INSERT para card_created
        EXECUTE '
            CREATE TRIGGER trg_card_outbound_insert
                AFTER INSERT ON public.cards
                FOR EACH ROW
                EXECUTE FUNCTION log_outbound_card_event()
        ';
    END IF;
END $$;

COMMENT ON FUNCTION log_outbound_card_event IS
'Trigger que monitora INSERT/UPDATE em cards e enfileira eventos outbound.
INSERT (trg_card_outbound_insert) → card_created: cards novos sem external_id.
UPDATE (trg_card_outbound_sync)   → stage_change, won, lost, field_update: cards com external_id.
Verificações: action_type (create_only/update_only/all) + sync_field_mode (all/selected/exclude).
Fix 2026-03-02: dois triggers distintos evitam ambiguidade INSERT vs UPDATE.';
