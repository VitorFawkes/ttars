-- ============================================================
-- MIGRATION: Automações — novo gatilho 'task_completed'
-- Date: 2026-06-09
--
-- Adiciona o event_type 'task_completed' ao sistema de automações:
-- dispara quando uma tarefa (ex: reunião) é marcada como concluída.
--
-- Como cadence_event_triggers.event_type não tem CHECK constraint, basta
-- criar o DB trigger e enfileirar em cadence_entry_queue. O cadence-engine
-- consome por action_type (já funciona com qualquer event_type novo).
--
-- Filtros suportados em event_config:
--   - task_tipo (opcional): casa NEW.tipo. Valor 'reuniao' casa todas as
--     variantes (reuniao, reuniao_video, reuniao_presencial, reuniao_telefone)
--     via LIKE 'reuniao%'. NULL/'' = qualquer tipo.
--   - outcome (opcional): casa COALESCE(NEW.outcome, NEW.resultado).
--     NULL/''/'qualquer' = qualquer resultado.
--   - applicable_pipeline_ids (opcional): casa o pipeline_id do card.
--
-- Regra de negócio: REAGENDAMENTO NÃO DISPARA. Marcar uma reunião como
-- reagendada conclui a tarefa antiga tecnicamente (concluida=true), mas a
-- reunião não aconteceu — então pulamos quando status='reagendada' ou
-- rescheduled_to_id está populado.
--
-- Anti-loop: a ação complete_task pode concluir outra tarefa e re-disparar
-- este gatilho. A dedup por (card_id, trigger_id) pendente limita o flood,
-- e o filtro task_tipo normalmente restringe a reuniões (a tarefa concluída
-- por complete_task costuma ser de outro tipo).
--
-- event_data enfileirado (variáveis disponíveis nas ações):
--   tarefa_id, tarefa_tipo, tarefa_titulo, tarefa_data_vencimento,
--   tarefa_outcome, tarefa_feedback
--
-- Idempotente: pode ser rodada múltiplas vezes.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION process_cadence_entry_on_task_completed()
RETURNS TRIGGER AS $fn$
DECLARE
    v_trigger        RECORD;
    v_card_org_id    UUID;
    v_card_pipeline_id UUID;
    v_task_tipo      TEXT;
    v_outcome_filter TEXT;
    v_task_outcome   TEXT;
    v_pending_count  INT;
    v_result         JSONB;
BEGIN
    -- Guard de reagendamento: marcar como reagendada conclui a tarefa antiga
    -- mas a reunião não aconteceu — não dispara.
    IF NEW.status = 'reagendada' OR NEW.rescheduled_to_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Tarefa precisa pertencer a um card (variáveis e dedup dependem disso).
    IF NEW.card_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Org + pipeline do card (fonte de verdade pro org_id da fila).
    SELECT org_id, pipeline_id INTO v_card_org_id, v_card_pipeline_id
        FROM cards WHERE id = NEW.card_id;
    IF v_card_org_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_task_outcome := COALESCE(NEW.outcome, NEW.resultado);

    FOR v_trigger IN
        SELECT * FROM cadence_event_triggers
        WHERE event_type = 'task_completed' AND is_active = true
          AND (applicable_pipeline_ids IS NULL
               OR array_length(applicable_pipeline_ids, 1) IS NULL
               OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
    LOOP
        -- Filtro: tipo de tarefa
        v_task_tipo := NULLIF(v_trigger.event_config->>'task_tipo', '');
        IF v_task_tipo IS NOT NULL THEN
            IF v_task_tipo = 'reuniao' THEN
                IF COALESCE(NEW.tipo, '') NOT LIKE 'reuniao%' THEN
                    CONTINUE;
                END IF;
            ELSIF COALESCE(NEW.tipo, '') <> v_task_tipo THEN
                CONTINUE;
            END IF;
        END IF;

        -- Filtro: resultado (outcome). 'qualquer'/null = sem filtro.
        v_outcome_filter := NULLIF(v_trigger.event_config->>'outcome', '');
        IF v_outcome_filter IS NOT NULL AND v_outcome_filter <> 'qualquer' THEN
            IF COALESCE(v_task_outcome, '') <> v_outcome_filter THEN
                CONTINUE;
            END IF;
        END IF;

        -- create_task executa imediatamente (mesmo padrão dos outros triggers).
        IF v_trigger.action_type = 'create_task' THEN
            v_result := execute_cadence_entry_rule_immediate(NEW.card_id, v_trigger.id);
            CONTINUE;
        END IF;

        -- Dedup: já tem fila pendente pra este card+trigger?
        SELECT COUNT(*) INTO v_pending_count
        FROM cadence_entry_queue
        WHERE card_id = NEW.card_id
          AND trigger_id = v_trigger.id
          AND status = 'pending';
        IF v_pending_count > 0 THEN
            CONTINUE;
        END IF;

        INSERT INTO cadence_entry_queue (
            card_id, trigger_id, event_type, event_data, execute_at, org_id, status
        )
        VALUES (
            NEW.card_id,
            v_trigger.id,
            'task_completed',
            jsonb_build_object(
                'tarefa_id', NEW.id,
                'tarefa_tipo', NEW.tipo,
                'tarefa_titulo', NEW.titulo,
                'tarefa_data_vencimento', NEW.data_vencimento,
                'tarefa_outcome', v_task_outcome,
                'tarefa_feedback', NEW.feedback
            ),
            CASE
                WHEN COALESCE(v_trigger.delay_minutes, 0) = 0 THEN NOW()
                ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL
            END,
            v_card_org_id,
            'pending'
        );

        INSERT INTO cadence_event_log (card_id, event_type, event_source, event_data, action_taken)
        VALUES (NEW.card_id, 'entry_rule_triggered', 'db_trigger',
            jsonb_build_object(
                'trigger_id', v_trigger.id,
                'trigger_name', v_trigger.name,
                'tarefa_id', NEW.id,
                'tarefa_tipo', NEW.tipo,
                'tarefa_outcome', v_task_outcome
            ),
            'queued_for_processing');
    END LOOP;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cadence_entry_on_task_completed ON tarefas;
CREATE TRIGGER trg_cadence_entry_on_task_completed
    AFTER UPDATE ON tarefas
    FOR EACH ROW
    WHEN (NEW.concluida = true AND OLD.concluida IS DISTINCT FROM true)
    EXECUTE FUNCTION process_cadence_entry_on_task_completed();

COMMENT ON FUNCTION process_cadence_entry_on_task_completed() IS
    'Enfileira automações de task_completed quando uma tarefa vira concluída. Reagendamento não dispara. Filtros: task_tipo (reuniao=todas variantes), outcome, applicable_pipeline_ids.';

COMMIT;
