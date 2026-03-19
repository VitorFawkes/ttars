-- ============================================================================
-- Migration: Rename won_upsell → won_future
-- Date: 2026-03-19
--
-- Motivo: "upsell" confunde agentes e pessoas. Na verdade é simplesmente
-- uma venda futura agendada a partir de um card ganho/ativo.
-- Também renomeia task type 'upsell' → 'upgrade' em task_type_config.
-- ============================================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════
-- 1. FUTURE_OPPORTUNITIES: source_type constraint + data
-- ══════════════════════════════════════════════════════════════

-- Atualizar dados existentes ANTES de alterar constraint
UPDATE future_opportunities
SET source_type = 'won_future'
WHERE source_type = 'won_upsell';

-- Dropar constraint antiga e criar nova
ALTER TABLE future_opportunities DROP CONSTRAINT IF EXISTS future_opportunities_source_type_check;
ALTER TABLE future_opportunities ADD CONSTRAINT future_opportunities_source_type_check
    CHECK (source_type IN ('lost_future', 'won_future'));

-- Atualizar comentário da coluna sub_card_mode
COMMENT ON COLUMN future_opportunities.sub_card_mode IS 'Config para won_future (sub-card): incremental ou complete';

-- ══════════════════════════════════════════════════════════════
-- 2. TASK_TYPE_CONFIG: rename 'upsell' → 'upgrade'
-- ══════════════════════════════════════════════════════════════

-- Wrap em bloco seguro — staging pode não ter task_type_config
DO $$
BEGIN
    -- Atualizar a label do tipo de tarefa
    UPDATE task_type_config
    SET key = 'upgrade', label = 'Upgrade / Adição'
    WHERE key = 'upsell';

    -- Atualizar tarefas existentes que usam o tipo antigo
    UPDATE tarefas
    SET tipo = 'upgrade'
    WHERE tipo = 'upsell';
EXCEPTION WHEN undefined_table THEN
    RAISE NOTICE 'task_type_config não existe neste ambiente — skip';
END $$;

COMMIT;
