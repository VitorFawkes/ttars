-- ============================================================================
-- MIGRATION: Adiciona filtro applicable_card_types em cadence_event_triggers
-- Date: 2026-05-11
--
-- Adiciona coluna `applicable_card_types TEXT[]` em cadence_event_triggers
-- seguindo o mesmo padrão de applicable_pipeline_ids e applicable_stage_ids:
--   - NULL ou array vazio: automação dispara pra qualquer tipo de card (default)
--   - Array com valores: automação só dispara pros tipos listados
--
-- Valores válidos (alinhado com cards.card_type CHECK constraint):
--   - 'standard'           — Card padrão de venda
--   - 'sub_card'           — Pedido de mudança/adição no pós-venda
--   - 'group_child'        — Filho de grupo (Weddings)
--   - 'future_opportunity' — Oportunidade futura (won_future)
--
-- Retrocompat: todas as automações existentes ficam com NULL, semântica
-- inalterada (disparam pra qualquer tipo de card, como antes).
--
-- Esta migration só adiciona a coluna. As funções de trigger e o motor são
-- atualizados em migrations subsequentes.
-- ============================================================================

BEGIN;

ALTER TABLE cadence_event_triggers
    ADD COLUMN IF NOT EXISTS applicable_card_types TEXT[] DEFAULT NULL;

COMMENT ON COLUMN cadence_event_triggers.applicable_card_types IS
    'Tipos de card aos quais esta automação se aplica. NULL ou vazio = todos. Valores válidos: standard, sub_card, group_child, future_opportunity. Alinhado com cards.card_type.';

-- CHECK constraint: garante que todos os valores no array são válidos.
-- Permite NULL e array vazio (semântica "todos os tipos").
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'cadence_event_triggers_card_types_valid'
    ) THEN
        ALTER TABLE cadence_event_triggers
            ADD CONSTRAINT cadence_event_triggers_card_types_valid
            CHECK (
                applicable_card_types IS NULL
                OR applicable_card_types <@ ARRAY['standard', 'sub_card', 'group_child', 'future_opportunity']::TEXT[]
            );
    END IF;
END
$$;

COMMIT;

DO $$ BEGIN
    RAISE NOTICE 'cadence_event_triggers.applicable_card_types adicionada com CHECK constraint.';
END $$;
