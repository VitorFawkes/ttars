-- ============================================================
-- MIGRATION: Fix external_source inconsistency causing duplicate cards
-- Date: 2026-03-10
--
-- Problema:
-- integration-process/index.ts usa 'active_campaign' (com underscore),
-- mas 188 cards antigos tinham 'activecampaign' (sem underscore).
-- Constraint uq_cards_external_identity (global, inclui soft-deleted)
-- impede normalização direta quando já existe card com 'active_campaign'.
--
-- Estratégia:
-- 1. Merge cross-source duplicates: manter o mais antigo, soft-delete
--    o mais novo E limpar seu external_id para não conflitar
-- 2. Normalizar external_source nos restantes
-- ============================================================

-- ========================================
-- 1. MERGE CROSS-SOURCE DUPLICATES
-- ========================================

DO $$
DECLARE
    v_rec RECORD;
    v_keep_id UUID;
    v_remove_id UUID;
    v_count INT := 0;
BEGIN
    FOR v_rec IN
        SELECT old_card.id AS keep_id, new_card.id AS remove_id, old_card.external_id
        FROM cards old_card
        JOIN cards new_card ON new_card.external_id = old_card.external_id
        WHERE old_card.external_source = 'activecampaign'
          AND new_card.external_source = 'active_campaign'
          AND old_card.deleted_at IS NULL
          AND new_card.deleted_at IS NULL
    LOOP
        v_keep_id := v_rec.keep_id;
        v_remove_id := v_rec.remove_id;

        -- Re-linkar mensagens WhatsApp
        UPDATE whatsapp_messages SET card_id = v_keep_id
        WHERE card_id = v_remove_id;

        -- Re-linkar atividades
        UPDATE activities SET card_id = v_keep_id
        WHERE card_id = v_remove_id;

        -- Re-linkar raw events
        UPDATE whatsapp_raw_events SET card_id = v_keep_id
        WHERE card_id = v_remove_id;

        -- Re-linkar tarefas
        UPDATE tarefas SET card_id = v_keep_id
        WHERE card_id = v_remove_id;

        -- Re-linkar cards_contatos
        INSERT INTO cards_contatos (card_id, contato_id)
        SELECT v_keep_id, contato_id FROM cards_contatos WHERE card_id = v_remove_id
        ON CONFLICT DO NOTHING;
        DELETE FROM cards_contatos WHERE card_id = v_remove_id;

        -- Copiar dados úteis do novo → antigo (se o antigo não tem)
        UPDATE cards k SET
            origem = COALESCE(k.origem, r.origem),
            origem_lead = COALESCE(k.origem_lead, r.origem_lead),
            marketing_data = COALESCE(k.marketing_data, r.marketing_data),
            produto_data = COALESCE(k.produto_data, r.produto_data),
            valor_estimado = COALESCE(k.valor_estimado, r.valor_estimado),
            updated_at = NOW()
        FROM cards r
        WHERE k.id = v_keep_id AND r.id = v_remove_id;

        -- Soft-delete o duplicado E limpar external_id para evitar conflito
        -- com a constraint uq_cards_external_identity (global)
        UPDATE cards SET deleted_at = NOW(), external_id = NULL
        WHERE id = v_remove_id;

        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE 'Merged % cross-source duplicate cards', v_count;
END $$;

-- ========================================
-- 2. NORMALIZAR external_source (seguro agora)
-- ========================================
UPDATE cards SET external_source = 'active_campaign', updated_at = NOW()
WHERE external_source = 'activecampaign';

UPDATE contatos SET external_source = 'active_campaign'
WHERE external_source = 'activecampaign';

UPDATE tarefas SET external_source = 'active_campaign'
WHERE external_source = 'activecampaign';
