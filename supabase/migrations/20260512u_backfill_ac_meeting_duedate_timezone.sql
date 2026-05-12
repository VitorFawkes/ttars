-- ============================================================================
-- Backfill: tarefas do AC com data_vencimento sem timezone correto
-- ============================================================================
-- integration-process lia 'task[duedate]' (naive, sem timezone) e tratava
-- como UTC. AC manda na verdade no fuso da conta (-05:00). Resultado:
-- data_vencimento ficava 5h adiantado em relacao ao real horario marcado.
--
-- Fix do codigo: agora le 'task[duedate_iso]' primeiro. Este backfill
-- corrige as tarefas existentes do AC olhando o payload original em
-- integration_events.
--
-- So toca tarefas reuniao* do AC. Idempotente: usa o ISO do payload e
-- ignora se nao encontrar o evento original.
-- ============================================================================

WITH ac_events AS (
    SELECT
        (payload->>'task[id]')::TEXT AS ac_task_id,
        (payload->>'task[duedate_iso]')::TIMESTAMPTZ AS due_iso,
        ROW_NUMBER() OVER (PARTITION BY payload->>'task[id]' ORDER BY created_at DESC) AS rn
    FROM public.integration_events
    WHERE event_type IN ('deal_task_add','deal_task_update')
      AND payload ? 'task[duedate_iso]'
      AND payload->>'task[duedate_iso]' IS NOT NULL
      AND payload->>'task[duedate_iso]' <> ''
)
UPDATE public.tarefas t
SET data_vencimento = e.due_iso
FROM ac_events e
WHERE e.rn = 1
  AND t.external_source = 'active_campaign'
  AND t.external_id = e.ac_task_id
  AND t.tipo IN ('reuniao','reuniao_video','reuniao_presencial','reuniao_telefone')
  AND t.deleted_at IS NULL
  AND t.data_vencimento IS DISTINCT FROM e.due_iso;
