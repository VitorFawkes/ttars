-- ============================================================
-- MIGRATION: Automações Sprint 2 — ações novas (Parte 1)
-- Date: 2026-04-19
--
-- Adiciona 3 novos action_types ao sistema de automações:
--   - add_tag         → atribui tag ao card (card_tag_assignments)
--   - remove_tag      → remove tag do card
--   - notify_internal → cria notificação in-app (sino) para user específico,
--                       dono do card, ou todos admins da org
--
-- Mudanças:
-- 1. Expande CHECK de cadence_event_triggers.action_type
-- 2. Estende DB trigger functions (card_created e stage_change) para
--    enfileirar esses action_types (padrão idêntico a send_message/change_stage)
--
-- Idempotente: pode ser rodada múltiplas vezes.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Expandir CHECK constraint de action_type
-- ============================================================
DO $mig$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cadence_event_triggers') THEN
        RAISE NOTICE 'cadence_event_triggers não existe — pulando expansão de CHECK.';
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_class cls ON cls.oid = con.conrelid
        WHERE cls.relname = 'cadence_event_triggers'
        AND con.conname = 'cadence_event_triggers_action_type_check'
    ) THEN
        ALTER TABLE public.cadence_event_triggers
            DROP CONSTRAINT cadence_event_triggers_action_type_check;
    END IF;

    ALTER TABLE public.cadence_event_triggers
        ADD CONSTRAINT cadence_event_triggers_action_type_check
        CHECK (action_type IN (
            'create_task',
            'start_cadence',
            'send_message',
            'change_stage',
            'complete_task',
            'add_tag',
            'remove_tag',
            'notify_internal'
        ));
END $mig$;

COMMIT;

-- ============================================================
-- 2 + 3: DB triggers (fora da transação porque CREATE FUNCTION
-- não pode ser condicional dentro de DO $$; se a tabela não existe,
-- o SELECT ao final falharia silenciosamente. Guardamos por pg_tables
-- antes de recriar.)
-- ============================================================
DO $check_triggers$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'cadence_event_triggers') THEN
        RAISE NOTICE 'Pulando extensão das DB triggers — cadence_event_triggers ausente.';
    ELSE
        RAISE NOTICE 'Estendendo DB trigger functions com novos action_types...';
    END IF;
END $check_triggers$;

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
        ELSIF v_trigger.action_type IN (
            'start_cadence', 'send_message', 'change_stage',
            'add_tag', 'remove_tag', 'notify_internal'
        ) THEN
            INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
            VALUES (NEW.id, v_trigger.id, 'card_created',
                jsonb_build_object('stage_id', NEW.pipeline_stage_id, 'pipeline_id', v_card_pipeline_id, 'owner_id', NEW.dono_atual_id),
                CASE WHEN v_trigger.delay_minutes = 0 THEN NOW() ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL END);
        END IF;
    END LOOP;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- ============================================================
-- 3. Estender process_cadence_entry_on_stage_change
-- ============================================================
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
            ELSIF v_trigger.action_type IN (
                'send_message', 'change_stage',
                'add_tag', 'remove_tag', 'notify_internal'
            ) THEN
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

DO $$ BEGIN
    RAISE NOTICE 'Sprint 2 actions migration applied — add_tag, remove_tag, notify_internal habilitados';
END $$;
