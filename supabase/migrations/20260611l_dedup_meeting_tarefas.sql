-- ═══════════════════════════════════════════════════════════════════════════
-- Dedup de tarefas de reunião (uma reunião por card por horário)
-- ═══════════════════════════════════════════════════════════════════════════
-- Problema: a mesma reunião de SDR era criada por DOIS sistemas que não se
-- enxergam — a cadência do CRM (tarefa "Reuniao SDR", external_source NULL) e a
-- sincronização do ActiveCampaign ("ReuniãoSDR", external_source='active_campaign').
-- Além disso o AC às vezes manda 2 deal_tasks ~0,2s apart pro mesmo deal, furando
-- o dedup SELECT-depois-INSERT não-atômico do integration-process.
--
-- Resultado: até 3 cópias da mesma reunião na "Agenda & Tarefas" do card.
--
-- Decisão de produto: a tarefa da cadência é a oficial; o AC para de duplicar.
-- A invariante de dados passa a ser: uma reunião ativa por (card_id, horário).
--
-- Espelha o padrão de 20260506h_tarefas_dedup_hardening.sql (cleanup → índice
-- único parcial → RPC de smoke test).
-- ═══════════════════════════════════════════════════════════════════════════


-- ─── 1. Limpeza das duplicatas existentes (soft-delete) ────────────────────
-- Para cada grupo (card_id, data_vencimento) de reuniões ativas, mantém UMA:
--   prioridade 1) tarefa da cadência/manual (external_source NULL ou metadata
--                 com cadence_step_id) — é a dona oficial da reunião
--   prioridade 2) created_at mais antigo (estável)
-- As demais ganham deleted_at = now().
--
-- Seguro para o ActiveCampaign: o trigger log_outbound_tarefa_event tem guard
-- (NEW.deleted_at IS NOT NULL → RETURN), então o soft-delete NÃO enfileira
-- evento outbound nem mexe no AC. O cascade tarefas_cascade_soft_delete_atendimento
-- (soft-delete do atendimento concierge vinculado) é desejado.
DO $cleanup$
DECLARE
    v_cleaned bigint;
BEGIN
    WITH ranked AS (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY card_id, data_vencimento
                ORDER BY
                    (CASE WHEN external_source IS NULL OR metadata ? 'cadence_step_id'
                          THEN 0 ELSE 1 END),
                    created_at ASC,
                    id ASC
            ) AS rn
        FROM public.tarefas
        WHERE tipo LIKE 'reuniao%'
          AND deleted_at IS NULL
          AND rescheduled_from_id IS NULL
          AND data_vencimento IS NOT NULL
    )
    UPDATE public.tarefas t
    SET deleted_at = now()
    FROM ranked
    WHERE t.id = ranked.id
      AND ranked.rn > 1;

    GET DIAGNOSTICS v_cleaned = ROW_COUNT;
    RAISE NOTICE 'Dedup de reuniões: % tarefas duplicadas soft-deletadas', v_cleaned;
END
$cleanup$;


-- ─── 2. UNIQUE INDEX parcial (backstop atômico contra a corrida) ────────────
-- Sem CONCURRENTLY porque o endpoint /database/query roda em transação e a
-- tabela é pequena (~3.6k linhas, lock dura milissegundos), igual ao índice
-- tarefas_unique_cadence_step.
CREATE UNIQUE INDEX IF NOT EXISTS tarefas_unique_meeting_slot
ON public.tarefas (card_id, data_vencimento)
WHERE tipo LIKE 'reuniao%'
  AND deleted_at IS NULL
  AND rescheduled_from_id IS NULL
  AND data_vencimento IS NOT NULL;

COMMENT ON INDEX public.tarefas_unique_meeting_slot IS
'Garante no máximo UMA reunião ativa por (card, horário), independente da origem '
'(cadência, ActiveCampaign ou manual). Quem grava primeiro vence; a 2ª inserção '
'recebe 23505 e é tratada como duplicata por integration-process e cadence-engine. '
'Exclui reagendadas (rescheduled_from_id NOT NULL).';


-- ─── 3. RPC para smoke test ─────────────────────────────────────────────────
-- Quantidade de grupos (card, horário) com 2+ reuniões ativas. Esperado: 0.
CREATE OR REPLACE FUNCTION public.meeting_tarefas_duplicates_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::bigint
    FROM (
        SELECT 1
        FROM public.tarefas
        WHERE tipo LIKE 'reuniao%'
          AND deleted_at IS NULL
          AND rescheduled_from_id IS NULL
          AND data_vencimento IS NOT NULL
        GROUP BY card_id, data_vencimento
        HAVING COUNT(*) > 1
    ) dup;
$$;

GRANT EXECUTE ON FUNCTION public.meeting_tarefas_duplicates_count() TO authenticated, anon, service_role;
