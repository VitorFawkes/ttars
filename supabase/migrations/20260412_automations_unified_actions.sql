-- ============================================================================
-- AUTOMAÇÕES UNIFICADAS — expande action_type para cobrir ações de mensagem + CRM
-- ============================================================================
--
-- Até aqui, cadence_event_triggers.action_type só aceitava 'create_task' e
-- 'start_cadence' (sem CHECK constraint — confiança implícita no código).
-- Agora o builder unificado expõe:
--   - create_task      (já existia)
--   - start_cadence    (já existia)
--   - send_message     (NOVO — dispara WhatsApp via send-whatsapp-message)
--   - change_stage     (NOVO — move card para outra etapa do pipeline)
--
-- Também adiciona CHECK pra barrar valores inválidos e um índice parcial
-- em automacao_execucoes para o hub de monitor/listagem.
--
-- Limpeza: remove as 6 regras "TESTE-*" em automacao_regras (infra morta),
-- mantendo as tabelas (backend pode reusar para storage de send_message).

-- 1) Descobre e remove CHECK antigo se existir (para rodar idempotente)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class cls ON cls.oid = con.conrelid
        WHERE cls.relname = 'cadence_event_triggers'
        AND con.conname = 'cadence_event_triggers_action_type_check'
    ) THEN
        ALTER TABLE cadence_event_triggers DROP CONSTRAINT cadence_event_triggers_action_type_check;
    END IF;
END $$;

-- 2) CHECK constraint com todos os action_types suportados
ALTER TABLE cadence_event_triggers
    ADD CONSTRAINT cadence_event_triggers_action_type_check
    CHECK (action_type IN ('create_task', 'start_cadence', 'send_message', 'change_stage', 'complete_task'));

-- 3) Índice para listagem rápida no hub "Automações"
CREATE INDEX IF NOT EXISTS idx_cadence_event_triggers_active_product
    ON cadence_event_triggers (org_id, is_active)
    WHERE is_active = true;

-- 4) Limpar regras TESTE do sistema morto "Automação de Mensagens"
--    (6 rows, 0 ativas, 7 execuções históricas — confirmado em 2026-04-12)
DELETE FROM automacao_execucoes WHERE regra_id IN (SELECT id FROM automacao_regras WHERE nome LIKE 'TESTE%');
DELETE FROM automacao_regra_passos WHERE regra_id IN (SELECT id FROM automacao_regras WHERE nome LIKE 'TESTE%');
DELETE FROM automacao_regras WHERE nome LIKE 'TESTE%';

-- 5) Registrar no log
DO $$ BEGIN
    RAISE NOTICE 'Automations unified actions migration applied — action_type CHECK expanded, TESTE rules cleaned';
END $$;
