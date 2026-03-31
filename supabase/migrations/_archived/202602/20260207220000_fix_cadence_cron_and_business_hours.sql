-- ============================================================================
-- FIX: Cadência - Tarefas não sendo criadas + Business Hours
-- ============================================================================
-- Problemas encontrados:
-- 1. Migration de execução imediata não foi aplicada (trigger antigo enfileira tudo)
-- 2. Sem pg_cron para cadence-engine (fila nunca processada)
-- 3. Cálculo de data_vencimento ignora business hours
--
-- Esta migration:
-- A) Cria função calculate_business_due_date() em SQL puro
-- B) Recria execute_cadence_entry_rule_immediate() com business hours
-- C) Recria triggers para execução imediata de create_task
-- D) Adiciona pg_cron para cadence-engine
-- E) Processa items pendentes na fila (backfill)
-- ============================================================================

-- ============================================================================
-- PRE-FLIGHT CHECKS
-- ============================================================================
DO $$
BEGIN
    -- Verificar pg_cron
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE EXCEPTION 'pg_cron extension not found. Run: CREATE EXTENSION IF NOT EXISTS pg_cron;';
    END IF;

    -- Verificar pg_net
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        RAISE EXCEPTION 'pg_net extension not found. Run: CREATE EXTENSION IF NOT EXISTS pg_net;';
    END IF;

    RAISE NOTICE 'Pre-flight checks passed: pg_cron and pg_net are available';
END $$;

-- ============================================================================
-- PARTE 1: FUNÇÃO DE CÁLCULO DE BUSINESS HOURS EM SQL
-- ============================================================================
-- Equivalente à calculateBusinessTime() do TypeScript no cadence-engine
-- Lógica: distribui minutos apenas em dias/horas úteis, pulando FDS e fora do horário

CREATE OR REPLACE FUNCTION calculate_business_due_date(
    p_from TIMESTAMPTZ,
    p_delay_minutes INT,
    p_delay_type TEXT DEFAULT 'business',
    p_bh_start INT DEFAULT 9,
    p_bh_end INT DEFAULT 18,
    p_allowed_weekdays INT[] DEFAULT '{1,2,3,4,5}'
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
    v_local TIMESTAMP;
    v_remaining INT;
    v_day_of_week INT;  -- 1=Seg, 7=Dom (ISO)
    v_start_of_biz TIMESTAMP;
    v_end_of_biz TIMESTAMP;
    v_minutes_available INT;
BEGIN
    -- Calendário: simplesmente soma minutos
    IF p_delay_type = 'calendar' OR p_delay_type IS NULL THEN
        RETURN p_from + (p_delay_minutes || ' minutes')::INTERVAL;
    END IF;

    -- Business: distribuir minutos em horário comercial
    v_local := p_from AT TIME ZONE 'America/Sao_Paulo';
    v_remaining := p_delay_minutes;

    -- Se delay = 0, apenas ajustar para próximo horário útil
    IF v_remaining <= 0 THEN
        v_remaining := 0;
    END IF;

    -- Loop: consumir minutos em dias úteis
    LOOP
        -- Dia da semana ISO (1=Seg, 7=Dom)
        v_day_of_week := EXTRACT(ISODOW FROM v_local);

        -- Pular dias não permitidos
        WHILE NOT (v_day_of_week = ANY(p_allowed_weekdays)) LOOP
            v_local := date_trunc('day', v_local) + INTERVAL '1 day' + (p_bh_start || ' hours')::INTERVAL;
            v_day_of_week := EXTRACT(ISODOW FROM v_local);
        END LOOP;

        -- Início e fim do horário comercial de hoje
        v_start_of_biz := date_trunc('day', v_local) + (p_bh_start || ' hours')::INTERVAL;
        v_end_of_biz := date_trunc('day', v_local) + (p_bh_end || ' hours')::INTERVAL;

        -- Se antes do horário comercial, ajustar para início
        IF v_local < v_start_of_biz THEN
            v_local := v_start_of_biz;
        END IF;

        -- Se depois do horário comercial, ir para próximo dia
        IF v_local >= v_end_of_biz THEN
            v_local := date_trunc('day', v_local) + INTERVAL '1 day' + (p_bh_start || ' hours')::INTERVAL;
            CONTINUE;
        END IF;

        -- Se não tem mais minutos a distribuir, terminamos
        IF v_remaining <= 0 THEN
            EXIT;
        END IF;

        -- Calcular minutos disponíveis até o fim do expediente
        v_minutes_available := EXTRACT(EPOCH FROM (v_end_of_biz - v_local))::INT / 60;

        IF v_remaining <= v_minutes_available THEN
            -- Cabe hoje
            v_local := v_local + (v_remaining || ' minutes')::INTERVAL;
            v_remaining := 0;
        ELSE
            -- Consome o restante do dia e avança
            v_remaining := v_remaining - v_minutes_available;
            v_local := date_trunc('day', v_local) + INTERVAL '1 day' + (p_bh_start || ' hours')::INTERVAL;
        END IF;
    END LOOP;

    -- Converter de volta para UTC
    RETURN v_local AT TIME ZONE 'America/Sao_Paulo';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calculate_business_due_date IS
'Calcula data de vencimento respeitando horário comercial e dias úteis.
Equivalente à calculateBusinessTime() do TypeScript no cadence-engine.
Exemplos:
  - Sexta 17h + 120min business → Segunda 10h (pula FDS)
  - Sábado 14h + 5min business → Segunda 9:05 (pula FDS, começa no horário)
  - Terça 10h + 5min calendar → Terça 10:05 (ignora business hours)';

-- ============================================================================
-- PARTE 2: RECRIAR execute_cadence_entry_rule_immediate() COM BUSINESS HOURS
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
        -- Verificar duplicata (anti-spam)
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
                jsonb_build_object(
                    'trigger_id', p_trigger_id,
                    'trigger_name', v_trigger.name,
                    'reason', 'existing_uncompleted_task',
                    'existing_task_id', v_existing_task.id
                ),
                'skip_duplicate');
            RETURN jsonb_build_object('skipped', true, 'reason', 'existing_uncompleted_task');
        END IF;

        -- Calcular data de vencimento RESPEITANDO business hours
        v_due_date := calculate_business_due_date(
            NOW(),
            COALESCE(v_trigger.delay_minutes, 5),
            COALESCE(v_trigger.delay_type, 'business'),
            COALESCE(v_trigger.business_hours_start, 9),
            COALESCE(v_trigger.business_hours_end, 18),
            COALESCE(v_trigger.allowed_weekdays, ARRAY[1,2,3,4,5])
        );

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
                'created_at_stage_id', v_card.pipeline_stage_id
            )
        )
        RETURNING id INTO v_task_id;

        -- Log success
        INSERT INTO cadence_event_log (card_id, event_type, event_source, event_data, action_taken, action_result)
        VALUES (p_card_id, 'entry_rule_task_created', 'db_immediate',
            jsonb_build_object('trigger_id', p_trigger_id, 'trigger_name', v_trigger.name),
            'create_task', jsonb_build_object('task_id', v_task_id, 'due_date', v_due_date));

        RETURN jsonb_build_object('success', true, 'task_id', v_task_id, 'due_date', v_due_date);
    END IF;

    -- Se action = start_cadence, ainda usa a fila (Edge Function processa)
    RETURN jsonb_build_object('action', 'start_cadence', 'queued', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PARTE 3: RECRIAR TRIGGER DE CRIAÇÃO DE CARD (EXECUÇÃO IMEDIATA)
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
-- PARTE 4: RECRIAR TRIGGER DE MUDANÇA DE STAGE (EXECUÇÃO IMEDIATA)
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
-- PARTE 5: PG_CRON PARA CADENCE-ENGINE
-- ============================================================================
-- Chama a Edge Function a cada 2 minutos para processar:
-- - cadence_queue (steps de cadências ativas)
-- - cadence_entry_queue (regras start_cadence pendentes)

SELECT cron.schedule(
    'process-cadence-engine',
    '*/2 * * * *',
    $$
    SELECT net.http_post(
        url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/cadence-engine',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
                SELECT decrypted_secret
                FROM vault.decrypted_secrets
                WHERE name = 'service_role_key'
                LIMIT 1
            )
        ),
        body := '{}'::jsonb
    ) AS request_id;
    $$
);

-- ============================================================================
-- PARTE 6: PROCESSAR ITEMS PENDENTES NA ENTRY QUEUE (BACKFILL)
-- ============================================================================
-- Os items com action_type='create_task' que ficaram presos na fila
-- serão processados imediatamente agora

DO $$
DECLARE
    v_item RECORD;
    v_trigger RECORD;
    v_result JSONB;
    v_count INT := 0;
BEGIN
    FOR v_item IN
        SELECT eq.*, cet.action_type
        FROM cadence_entry_queue eq
        JOIN cadence_event_triggers cet ON cet.id = eq.trigger_id
        WHERE eq.status = 'pending'
        AND cet.action_type = 'create_task'
        ORDER BY eq.created_at ASC
    LOOP
        -- Executar imediatamente
        v_result := execute_cadence_entry_rule_immediate(v_item.card_id, v_item.trigger_id);

        -- Marcar como processado
        UPDATE cadence_entry_queue
        SET status = 'completed', processed_at = NOW()
        WHERE id = v_item.id;

        v_count := v_count + 1;
        RAISE NOTICE '[Backfill] Processado item % para card %: %', v_item.id, v_item.card_id, v_result;
    END LOOP;

    RAISE NOTICE '==========================================';
    RAISE NOTICE 'BACKFILL: % items create_task processados', v_count;
    RAISE NOTICE '==========================================';
END $$;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
