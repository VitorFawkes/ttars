-- ============================================================================
-- CUSTOM BUSINESS HOURS FOR ENTRY RULES
-- ============================================================================
-- Permite configurar horário comercial customizado por regra de entrada
-- ============================================================================

-- Adicionar campos de horário comercial customizado
ALTER TABLE cadence_event_triggers
ADD COLUMN IF NOT EXISTS business_hours_start INT DEFAULT 9
CHECK (business_hours_start >= 0 AND business_hours_start <= 23);

ALTER TABLE cadence_event_triggers
ADD COLUMN IF NOT EXISTS business_hours_end INT DEFAULT 18
CHECK (business_hours_end >= 0 AND business_hours_end <= 23);

ALTER TABLE cadence_event_triggers
ADD COLUMN IF NOT EXISTS allowed_weekdays INT[] DEFAULT '{1,2,3,4,5}';

COMMENT ON COLUMN cadence_event_triggers.business_hours_start IS 'Hora de início do horário comercial (0-23)';
COMMENT ON COLUMN cadence_event_triggers.business_hours_end IS 'Hora de fim do horário comercial (0-23)';
COMMENT ON COLUMN cadence_event_triggers.allowed_weekdays IS 'Dias da semana permitidos (1=seg, 7=dom)';

-- ============================================================================
-- Atualizar função de processamento para usar horário comercial da regra
-- ============================================================================

CREATE OR REPLACE FUNCTION process_cadence_entry_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
    v_trigger RECORD;
    v_execute_at TIMESTAMPTZ;
    v_card_pipeline_id UUID;
    v_bh_start INT;
    v_bh_end INT;
    v_current_hour INT;
    v_current_dow INT;
    v_allowed_days INT[];
BEGIN
    -- Só processa se houve mudança de stage
    IF TG_OP = 'UPDATE' AND NEW.pipeline_stage_id IS DISTINCT FROM OLD.pipeline_stage_id THEN

        -- Buscar pipeline do card
        SELECT pipeline_id INTO v_card_pipeline_id
        FROM pipeline_stages
        WHERE id = NEW.pipeline_stage_id;

        -- Buscar regras de entrada aplicáveis
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
            -- Obter configuração de horário comercial da regra
            v_bh_start := COALESCE(v_trigger.business_hours_start, 9);
            v_bh_end := COALESCE(v_trigger.business_hours_end, 18);
            v_allowed_days := COALESCE(v_trigger.allowed_weekdays, '{1,2,3,4,5}'::INT[]);

            -- Calcular horário de execução
            IF v_trigger.delay_minutes = 0 THEN
                v_execute_at := now();
            ELSIF v_trigger.delay_type = 'calendar' THEN
                v_execute_at := now() + (v_trigger.delay_minutes || ' minutes')::INTERVAL;
            ELSE
                -- Business hours: calcular respeitando horário comercial
                v_execute_at := now() + (v_trigger.delay_minutes || ' minutes')::INTERVAL;

                -- Ajustar para horário comercial se necessário
                v_current_hour := EXTRACT(HOUR FROM v_execute_at AT TIME ZONE 'America/Sao_Paulo');
                v_current_dow := EXTRACT(ISODOW FROM v_execute_at AT TIME ZONE 'America/Sao_Paulo')::INT;

                -- Se fora do horário comercial ou dia não permitido, ajustar
                IF v_current_hour < v_bh_start OR v_current_hour >= v_bh_end OR NOT (v_current_dow = ANY(v_allowed_days)) THEN
                    -- Mover para próximo dia útil às 9h
                    LOOP
                        v_execute_at := (v_execute_at AT TIME ZONE 'America/Sao_Paulo')::DATE + 1 + (v_bh_start || ' hours')::INTERVAL;
                        v_execute_at := v_execute_at AT TIME ZONE 'America/Sao_Paulo';
                        v_current_dow := EXTRACT(ISODOW FROM v_execute_at AT TIME ZONE 'America/Sao_Paulo')::INT;
                        EXIT WHEN v_current_dow = ANY(v_allowed_days);
                    END LOOP;
                END IF;
            END IF;

            -- Inserir na fila de processamento
            INSERT INTO cadence_entry_queue (
                card_id,
                trigger_id,
                event_type,
                event_data,
                execute_at
            ) VALUES (
                NEW.id,
                v_trigger.id,
                'stage_enter',
                jsonb_build_object(
                    'old_stage_id', OLD.pipeline_stage_id,
                    'new_stage_id', NEW.pipeline_stage_id,
                    'pipeline_id', v_card_pipeline_id
                ),
                v_execute_at
            );

            -- Log do evento
            INSERT INTO cadence_event_log (
                card_id,
                event_type,
                event_source,
                event_data,
                action_taken
            ) VALUES (
                NEW.id,
                'entry_rule_triggered',
                'db_trigger',
                jsonb_build_object(
                    'trigger_id', v_trigger.id,
                    'trigger_name', v_trigger.name,
                    'old_stage_id', OLD.pipeline_stage_id,
                    'new_stage_id', NEW.pipeline_stage_id,
                    'execute_at', v_execute_at
                ),
                'queued_for_processing'
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Atualizar função de criação de card
-- ============================================================================

CREATE OR REPLACE FUNCTION process_cadence_entry_on_card_create()
RETURNS TRIGGER AS $$
DECLARE
    v_trigger RECORD;
    v_execute_at TIMESTAMPTZ;
    v_card_pipeline_id UUID;
    v_bh_start INT;
    v_bh_end INT;
    v_current_hour INT;
    v_current_dow INT;
    v_allowed_days INT[];
BEGIN
    -- Buscar pipeline do card
    SELECT pipeline_id INTO v_card_pipeline_id
    FROM pipeline_stages
    WHERE id = NEW.pipeline_stage_id;

    -- Buscar regras de entrada aplicáveis para criação
    FOR v_trigger IN
        SELECT * FROM cadence_event_triggers
        WHERE event_type = 'card_created'
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
        -- Obter configuração de horário comercial da regra
        v_bh_start := COALESCE(v_trigger.business_hours_start, 9);
        v_bh_end := COALESCE(v_trigger.business_hours_end, 18);
        v_allowed_days := COALESCE(v_trigger.allowed_weekdays, '{1,2,3,4,5}'::INT[]);

        -- Calcular horário de execução
        IF v_trigger.delay_minutes = 0 THEN
            v_execute_at := now();
        ELSIF v_trigger.delay_type = 'calendar' THEN
            v_execute_at := now() + (v_trigger.delay_minutes || ' minutes')::INTERVAL;
        ELSE
            -- Business hours: calcular respeitando horário comercial
            v_execute_at := now() + (v_trigger.delay_minutes || ' minutes')::INTERVAL;

            -- Ajustar para horário comercial se necessário
            v_current_hour := EXTRACT(HOUR FROM v_execute_at AT TIME ZONE 'America/Sao_Paulo');
            v_current_dow := EXTRACT(ISODOW FROM v_execute_at AT TIME ZONE 'America/Sao_Paulo')::INT;

            -- Se fora do horário comercial ou dia não permitido, ajustar
            IF v_current_hour < v_bh_start OR v_current_hour >= v_bh_end OR NOT (v_current_dow = ANY(v_allowed_days)) THEN
                -- Mover para próximo dia útil
                LOOP
                    v_execute_at := (v_execute_at AT TIME ZONE 'America/Sao_Paulo')::DATE + 1 + (v_bh_start || ' hours')::INTERVAL;
                    v_execute_at := v_execute_at AT TIME ZONE 'America/Sao_Paulo';
                    v_current_dow := EXTRACT(ISODOW FROM v_execute_at AT TIME ZONE 'America/Sao_Paulo')::INT;
                    EXIT WHEN v_current_dow = ANY(v_allowed_days);
                END LOOP;
            END IF;
        END IF;

        -- Inserir na fila de processamento
        INSERT INTO cadence_entry_queue (
            card_id,
            trigger_id,
            event_type,
            event_data,
            execute_at
        ) VALUES (
            NEW.id,
            v_trigger.id,
            'card_created',
            jsonb_build_object(
                'stage_id', NEW.pipeline_stage_id,
                'pipeline_id', v_card_pipeline_id,
                'owner_id', NEW.dono_atual_id
            ),
            v_execute_at
        );

        -- Log do evento
        INSERT INTO cadence_event_log (
            card_id,
            event_type,
            event_source,
            event_data,
            action_taken
        ) VALUES (
            NEW.id,
            'entry_rule_triggered',
            'db_trigger',
            jsonb_build_object(
                'trigger_id', v_trigger.id,
                'trigger_name', v_trigger.name,
                'stage_id', NEW.pipeline_stage_id,
                'execute_at', v_execute_at
            ),
            'queued_for_processing'
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
