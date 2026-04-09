-- Anti-duplicata: card voltando/avançando na mesma etapa não deve criar
-- cadência duplicada. Verifica se já existe instância ativa para o mesmo
-- template+card antes de enfileirar.
CREATE OR REPLACE FUNCTION process_cadence_entry_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_result JSONB;
    v_existing_count INT;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id THEN
        SELECT pipeline_id INTO v_card_pipeline_id
        FROM pipeline_stages
        WHERE id = NEW.pipeline_stage_id;

        FOR v_trigger IN
            SELECT * FROM cadence_event_triggers
            WHERE event_type = 'stage_enter'
            AND is_active = true
            AND (
                applicable_stage_ids IS NULL
                OR array_length(applicable_stage_ids, 1) IS NULL
                OR NEW.pipeline_stage_id = ANY(applicable_stage_ids)
            )
            AND (
                applicable_pipeline_ids IS NULL
                OR array_length(applicable_pipeline_ids, 1) IS NULL
                OR v_card_pipeline_id = ANY(applicable_pipeline_ids)
            )
        LOOP
            IF v_trigger.action_type = 'create_task' THEN
                v_result := execute_cadence_entry_rule_immediate(NEW.id, v_trigger.id);
                RAISE NOTICE '[Cadence] Immediate execution result: %', v_result;

            ELSIF v_trigger.action_type = 'start_cadence' THEN
                -- Anti-duplicata: pular se já existe cadência ativa para este card+template
                SELECT COUNT(*) INTO v_existing_count
                FROM cadence_instances
                WHERE card_id = NEW.id
                  AND template_id = v_trigger.target_template_id
                  AND status IN ('active', 'waiting_task');

                IF v_existing_count > 0 THEN
                    -- Apenas logar que foi pulado
                    INSERT INTO cadence_event_log (
                        card_id, event_type, event_source, event_data, action_taken
                    ) VALUES (
                        NEW.id, 'entry_rule_skipped', 'db_trigger',
                        jsonb_build_object(
                            'trigger_id', v_trigger.id,
                            'trigger_name', v_trigger.name,
                            'reason', 'active_instance_exists',
                            'existing_count', v_existing_count,
                            'new_stage_id', NEW.pipeline_stage_id
                        ),
                        'skipped_duplicate'
                    );
                    CONTINUE;
                END IF;

                -- Também verificar se já tem entrada pendente na fila
                SELECT COUNT(*) INTO v_existing_count
                FROM cadence_entry_queue
                WHERE card_id = NEW.id
                  AND trigger_id = v_trigger.id
                  AND status = 'pending';

                IF v_existing_count > 0 THEN
                    CONTINUE;
                END IF;

                INSERT INTO cadence_entry_queue (
                    card_id, trigger_id, event_type, event_data, execute_at
                ) VALUES (
                    NEW.id, v_trigger.id, 'stage_enter',
                    jsonb_build_object(
                        'old_stage_id', OLD.pipeline_stage_id,
                        'new_stage_id', NEW.pipeline_stage_id,
                        'pipeline_id', v_card_pipeline_id
                    ),
                    CASE
                        WHEN v_trigger.delay_minutes = 0 THEN NOW()
                        ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL
                    END
                );

                INSERT INTO cadence_event_log (
                    card_id, event_type, event_source, event_data, action_taken
                ) VALUES (
                    NEW.id, 'entry_rule_triggered', 'db_trigger',
                    jsonb_build_object(
                        'trigger_id', v_trigger.id,
                        'trigger_name', v_trigger.name,
                        'old_stage_id', OLD.pipeline_stage_id,
                        'new_stage_id', NEW.pipeline_stage_id
                    ),
                    'queued_for_processing'
                );
            END IF;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
