-- Fix "column reference pipeline_id is ambiguous" nos triggers de tag.
-- Tanto cards.pipeline_id quanto pipeline_stages.pipeline_id existem; precisamos
-- qualificar explicitamente. Bug isolado descoberto testando agent_assign_tag
-- (retornava success via `|| {success:true}` no router, escondendo a falha real).

CREATE OR REPLACE FUNCTION process_cadence_entry_on_tag_added()
RETURNS TRIGGER AS $fn$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_pending_count INT;
BEGIN
    SELECT c.pipeline_id INTO v_card_pipeline_id
        FROM cards c
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
                'pipeline_id', v_card_pipeline_id
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
    SELECT c.pipeline_id INTO v_card_pipeline_id
        FROM cards c
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
