-- ============================================================================
-- CADENCE ENGINE - PROCESSAMENTO DIRETO NO BANCO
-- ============================================================================
-- Problema: Os triggers inserem na fila, mas a Edge Function não é chamada.
-- Solução: Processar a tarefa DIRETAMENTE no trigger, sem depender de fila.
--
-- Fluxo:
-- 1. Card criado → trigger detecta
-- 2. Trigger busca regras aplicáveis
-- 3. Trigger cria a tarefa IMEDIATAMENTE (se action=create_task)
-- 4. Ou insere na fila para cadência (se action=start_cadence)
-- ============================================================================

-- ============================================================================
-- PARTE 1: FUNÇÃO PARA CRIAR TAREFA DIRETAMENTE
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

        -- Calcular data de vencimento
        v_due_date := NOW() + (COALESCE(v_trigger.delay_minutes, 5) || ' minutes')::INTERVAL;

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
            jsonb_build_object('created_by_trigger', p_trigger_id, 'trigger_name', v_trigger.name, 'immediate', true)
        )
        RETURNING id INTO v_task_id;

        -- Log success
        INSERT INTO cadence_event_log (card_id, event_type, event_source, event_data, action_taken, action_result)
        VALUES (p_card_id, 'entry_rule_task_created', 'db_immediate',
            jsonb_build_object('trigger_id', p_trigger_id, 'trigger_name', v_trigger.name),
            'create_task', jsonb_build_object('task_id', v_task_id));

        RETURN jsonb_build_object('success', true, 'task_id', v_task_id);
    END IF;

    -- Se action = start_cadence, ainda usa a fila (Edge Function processa)
    -- Isso já está sendo feito pelo trigger existente
    RETURN jsonb_build_object('action', 'start_cadence', 'queued', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PARTE 2: ATUALIZAR TRIGGER DE CRIAÇÃO DE CARD PARA EXECUÇÃO IMEDIATA
-- ============================================================================

CREATE OR REPLACE FUNCTION process_cadence_entry_on_card_create()
RETURNS TRIGGER AS $$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_result JSONB;
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
        -- EXECUÇÃO IMEDIATA para create_task
        IF v_trigger.action_type = 'create_task' THEN
            v_result := execute_cadence_entry_rule_immediate(NEW.id, v_trigger.id);
            RAISE NOTICE '[Cadence] Immediate execution result: %', v_result;

        -- ENFILEIRAR para start_cadence (Edge Function processa)
        ELSIF v_trigger.action_type = 'start_cadence' THEN
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
                CASE
                    WHEN v_trigger.delay_minutes = 0 THEN NOW()
                    ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL
                END
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PARTE 3: ATUALIZAR TRIGGER DE MUDANÇA DE STAGE
-- ============================================================================

CREATE OR REPLACE FUNCTION process_cadence_entry_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_result JSONB;
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
            -- EXECUÇÃO IMEDIATA para create_task
            IF v_trigger.action_type = 'create_task' THEN
                v_result := execute_cadence_entry_rule_immediate(NEW.id, v_trigger.id);
                RAISE NOTICE '[Cadence] Immediate execution result: %', v_result;

            -- ENFILEIRAR para start_cadence
            ELSIF v_trigger.action_type = 'start_cadence' THEN
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
                    CASE
                        WHEN v_trigger.delay_minutes = 0 THEN NOW()
                        ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL
                    END
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

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
