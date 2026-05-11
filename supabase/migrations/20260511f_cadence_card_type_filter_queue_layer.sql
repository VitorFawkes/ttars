-- ============================================================================
-- MIGRATION: Filtra applicable_card_types nas DUAS pontas de execução
-- Date: 2026-05-11
--
-- Decisão arquitetural: NÃO recriar os 5 dispatchers (process_cadence_entry_*)
-- porque eles já foram regravados várias vezes e cada rebase tem risco de
-- reverter correções incrementais (memory: feedback_function_rebase_cuidado.md).
--
-- Em vez disso, aplica o filtro nas DUAS pontas onde a automação realmente
-- executa:
--
-- 1. **Caminho enfileirado** (action_type ∈ send_message, change_stage,
--    start_cadence, add_tag, remove_tag, notify_internal, update_field,
--    trigger_n8n_webhook): BEFORE INSERT trigger em cadence_entry_queue
--    valida card_type. Se não casa, marca a entrada como cancelled com motivo.
--
-- 2. **Caminho síncrono** (action_type = create_task): a função
--    execute_cadence_entry_rule_immediate, chamada inline pelos dispatchers,
--    valida card_type no topo e retorna { skipped: true } se não casa.
--
-- Trade-off: itens que não casam ainda são enfileirados/chamados, mas
-- terminam em cancelled/skipped — não viram tarefa nem mensagem. Custo
-- desprezível em volume real.
--
-- Vantagem: zero rebase dos 5 dispatchers (process_cadence_entry_on_*).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. BEFORE INSERT em cadence_entry_queue: filtro card_type
-- ============================================================================
CREATE OR REPLACE FUNCTION cadence_entry_queue_filter_card_type()
RETURNS TRIGGER AS $fn$
DECLARE
    v_applicable_card_types TEXT[];
    v_card_type TEXT;
BEGIN
    -- Curto-circuito: trigger sem filtro de card_type → libera passagem
    SELECT applicable_card_types INTO v_applicable_card_types
    FROM cadence_event_triggers
    WHERE id = NEW.trigger_id;

    IF v_applicable_card_types IS NULL OR array_length(v_applicable_card_types, 1) IS NULL THEN
        RETURN NEW;
    END IF;

    -- Busca card_type do card e compara
    SELECT card_type INTO v_card_type FROM cards WHERE id = NEW.card_id;

    IF v_card_type IS NULL OR NOT (v_card_type = ANY(v_applicable_card_types)) THEN
        -- Marca como cancelled com motivo legível, mas ainda insere a linha
        -- pra deixar rastro auditável (não deletar).
        NEW.status := 'cancelled';
        NEW.processed_at := NOW();
        NEW.last_error := 'card_type_filter_mismatch (card_type=' || COALESCE(v_card_type, 'NULL')
                            || ', applicable=' || array_to_string(v_applicable_card_types, ',') || ')';
    END IF;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cadence_entry_queue_filter_card_type ON cadence_entry_queue;
CREATE TRIGGER trg_cadence_entry_queue_filter_card_type
    BEFORE INSERT ON cadence_entry_queue
    FOR EACH ROW
    EXECUTE FUNCTION cadence_entry_queue_filter_card_type();

-- ============================================================================
-- 2. execute_cadence_entry_rule_immediate: early-return em card_type mismatch
--
-- Base: versão produtiva (migration arquivada 20260207220000) com adição de
-- early-return no topo. Função única, 0 migrations não-arquivadas anteriores
-- (warn-function-rebase.sh confere apenas o nível raiz de migrations/).
-- ============================================================================
CREATE OR REPLACE FUNCTION execute_cadence_entry_rule_immediate(
    p_card_id UUID,
    p_trigger_id UUID
)
RETURNS JSONB AS $fn$
DECLARE
    v_trigger RECORD;
    v_card RECORD;
    v_task_id UUID;
    v_due_date TIMESTAMPTZ;
    v_existing_task RECORD;
BEGIN
    -- Buscar trigger
    SELECT * INTO v_trigger FROM cadence_event_triggers WHERE id = p_trigger_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Trigger not found');
    END IF;

    -- Buscar card
    SELECT * INTO v_card FROM cards WHERE id = p_card_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Card not found');
    END IF;

    -- NOVO: filtro applicable_card_types — early-return se card_type não casa
    IF v_trigger.applicable_card_types IS NOT NULL
       AND array_length(v_trigger.applicable_card_types, 1) IS NOT NULL
       AND NOT (v_card.card_type = ANY(v_trigger.applicable_card_types))
    THEN
        INSERT INTO cadence_event_log (card_id, event_type, event_source, event_data, action_taken)
        VALUES (p_card_id, 'entry_rule_skipped_card_type', 'db_immediate',
            jsonb_build_object(
                'trigger_id', p_trigger_id,
                'trigger_name', v_trigger.name,
                'card_type', v_card.card_type,
                'applicable_card_types', v_trigger.applicable_card_types
            ),
            'skip_card_type_mismatch');
        RETURN jsonb_build_object('skipped', true, 'reason', 'card_type_mismatch');
    END IF;

    -- Se action = create_task, criar tarefa diretamente
    IF v_trigger.action_type = 'create_task' THEN
        SELECT * INTO v_existing_task
        FROM tarefas
        WHERE card_id = p_card_id
          AND tipo = COALESCE(v_trigger.task_config->>'tipo', 'contato')
          AND concluida = false
        LIMIT 1;

        IF FOUND THEN
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

        -- Data de vencimento respeitando business hours
        v_due_date := calculate_business_due_date(
            NOW(),
            COALESCE(v_trigger.delay_minutes, 5),
            COALESCE(v_trigger.delay_type, 'business'),
            COALESCE(v_trigger.business_hours_start, 9),
            COALESCE(v_trigger.business_hours_end, 18),
            COALESCE(v_trigger.allowed_weekdays, ARRAY[1,2,3,4,5])
        );

        INSERT INTO tarefas (
            card_id, tipo, titulo, descricao, responsavel_id,
            prioridade, data_vencimento, metadata
        )
        VALUES (
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

        INSERT INTO cadence_event_log (card_id, event_type, event_source, event_data, action_taken, action_result)
        VALUES (p_card_id, 'entry_rule_task_created', 'db_immediate',
            jsonb_build_object('trigger_id', p_trigger_id, 'trigger_name', v_trigger.name),
            'create_task',
            jsonb_build_object('task_id', v_task_id, 'due_date', v_due_date));

        RETURN jsonb_build_object('success', true, 'task_id', v_task_id, 'due_date', v_due_date);
    END IF;

    -- Outras action types: enfileiradas em cadence_entry_queue (filtro está no trigger BEFORE INSERT)
    RETURN jsonb_build_object('action', v_trigger.action_type, 'queued', true);
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

DO $$ BEGIN
    RAISE NOTICE 'Filtro applicable_card_types ativo nas duas pontas: cadence_entry_queue (BEFORE INSERT) e execute_cadence_entry_rule_immediate (early-return).';
END $$;
