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
--    (cadence_event_triggers não tem org_id — herda isolamento via template_id → cadence_templates.org_id)
CREATE INDEX IF NOT EXISTS idx_cadence_event_triggers_active
    ON cadence_event_triggers (is_active)
    WHERE is_active = true;

-- 4) Limpar regras TESTE do sistema morto "Automação de Mensagens"
--    (6 rows, 0 ativas, 7 execuções históricas — confirmado em 2026-04-12)
DELETE FROM automacao_execucoes WHERE regra_id IN (SELECT id FROM automacao_regras WHERE nome LIKE 'TESTE%');
DELETE FROM automacao_regra_passos WHERE regra_id IN (SELECT id FROM automacao_regras WHERE nome LIKE 'TESTE%');
DELETE FROM automacao_regras WHERE nome LIKE 'TESTE%';

-- 4.1) Estender DB trigger functions para enfileirar send_message e change_stage
--      (o backend cadence-engine já tem os handlers — falta só o enqueue no DB trigger)
CREATE OR REPLACE FUNCTION process_cadence_entry_on_card_create()
RETURNS TRIGGER AS $fn$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_result JSONB;
BEGIN
    SELECT pipeline_id INTO v_card_pipeline_id FROM pipeline_stages WHERE id = NEW.pipeline_stage_id;

    FOR v_trigger IN
        SELECT * FROM cadence_event_triggers
        WHERE event_type = 'card_created' AND is_active = true
        AND (applicable_stage_ids IS NULL OR array_length(applicable_stage_ids, 1) IS NULL OR NEW.pipeline_stage_id = ANY(applicable_stage_ids))
        AND (applicable_pipeline_ids IS NULL OR array_length(applicable_pipeline_ids, 1) IS NULL OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
    LOOP
        IF v_trigger.action_type = 'create_task' THEN
            v_result := execute_cadence_entry_rule_immediate(NEW.id, v_trigger.id);
        ELSIF v_trigger.action_type IN ('start_cadence', 'send_message', 'change_stage') THEN
            INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
            VALUES (NEW.id, v_trigger.id, 'card_created',
                jsonb_build_object('stage_id', NEW.pipeline_stage_id, 'pipeline_id', v_card_pipeline_id, 'owner_id', NEW.dono_atual_id),
                CASE WHEN v_trigger.delay_minutes = 0 THEN NOW() ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL END);
        END IF;
    END LOOP;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION process_cadence_entry_on_stage_change()
RETURNS TRIGGER AS $fn$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_result JSONB;
    v_existing RECORD;
    v_pending_count INT;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id THEN
        SELECT pipeline_id INTO v_card_pipeline_id FROM pipeline_stages WHERE id = NEW.pipeline_stage_id;

        FOR v_trigger IN
            SELECT * FROM cadence_event_triggers
            WHERE event_type = 'stage_enter' AND is_active = true
            AND (applicable_stage_ids IS NULL OR array_length(applicable_stage_ids, 1) IS NULL OR NEW.pipeline_stage_id = ANY(applicable_stage_ids))
            AND (applicable_pipeline_ids IS NULL OR array_length(applicable_pipeline_ids, 1) IS NULL OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
        LOOP
            IF v_trigger.action_type = 'create_task' THEN
                v_result := execute_cadence_entry_rule_immediate(NEW.id, v_trigger.id);
            ELSIF v_trigger.action_type = 'start_cadence' THEN
                FOR v_existing IN
                    SELECT id FROM cadence_instances WHERE card_id = NEW.id AND template_id = v_trigger.target_template_id AND status IN ('active','waiting_task')
                LOOP
                    UPDATE cadence_instances SET status='cancelled', cancelled_at=NOW(), cancelled_reason='replaced_by_reentry' WHERE id=v_existing.id;
                    UPDATE cadence_queue SET status='cancelled' WHERE instance_id=v_existing.id AND status IN ('pending','processing');
                    INSERT INTO cadence_event_log (instance_id, card_id, event_type, event_source, event_data, action_taken)
                    VALUES (v_existing.id, NEW.id, 'cadence_cancelled', 'db_trigger',
                        jsonb_build_object('reason','replaced_by_reentry','new_stage_id',NEW.pipeline_stage_id,'trigger_id',v_trigger.id),
                        'cancel_and_restart');
                END LOOP;

                SELECT COUNT(*) INTO v_pending_count FROM cadence_entry_queue WHERE card_id=NEW.id AND trigger_id=v_trigger.id AND status='pending';
                IF v_pending_count > 0 THEN CONTINUE; END IF;

                INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
                VALUES (NEW.id, v_trigger.id, 'stage_enter',
                    jsonb_build_object('old_stage_id',OLD.pipeline_stage_id,'new_stage_id',NEW.pipeline_stage_id,'pipeline_id',v_card_pipeline_id),
                    CASE WHEN v_trigger.delay_minutes=0 THEN NOW() ELSE NOW()+(v_trigger.delay_minutes||' minutes')::INTERVAL END);

                INSERT INTO cadence_event_log (card_id, event_type, event_source, event_data, action_taken)
                VALUES (NEW.id, 'entry_rule_triggered', 'db_trigger',
                    jsonb_build_object('trigger_id',v_trigger.id,'trigger_name',v_trigger.name,'old_stage_id',OLD.pipeline_stage_id,'new_stage_id',NEW.pipeline_stage_id),
                    'queued_for_processing');
            ELSIF v_trigger.action_type IN ('send_message', 'change_stage') THEN
                SELECT COUNT(*) INTO v_pending_count FROM cadence_entry_queue WHERE card_id=NEW.id AND trigger_id=v_trigger.id AND status='pending';
                IF v_pending_count > 0 THEN CONTINUE; END IF;

                INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
                VALUES (NEW.id, v_trigger.id, 'stage_enter',
                    jsonb_build_object('old_stage_id',OLD.pipeline_stage_id,'new_stage_id',NEW.pipeline_stage_id,'pipeline_id',v_card_pipeline_id),
                    CASE WHEN v_trigger.delay_minutes=0 THEN NOW() ELSE NOW()+(v_trigger.delay_minutes||' minutes')::INTERVAL END);
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- 5) Registrar no log
DO $$ BEGIN
    RAISE NOTICE 'Automations unified actions migration applied — action_type CHECK expanded, DB triggers estendidos, TESTE rules cleaned';
END $$;
