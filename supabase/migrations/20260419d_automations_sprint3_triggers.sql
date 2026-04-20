-- ============================================================
-- MIGRATION: Automações Sprint 3 — Gatilhos novos (DB triggers)
-- Date: 2026-04-19
--
-- Adiciona 4 novos event_types ao sistema de automações:
--   - macro_stage_enter   → card entrou em uma fase (não etapa) do pipeline
--   - field_changed       → campo whitelisted do card mudou
--   - tag_added           → tag foi adicionada a um card
--   - tag_removed         → tag foi removida de um card
--
-- Como cadence_event_triggers.event_type não tem CHECK constraint, basta
-- criar os DB triggers e enfileirar em cadence_entry_queue. O cadence-engine
-- consome por action_type (já funciona com qualquer event_type).
--
-- Mudanças:
-- 1. Estende process_cadence_entry_on_stage_change para detectar macro_stage_enter
--    (quando phase_id da nova etapa ≠ phase_id da antiga)
-- 2. Cria process_cadence_entry_on_card_field_change + trigger em cards
--    (whitelist: data_viagem_inicio, status_comercial, valor_final,
--     valor_estimado, dono_atual_id, prioridade, pronto_para_contrato,
--     taxa_status)
-- 3. Cria process_cadence_entry_on_tag_assignment_insert/delete + triggers
--    em card_tag_assignments
--
-- Matching de trigger:
--   - macro_stage_enter: event_config->>'phase_id' opcional (null = qualquer fase)
--   - field_changed: event_config->>'field' obrigatório (whitelist)
--   - tag_added/tag_removed: event_config->>'tag_id' opcional (null = qualquer tag)
--
-- Idempotente: pode ser rodada múltiplas vezes.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Estender process_cadence_entry_on_stage_change com macro_stage_enter
-- ============================================================
-- Padrão: quando phase_id da nova etapa difere da antiga, dispara triggers
-- com event_type='macro_stage_enter' e (event_config->>'phase_id' IS NULL OR
-- matches new phase).
CREATE OR REPLACE FUNCTION process_cadence_entry_on_stage_change()
RETURNS TRIGGER AS $fn$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_result JSONB;
    v_existing RECORD;
    v_pending_count INT;
    v_old_phase_id UUID;
    v_new_phase_id UUID;
    v_phase_changed BOOLEAN;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id THEN
        SELECT pipeline_id, phase_id INTO v_card_pipeline_id, v_new_phase_id
            FROM pipeline_stages WHERE id = NEW.pipeline_stage_id;
        SELECT phase_id INTO v_old_phase_id
            FROM pipeline_stages WHERE id = OLD.pipeline_stage_id;

        v_phase_changed := v_new_phase_id IS NOT NULL AND v_new_phase_id IS DISTINCT FROM v_old_phase_id;

        -- ============================================================
        -- stage_enter (já existente)
        -- ============================================================
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
                'add_tag', 'remove_tag', 'notify_internal',
                'update_field', 'trigger_n8n_webhook'
            ) THEN
                SELECT COUNT(*) INTO v_pending_count FROM cadence_entry_queue WHERE card_id=NEW.id AND trigger_id=v_trigger.id AND status='pending';
                IF v_pending_count > 0 THEN CONTINUE; END IF;

                INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
                VALUES (NEW.id, v_trigger.id, 'stage_enter',
                    jsonb_build_object('old_stage_id',OLD.pipeline_stage_id,'new_stage_id',NEW.pipeline_stage_id,'pipeline_id',v_card_pipeline_id),
                    CASE WHEN v_trigger.delay_minutes=0 THEN NOW() ELSE NOW()+(v_trigger.delay_minutes||' minutes')::INTERVAL END);
            END IF;
        END LOOP;

        -- ============================================================
        -- macro_stage_enter (novo)
        -- ============================================================
        IF v_phase_changed THEN
            FOR v_trigger IN
                SELECT * FROM cadence_event_triggers
                WHERE event_type = 'macro_stage_enter' AND is_active = true
                AND (applicable_pipeline_ids IS NULL OR array_length(applicable_pipeline_ids, 1) IS NULL OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
                AND (
                    event_config IS NULL
                    OR event_config->>'phase_id' IS NULL
                    OR (event_config->>'phase_id')::UUID = v_new_phase_id
                )
            LOOP
                IF v_trigger.action_type = 'create_task' THEN
                    v_result := execute_cadence_entry_rule_immediate(NEW.id, v_trigger.id);
                ELSIF v_trigger.action_type IN (
                    'start_cadence', 'send_message', 'change_stage',
                    'add_tag', 'remove_tag', 'notify_internal',
                    'update_field', 'trigger_n8n_webhook'
                ) THEN
                    SELECT COUNT(*) INTO v_pending_count FROM cadence_entry_queue
                        WHERE card_id=NEW.id AND trigger_id=v_trigger.id AND status='pending';
                    IF v_pending_count > 0 THEN CONTINUE; END IF;

                    INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
                    VALUES (NEW.id, v_trigger.id, 'macro_stage_enter',
                        jsonb_build_object(
                            'old_phase_id', v_old_phase_id,
                            'new_phase_id', v_new_phase_id,
                            'old_stage_id', OLD.pipeline_stage_id,
                            'new_stage_id', NEW.pipeline_stage_id,
                            'pipeline_id', v_card_pipeline_id
                        ),
                        CASE WHEN v_trigger.delay_minutes=0 THEN NOW() ELSE NOW()+(v_trigger.delay_minutes||' minutes')::INTERVAL END);
                END IF;
            END LOOP;
        END IF;
    END IF;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- ============================================================
-- 2. field_changed — trigger em cards para campos whitelisted
-- ============================================================
-- Whitelist de colunas que podem virar gatilho. Mantém alinhado com a UI.
CREATE OR REPLACE FUNCTION process_cadence_entry_on_card_field_change()
RETURNS TRIGGER AS $fn$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_field TEXT;
    v_old_value TEXT;
    v_new_value TEXT;
    v_pending_count INT;
    v_changed_fields TEXT[];
BEGIN
    IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

    -- Detectar quais campos da whitelist mudaram
    v_changed_fields := ARRAY[]::TEXT[];
    IF NEW.status_comercial IS DISTINCT FROM OLD.status_comercial THEN v_changed_fields := v_changed_fields || 'status_comercial'; END IF;
    IF NEW.valor_final IS DISTINCT FROM OLD.valor_final THEN v_changed_fields := v_changed_fields || 'valor_final'; END IF;
    IF NEW.valor_estimado IS DISTINCT FROM OLD.valor_estimado THEN v_changed_fields := v_changed_fields || 'valor_estimado'; END IF;
    IF NEW.dono_atual_id IS DISTINCT FROM OLD.dono_atual_id THEN v_changed_fields := v_changed_fields || 'dono_atual_id'; END IF;
    IF NEW.prioridade IS DISTINCT FROM OLD.prioridade THEN v_changed_fields := v_changed_fields || 'prioridade'; END IF;
    IF NEW.pronto_para_contrato IS DISTINCT FROM OLD.pronto_para_contrato THEN v_changed_fields := v_changed_fields || 'pronto_para_contrato'; END IF;
    IF NEW.taxa_status IS DISTINCT FROM OLD.taxa_status THEN v_changed_fields := v_changed_fields || 'taxa_status'; END IF;
    IF NEW.data_viagem_inicio IS DISTINCT FROM OLD.data_viagem_inicio THEN v_changed_fields := v_changed_fields || 'data_viagem_inicio'; END IF;

    IF array_length(v_changed_fields, 1) IS NULL THEN RETURN NEW; END IF;

    SELECT pipeline_id INTO v_card_pipeline_id FROM pipeline_stages WHERE id = NEW.pipeline_stage_id;

    FOREACH v_field IN ARRAY v_changed_fields LOOP
        -- Capturar old/new como TEXT pra qualquer tipo
        v_old_value := CASE v_field
            WHEN 'status_comercial' THEN OLD.status_comercial::TEXT
            WHEN 'valor_final' THEN OLD.valor_final::TEXT
            WHEN 'valor_estimado' THEN OLD.valor_estimado::TEXT
            WHEN 'dono_atual_id' THEN OLD.dono_atual_id::TEXT
            WHEN 'prioridade' THEN OLD.prioridade::TEXT
            WHEN 'pronto_para_contrato' THEN OLD.pronto_para_contrato::TEXT
            WHEN 'taxa_status' THEN OLD.taxa_status::TEXT
            WHEN 'data_viagem_inicio' THEN OLD.data_viagem_inicio::TEXT
        END;
        v_new_value := CASE v_field
            WHEN 'status_comercial' THEN NEW.status_comercial::TEXT
            WHEN 'valor_final' THEN NEW.valor_final::TEXT
            WHEN 'valor_estimado' THEN NEW.valor_estimado::TEXT
            WHEN 'dono_atual_id' THEN NEW.dono_atual_id::TEXT
            WHEN 'prioridade' THEN NEW.prioridade::TEXT
            WHEN 'pronto_para_contrato' THEN NEW.pronto_para_contrato::TEXT
            WHEN 'taxa_status' THEN NEW.taxa_status::TEXT
            WHEN 'data_viagem_inicio' THEN NEW.data_viagem_inicio::TEXT
        END;

        FOR v_trigger IN
            SELECT * FROM cadence_event_triggers
            WHERE event_type = 'field_changed' AND is_active = true
            AND event_config->>'field' = v_field
            AND (applicable_pipeline_ids IS NULL OR array_length(applicable_pipeline_ids, 1) IS NULL OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
            AND (applicable_stage_ids IS NULL OR array_length(applicable_stage_ids, 1) IS NULL OR NEW.pipeline_stage_id = ANY(applicable_stage_ids))
            AND (
                event_config->>'to_value' IS NULL
                OR event_config->>'to_value' = COALESCE(v_new_value, '')
            )
        LOOP
            SELECT COUNT(*) INTO v_pending_count FROM cadence_entry_queue
                WHERE card_id=NEW.id AND trigger_id=v_trigger.id AND status='pending';
            IF v_pending_count > 0 THEN CONTINUE; END IF;

            INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
            VALUES (NEW.id, v_trigger.id, 'field_changed',
                jsonb_build_object(
                    'field', v_field,
                    'old_value', v_old_value,
                    'new_value', v_new_value,
                    'pipeline_id', v_card_pipeline_id,
                    'stage_id', NEW.pipeline_stage_id
                ),
                CASE WHEN v_trigger.delay_minutes=0 THEN NOW() ELSE NOW()+(v_trigger.delay_minutes||' minutes')::INTERVAL END);
        END LOOP;
    END LOOP;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- Criar trigger (DROP+CREATE pra idempotência)
DROP TRIGGER IF EXISTS trg_cadence_entry_on_card_field_change ON cards;
CREATE TRIGGER trg_cadence_entry_on_card_field_change
    AFTER UPDATE ON cards
    FOR EACH ROW
    EXECUTE FUNCTION process_cadence_entry_on_card_field_change();

-- ============================================================
-- 3. tag_added / tag_removed — triggers em card_tag_assignments
-- ============================================================
CREATE OR REPLACE FUNCTION process_cadence_entry_on_tag_added()
RETURNS TRIGGER AS $fn$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_pending_count INT;
BEGIN
    SELECT pipeline_id INTO v_card_pipeline_id
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        WHERE c.id = NEW.card_id;

    FOR v_trigger IN
        SELECT * FROM cadence_event_triggers
        WHERE event_type = 'tag_added' AND is_active = true
        AND (applicable_pipeline_ids IS NULL OR array_length(applicable_pipeline_ids, 1) IS NULL OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
        AND (
            event_config IS NULL
            OR event_config->>'tag_id' IS NULL
            OR (event_config->>'tag_id')::UUID = NEW.tag_id
        )
    LOOP
        IF v_trigger.action_type NOT IN (
            'create_task', 'start_cadence', 'send_message', 'change_stage',
            'add_tag', 'remove_tag', 'notify_internal',
            'update_field', 'trigger_n8n_webhook'
        ) THEN CONTINUE; END IF;

        SELECT COUNT(*) INTO v_pending_count FROM cadence_entry_queue
            WHERE card_id = NEW.card_id AND trigger_id = v_trigger.id AND status = 'pending';
        IF v_pending_count > 0 THEN CONTINUE; END IF;

        INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
        VALUES (NEW.card_id, v_trigger.id, 'tag_added',
            jsonb_build_object(
                'tag_id', NEW.tag_id,
                'pipeline_id', v_card_pipeline_id,
                'assigned_by', NEW.assigned_by
            ),
            CASE WHEN v_trigger.delay_minutes = 0 THEN NOW() ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL END);
    END LOOP;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION process_cadence_entry_on_tag_removed()
RETURNS TRIGGER AS $fn$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_pending_count INT;
BEGIN
    SELECT pipeline_id INTO v_card_pipeline_id
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        WHERE c.id = OLD.card_id;

    FOR v_trigger IN
        SELECT * FROM cadence_event_triggers
        WHERE event_type = 'tag_removed' AND is_active = true
        AND (applicable_pipeline_ids IS NULL OR array_length(applicable_pipeline_ids, 1) IS NULL OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
        AND (
            event_config IS NULL
            OR event_config->>'tag_id' IS NULL
            OR (event_config->>'tag_id')::UUID = OLD.tag_id
        )
    LOOP
        IF v_trigger.action_type NOT IN (
            'create_task', 'start_cadence', 'send_message', 'change_stage',
            'add_tag', 'remove_tag', 'notify_internal',
            'update_field', 'trigger_n8n_webhook'
        ) THEN CONTINUE; END IF;

        SELECT COUNT(*) INTO v_pending_count FROM cadence_entry_queue
            WHERE card_id = OLD.card_id AND trigger_id = v_trigger.id AND status = 'pending';
        IF v_pending_count > 0 THEN CONTINUE; END IF;

        INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
        VALUES (OLD.card_id, v_trigger.id, 'tag_removed',
            jsonb_build_object(
                'tag_id', OLD.tag_id,
                'pipeline_id', v_card_pipeline_id
            ),
            CASE WHEN v_trigger.delay_minutes = 0 THEN NOW() ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL END);
    END LOOP;

    RETURN OLD;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cadence_entry_on_tag_added ON card_tag_assignments;
CREATE TRIGGER trg_cadence_entry_on_tag_added
    AFTER INSERT ON card_tag_assignments
    FOR EACH ROW
    EXECUTE FUNCTION process_cadence_entry_on_tag_added();

DROP TRIGGER IF EXISTS trg_cadence_entry_on_tag_removed ON card_tag_assignments;
CREATE TRIGGER trg_cadence_entry_on_tag_removed
    AFTER DELETE ON card_tag_assignments
    FOR EACH ROW
    EXECUTE FUNCTION process_cadence_entry_on_tag_removed();

COMMIT;

DO $$ BEGIN
    RAISE NOTICE 'Sprint 3 triggers aplicados — macro_stage_enter, field_changed, tag_added, tag_removed';
END $$;
