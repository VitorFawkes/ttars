-- ============================================================================
-- MIGRATION: Bloquear cadências/automações para cards skip_pos_venda
-- Date: 2026-05-04
--
-- Cards com skip_pos_venda=true não devem disparar nenhum evento de
-- cadência/automação. Eles existem na fase pos_venda APENAS pra rastreio
-- de data — sem mensagens, sem tarefas, sem n8n. O cron de roteamento
-- (fn_roteamento_pos_venda_trips) continua movendo entre etapas, mas isso
-- agora é silencioso (não dispara cadência).
--
-- Estratégia: early-return em process_cadence_entry_on_stage_change e
-- process_cadence_entry_on_card_field_change quando NEW.skip_pos_venda=true.
-- ============================================================================

BEGIN;

-- ─── stage_enter / macro_stage_enter dispatcher ───
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
    -- Cards skip_pos_venda não disparam cadências/automações
    IF COALESCE(NEW.skip_pos_venda, false) = true THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id THEN
        SELECT pipeline_id, phase_id INTO v_card_pipeline_id, v_new_phase_id
            FROM pipeline_stages WHERE id = NEW.pipeline_stage_id;
        SELECT phase_id INTO v_old_phase_id
            FROM pipeline_stages WHERE id = OLD.pipeline_stage_id;

        v_phase_changed := v_new_phase_id IS NOT NULL AND v_new_phase_id IS DISTINCT FROM v_old_phase_id;

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

-- ─── field_changed dispatcher: idem early-return ───
-- Não vou recriar a função inteira; uso ALTER pra adicionar o early-return
-- via wrapper. Como a função é definida em outras migrations e pode ter
-- mudado, só recrio se a coluna que verificamos existir.
DO $do$
BEGIN
    -- Garante early-return em process_cadence_entry_on_card_field_change
    -- Se a função existir, recria com guard skip_pos_venda
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'process_cadence_entry_on_card_field_change'
    ) THEN
        EXECUTE $sql$
            CREATE OR REPLACE FUNCTION process_cadence_entry_on_card_field_change()
            RETURNS TRIGGER AS $body$
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

                -- Cards skip_pos_venda não disparam cadências/automações
                IF COALESCE(NEW.skip_pos_venda, false) = true THEN
                    RETURN NEW;
                END IF;

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
                        AND event_config->>'field_key' = v_field
                        AND (applicable_pipeline_ids IS NULL OR array_length(applicable_pipeline_ids, 1) IS NULL OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
                    LOOP
                        SELECT COUNT(*) INTO v_pending_count FROM cadence_entry_queue
                            WHERE card_id=NEW.id AND trigger_id=v_trigger.id AND status='pending';
                        IF v_pending_count > 0 THEN CONTINUE; END IF;

                        INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
                        VALUES (NEW.id, v_trigger.id, 'field_changed',
                            jsonb_build_object('field_key', v_field, 'old_value', v_old_value, 'new_value', v_new_value, 'pipeline_id', v_card_pipeline_id),
                            CASE WHEN v_trigger.delay_minutes=0 THEN NOW() ELSE NOW()+(v_trigger.delay_minutes||' minutes')::INTERVAL END);
                    END LOOP;
                END LOOP;

                RETURN NEW;
            END;
            $body$ LANGUAGE plpgsql;
        $sql$;
    END IF;
END
$do$;

COMMIT;
