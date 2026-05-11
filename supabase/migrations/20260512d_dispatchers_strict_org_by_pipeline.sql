-- ============================================================================
-- ISOLAMENTO ESTRITO DE AUTOMACAO POR ORG (via pipeline.org_id)
-- ============================================================================
-- A migration anterior (20260512c) filtrava por ct.org_id = NEW.org_id
-- (card.org_id), mas falhou em isolar porque card.org_id pode estar
-- desalinhado com pipeline.org_id (231 cards inconsistentes em prod,
-- 186 deles vindos do webhook AC desde 2025-03-21 com integrations.org_id
-- hardcoded em Trips, mesmo quando o stage mapeado e Wedding).
--
-- Esta migration troca o predicate: agora filtra pelo org do PIPELINE
-- (fonte da verdade), nao do card. Pipeline tem 1 org so, populado no
-- onboarding e estavel. Mesmo com card.org_id errado, o dispatcher
-- bloqueia cross-workspace.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) card_created
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_cadence_entry_on_card_create()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
        AND EXISTS (
            SELECT 1 FROM cadence_templates ct
            WHERE ct.id = cadence_event_triggers.target_template_id
              AND ct.org_id = (SELECT p.org_id FROM pipelines p WHERE p.id = v_card_pipeline_id)
        )
    LOOP
        IF v_trigger.action_type = 'create_task' THEN
            v_result := execute_cadence_entry_rule_immediate(NEW.id, v_trigger.id);
        ELSIF v_trigger.action_type IN (
            'start_cadence', 'send_message', 'change_stage',
            'add_tag', 'remove_tag', 'notify_internal',
            'update_field', 'trigger_n8n_webhook'
        ) THEN
            INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
            VALUES (NEW.id, v_trigger.id, 'card_created',
                jsonb_build_object('stage_id', NEW.pipeline_stage_id, 'pipeline_id', v_card_pipeline_id, 'owner_id', NEW.dono_atual_id),
                CASE WHEN v_trigger.delay_minutes = 0 THEN NOW() ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL END);
        END IF;
    END LOOP;

    RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2) stage_change (cobre stage_enter + macro_stage_enter)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_cadence_entry_on_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
            AND EXISTS (
                SELECT 1 FROM cadence_templates ct
                WHERE ct.id = cadence_event_triggers.target_template_id
                  AND ct.org_id = (SELECT p.org_id FROM pipelines p WHERE p.id = v_card_pipeline_id)
            )
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
                AND EXISTS (
                    SELECT 1 FROM cadence_templates ct
                    WHERE ct.id = cadence_event_triggers.target_template_id
                      AND ct.org_id = (SELECT p.org_id FROM pipelines p WHERE p.id = v_card_pipeline_id)
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
$function$;

-- ----------------------------------------------------------------------------
-- 3) card_field_change
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_cadence_entry_on_card_field_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
    IF NEW.status_comercial IS DISTINCT FROM OLD.status_comercial THEN v_changed_fields := v_changed_fields || ARRAY['status_comercial']::TEXT[]; END IF;
    IF NEW.valor_final IS DISTINCT FROM OLD.valor_final THEN v_changed_fields := v_changed_fields || ARRAY['valor_final']::TEXT[]; END IF;
    IF NEW.valor_estimado IS DISTINCT FROM OLD.valor_estimado THEN v_changed_fields := v_changed_fields || ARRAY['valor_estimado']::TEXT[]; END IF;
    IF NEW.dono_atual_id IS DISTINCT FROM OLD.dono_atual_id THEN v_changed_fields := v_changed_fields || ARRAY['dono_atual_id']::TEXT[]; END IF;
    IF NEW.prioridade IS DISTINCT FROM OLD.prioridade THEN v_changed_fields := v_changed_fields || ARRAY['prioridade']::TEXT[]; END IF;
    IF NEW.pronto_para_contrato IS DISTINCT FROM OLD.pronto_para_contrato THEN v_changed_fields := v_changed_fields || ARRAY['pronto_para_contrato']::TEXT[]; END IF;
    IF NEW.taxa_status IS DISTINCT FROM OLD.taxa_status THEN v_changed_fields := v_changed_fields || ARRAY['taxa_status']::TEXT[]; END IF;
    IF NEW.data_viagem_inicio IS DISTINCT FROM OLD.data_viagem_inicio THEN v_changed_fields := v_changed_fields || ARRAY['data_viagem_inicio']::TEXT[]; END IF;

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
              AND event_config->>'field' = v_field
              AND (applicable_pipeline_ids IS NULL OR array_length(applicable_pipeline_ids, 1) IS NULL OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
              AND (applicable_stage_ids IS NULL OR array_length(applicable_stage_ids, 1) IS NULL OR NEW.pipeline_stage_id = ANY(applicable_stage_ids))
              AND (
                event_config->>'to_value' IS NULL
                OR event_config->>'to_value' = COALESCE(v_new_value, '')
              )
              AND EXISTS (
                SELECT 1 FROM cadence_templates ct
                WHERE ct.id = cadence_event_triggers.target_template_id
                  AND ct.org_id = (SELECT p.org_id FROM pipelines p WHERE p.id = v_card_pipeline_id)
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
$function$;

-- ----------------------------------------------------------------------------
-- 4) tag_added
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_cadence_entry_on_tag_added()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
        AND EXISTS (
            SELECT 1 FROM cadence_templates ct
            WHERE ct.id = cadence_event_triggers.target_template_id
              AND ct.org_id = (SELECT p.org_id FROM pipelines p WHERE p.id = v_card_pipeline_id)
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
$function$;

-- ----------------------------------------------------------------------------
-- 5) tag_removed
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_cadence_entry_on_tag_removed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
        AND EXISTS (
            SELECT 1 FROM cadence_templates ct
            WHERE ct.id = cadence_event_triggers.target_template_id
              AND ct.org_id = (SELECT p.org_id FROM pipelines p WHERE p.id = v_card_pipeline_id)
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
$function$;

-- ============================================================================
-- AUDITORIA
-- ============================================================================
DO $$
DECLARE
    v_cross_org_potencial INT;
BEGIN
    SELECT COUNT(DISTINCT cet.id) INTO v_cross_org_potencial
    FROM cadence_event_triggers cet
    JOIN cadence_templates ct ON ct.id = cet.target_template_id
    JOIN pipelines p ON p.org_id <> ct.org_id
    WHERE cet.is_active = true;
    RAISE NOTICE 'Triggers ativos x pipelines de outras orgs (cross-org potencial bloqueado pelo novo filtro): %', v_cross_org_potencial;
END $$;
