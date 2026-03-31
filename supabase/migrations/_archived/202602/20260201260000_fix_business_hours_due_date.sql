-- ============================================================================
-- FIX: CALCULAR DATA DE VENCIMENTO RESPEITANDO HORÁRIO COMERCIAL
-- ============================================================================
-- Problema: A função execute_cadence_entry_rule_immediate calcula v_due_date
-- simplesmente somando minutos ao NOW(), ignorando business_hours_start,
-- business_hours_end e allowed_weekdays.
--
-- Solução: Criar função que calcula a data de vencimento respeitando
-- as configurações de horário comercial do trigger.
-- ============================================================================

-- ============================================================================
-- PARTE 1: FUNÇÃO PARA CALCULAR DATA/HORA RESPEITANDO HORÁRIO COMERCIAL
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_business_due_date(
    p_from_date TIMESTAMPTZ,
    p_delay_minutes INTEGER,
    p_business_start INTEGER DEFAULT 9,
    p_business_end INTEGER DEFAULT 18,
    p_allowed_weekdays INTEGER[] DEFAULT ARRAY[1,2,3,4,5]
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    v_result TIMESTAMPTZ;
    v_remaining_minutes INTEGER;
    v_current_hour INTEGER;
    v_current_weekday INTEGER;
    v_minutes_until_end INTEGER;
    v_sp_offset INTERVAL := '-3 hours'; -- America/Sao_Paulo (UTC-3)
BEGIN
    -- Converter para horário de São Paulo
    v_result := p_from_date AT TIME ZONE 'America/Sao_Paulo';
    v_remaining_minutes := p_delay_minutes;

    -- Se delay é 0, ainda precisamos garantir que está em horário comercial
    IF v_remaining_minutes <= 0 THEN
        v_remaining_minutes := 0;
    END IF;

    WHILE v_remaining_minutes >= 0 LOOP
        -- Obter dia da semana (1=Seg, ..., 7=Dom)
        -- EXTRACT(DOW) retorna 0=Dom, 1=Seg, ..., 6=Sáb
        v_current_weekday := CASE EXTRACT(DOW FROM v_result)
            WHEN 0 THEN 7  -- Domingo = 7
            ELSE EXTRACT(DOW FROM v_result)::INTEGER
        END;

        -- Se não é dia permitido, avançar para próximo dia às business_start
        IF NOT (v_current_weekday = ANY(p_allowed_weekdays)) THEN
            v_result := (v_result::DATE + INTERVAL '1 day')::TIMESTAMP
                        + (p_business_start || ' hours')::INTERVAL;
            CONTINUE;
        END IF;

        v_current_hour := EXTRACT(HOUR FROM v_result)::INTEGER;

        -- Se antes do horário comercial, ajustar para início
        IF v_current_hour < p_business_start THEN
            v_result := v_result::DATE::TIMESTAMP + (p_business_start || ' hours')::INTERVAL;
            v_current_hour := p_business_start;
        END IF;

        -- Se depois do horário comercial, ir para próximo dia
        IF v_current_hour >= p_business_end THEN
            v_result := (v_result::DATE + INTERVAL '1 day')::TIMESTAMP
                        + (p_business_start || ' hours')::INTERVAL;
            CONTINUE;
        END IF;

        -- Calcular minutos restantes até fim do expediente
        v_minutes_until_end := (p_business_end - v_current_hour) * 60
                              - EXTRACT(MINUTE FROM v_result)::INTEGER;

        IF v_remaining_minutes <= v_minutes_until_end THEN
            -- Cabe no dia atual
            v_result := v_result + (v_remaining_minutes || ' minutes')::INTERVAL;
            v_remaining_minutes := -1; -- Sair do loop
        ELSE
            -- Não cabe, consumir o que dá e continuar no próximo dia
            v_remaining_minutes := v_remaining_minutes - v_minutes_until_end;
            v_result := (v_result::DATE + INTERVAL '1 day')::TIMESTAMP
                        + (p_business_start || ' hours')::INTERVAL;
        END IF;
    END LOOP;

    -- Converter de volta para UTC
    RETURN v_result AT TIME ZONE 'America/Sao_Paulo';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================================
-- PARTE 2: ATUALIZAR FUNÇÃO DE EXECUÇÃO IMEDIATA PARA USAR BUSINESS HOURS
-- ============================================================================

CREATE OR REPLACE FUNCTION execute_cadence_entry_rule_immediate(
    p_card_id UUID,
    p_trigger_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_trigger RECORD;
    v_card RECORD;
    v_task_id UUID;
    v_due_date TIMESTAMPTZ;
    v_existing_task RECORD;
BEGIN
    -- Buscar o trigger
    SELECT * INTO v_trigger FROM cadence_event_triggers WHERE id = p_trigger_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Trigger not found');
    END IF;

    -- Buscar o card
    SELECT * INTO v_card FROM cards WHERE id = p_card_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Card not found');
    END IF;

    -- Se action = create_task, criar tarefa diretamente
    IF v_trigger.action_type = 'create_task' THEN
        -- Verificar duplicata
        SELECT * INTO v_existing_task
        FROM tarefas
        WHERE card_id = p_card_id
        AND tipo = COALESCE(v_trigger.task_config->>'tipo', 'contato')
        AND concluida = false
        LIMIT 1;

        IF FOUND THEN
            -- Log skip
            INSERT INTO cadence_event_log (card_id, event_type, event_source, event_data, action_taken)
            VALUES (p_card_id, 'entry_rule_task_skipped', 'db_immediate',
                jsonb_build_object('trigger_id', p_trigger_id, 'reason', 'existing_uncompleted_task'),
                'skip_duplicate');
            RETURN jsonb_build_object('skipped', true, 'reason', 'existing_uncompleted_task');
        END IF;

        -- =====================================================================
        -- CALCULAR DATA DE VENCIMENTO RESPEITANDO HORÁRIO COMERCIAL
        -- =====================================================================
        IF v_trigger.delay_type = 'business' THEN
            -- Usar função que respeita horário comercial
            v_due_date := calculate_business_due_date(
                NOW(),
                COALESCE(v_trigger.delay_minutes, 5),
                COALESCE(v_trigger.business_hours_start, 9),
                COALESCE(v_trigger.business_hours_end, 18),
                COALESCE(v_trigger.allowed_weekdays, ARRAY[1,2,3,4,5])
            );
        ELSE
            -- Calendário corrido - apenas soma os minutos
            v_due_date := NOW() + (COALESCE(v_trigger.delay_minutes, 5) || ' minutes')::INTERVAL;
        END IF;
        -- =====================================================================

        -- Criar tarefa
        INSERT INTO tarefas (
            card_id,
            tipo,
            titulo,
            descricao,
            responsavel_id,
            prioridade,
            data_vencimento,
            metadata
        ) VALUES (
            p_card_id,
            COALESCE(v_trigger.task_config->>'tipo', 'contato'),
            COALESCE(v_trigger.task_config->>'titulo', 'Tarefa Automática'),
            COALESCE(v_trigger.task_config->>'descricao', ''),
            v_card.dono_atual_id,
            CASE
                WHEN v_trigger.task_config->>'prioridade' IN ('high', 'alta') THEN 'alta'
                WHEN v_trigger.task_config->>'prioridade' IN ('medium', 'media') THEN 'media'
                WHEN v_trigger.task_config->>'prioridade' IN ('low', 'baixa') THEN 'baixa'
                ELSE 'alta'
            END,
            v_due_date,
            jsonb_build_object(
                'created_by_trigger', p_trigger_id,
                'trigger_name', v_trigger.name,
                'immediate', true,
                'business_hours_applied', v_trigger.delay_type = 'business',
                'business_hours_config', jsonb_build_object(
                    'start', COALESCE(v_trigger.business_hours_start, 9),
                    'end', COALESCE(v_trigger.business_hours_end, 18),
                    'weekdays', COALESCE(v_trigger.allowed_weekdays, ARRAY[1,2,3,4,5])
                )
            )
        )
        RETURNING id INTO v_task_id;

        -- Log success
        INSERT INTO cadence_event_log (card_id, event_type, event_source, event_data, action_taken, action_result)
        VALUES (p_card_id, 'entry_rule_task_created', 'db_immediate',
            jsonb_build_object(
                'trigger_id', p_trigger_id,
                'trigger_name', v_trigger.name,
                'delay_type', v_trigger.delay_type,
                'delay_minutes', v_trigger.delay_minutes,
                'due_date', v_due_date
            ),
            'create_task', jsonb_build_object('task_id', v_task_id));

        RETURN jsonb_build_object('success', true, 'task_id', v_task_id, 'due_date', v_due_date);
    END IF;

    -- Se action = start_cadence, ainda usa a fila (Edge Function processa)
    RETURN jsonb_build_object('action', 'start_cadence', 'queued', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMENTÁRIO PARA DOCUMENTAÇÃO
-- ============================================================================
COMMENT ON FUNCTION calculate_business_due_date IS
'Calcula a data/hora de vencimento respeitando horário comercial.
Parâmetros:
- p_from_date: Data/hora de partida
- p_delay_minutes: Minutos de delay a adicionar (em horário útil)
- p_business_start: Hora de início do expediente (default: 9)
- p_business_end: Hora de fim do expediente (default: 18)
- p_allowed_weekdays: Dias da semana permitidos (1=Seg,...,7=Dom, default: [1,2,3,4,5])

Exemplo: Se chamado sexta às 22h com delay de 30 min e horário comercial 9-18 seg-sex,
retorna segunda às 9:30.';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
