-- ============================================================
-- MIGRATION: Automações Sprint 3 (final) — gatilho inbound_message_pattern
-- Date: 2026-04-19
--
-- Adiciona o último event_type pendente do Sprint 3:
--   - inbound_message_pattern → mensagem recebida do cliente bate em
--     pattern (regex/contains/starts_with/equals).
--
-- Diferente dos outros gatilhos do Sprint 3, este NÃO tem DB trigger:
-- mensagens inbound chegam em supabase/functions/ai-agent-router/index.ts
-- (que é chamado pelo whatsapp-webhook). O matcher roda lá, antes do
-- pipeline de IA, e enfileira em cadence_entry_queue.
--
-- Esta migration apenas garante a sanidade do event_config:
--   1. CHECK constraint obrigando `event_config->>'pattern'` não-vazio
--      quando event_type='inbound_message_pattern'.
--   2. Documenta no COMMENT da tabela os event_types reconhecidos.
--
-- event_config esperado:
--   {
--     "pattern": "cancelar|desistir",      -- texto/regex obrigatório
--     "match_mode": "regex",               -- regex|contains|starts_with|equals (default contains)
--     "case_sensitive": false,             -- default false
--     "skip_ai": true                      -- default true; se false, ainda chama o agente IA depois
--   }
--
-- Idempotente: pode ser rodada múltiplas vezes.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. CHECK constraint — pattern não-vazio quando event_type='inbound_message_pattern'
-- ============================================================
-- Drop primeiro pra idempotência (em caso de re-aplicação)
ALTER TABLE cadence_event_triggers
    DROP CONSTRAINT IF EXISTS cadence_event_triggers_inbound_pattern_required;

ALTER TABLE cadence_event_triggers
    ADD CONSTRAINT cadence_event_triggers_inbound_pattern_required CHECK (
        event_type <> 'inbound_message_pattern'
        OR (
            event_config IS NOT NULL
            AND COALESCE(NULLIF(TRIM(event_config->>'pattern'), ''), NULL) IS NOT NULL
        )
    );

-- ============================================================
-- 2. Documentação no COMMENT da tabela
-- ============================================================
COMMENT ON COLUMN cadence_event_triggers.event_type IS
    'Tipo de evento que dispara a automação. Reconhecidos: card_created, '
    'stage_enter, macro_stage_enter, field_changed, tag_added, tag_removed, '
    'dias_antes_viagem, dias_apos_viagem, aniversario_contato, '
    'proposta_expirada, dias_no_stage, card_won, cron_roteamento, '
    'inbound_message_pattern. Para inbound_message_pattern, event_config '
    'deve conter {pattern, match_mode?, case_sensitive?, skip_ai?}.';

COMMIT;

DO $$ BEGIN
    RAISE NOTICE 'Sprint 3 final — inbound_message_pattern aplicado (CHECK + COMMENT)';
END $$;
