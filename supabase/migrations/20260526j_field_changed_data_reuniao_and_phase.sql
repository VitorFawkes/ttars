-- Estende o trigger field_changed:
--   1) Detecta mudanças em produto_data->>'data_reuniao' (campo JSONB novo).
--   2) Aceita event_config->>'phase_id' como filtro: trigger só dispara se o
--      card está em uma stage que pertence à fase (pipeline_phases) escolhida.
--      Permite automação tipo "quando o status mudar NA FASE SDR".

CREATE OR REPLACE FUNCTION public.process_cadence_entry_on_card_field_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_card_phase_id UUID;
    v_field TEXT;
    v_old_value TEXT;
    v_new_value TEXT;
    v_pending_count INT;
    v_changed_fields TEXT[];
BEGIN
    IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

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
    -- novo: campo JSONB data_reuniao (criado em 20260526g)
    IF (NEW.produto_data->>'data_reuniao') IS DISTINCT FROM (OLD.produto_data->>'data_reuniao') THEN
        v_changed_fields := v_changed_fields || ARRAY['data_reuniao']::TEXT[];
    END IF;

    IF array_length(v_changed_fields, 1) IS NULL THEN RETURN NEW; END IF;

    SELECT ps.pipeline_id, ps.phase_id
      INTO v_card_pipeline_id, v_card_phase_id
      FROM pipeline_stages ps
     WHERE ps.id = NEW.pipeline_stage_id;

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
            WHEN 'data_reuniao' THEN OLD.produto_data->>'data_reuniao'
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
            WHEN 'data_reuniao' THEN NEW.produto_data->>'data_reuniao'
        END;

        FOR v_trigger IN
            SELECT * FROM cadence_event_triggers
            WHERE event_type = 'field_changed' AND is_active = true
              AND event_config->>'field' = v_field
              AND (applicable_pipeline_ids IS NULL OR array_length(applicable_pipeline_ids, 1) IS NULL OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
              AND (applicable_stage_ids IS NULL OR array_length(applicable_stage_ids, 1) IS NULL OR NEW.pipeline_stage_id = ANY(applicable_stage_ids))
              AND (
                event_config->>'phase_id' IS NULL
                OR event_config->>'phase_id' = ''
                OR (event_config->>'phase_id')::uuid = v_card_phase_id
              )
              AND (
                event_config->>'to_value' IS NULL
                OR event_config->>'to_value' = COALESCE(v_new_value, '')
              )
              AND EXISTS (
                SELECT 1 FROM cadence_templates ct
                WHERE ct.id = cadence_event_triggers.target_template_id
                  AND ct.org_id = NEW.org_id
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
                    'phase_id', v_card_phase_id,
                    'stage_id', NEW.pipeline_stage_id
                ),
                CASE WHEN v_trigger.delay_minutes=0 THEN NOW() ELSE NOW()+(v_trigger.delay_minutes||' minutes')::INTERVAL END);
        END LOOP;
    END LOOP;

    RETURN NEW;
END;
$function$;
