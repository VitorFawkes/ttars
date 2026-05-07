-- ============================================================================
-- MIGRATION: Hardening da prevenção de tarefas duplicadas de cadência
-- Date: 2026-05-06
--
-- PROBLEMA:
-- O trigger BEFORE INSERT prevent_duplicate_cadence_tarefa (migration
-- 20260424e) tem race condition: dois INSERTs concorrentes em milissegundos
-- ambos executam o EXISTS antes de qualquer um ficar visível, e ambos
-- passam. Caso real: card e54bfc13... gerou 2 tarefas "Liberar App" em 9ms.
-- O hardcoded em 4 títulos também só cobre uma cadência.
--
-- SOLUÇÃO:
-- 1. Limpeza retroativa generalizada — para qualquer (card_id, cadence_step_id,
--    cadence_instance_id) com 2+ tarefas ativas, mantém a mais antiga,
--    transfere concluida=true se alguma estava feita, soft-deleta o resto.
-- 2. Drop do trigger frágil — substituído por garantia atômica no banco.
-- 3. UNIQUE INDEX parcial — a chave (card_id, cadence_step_id, cadence_instance_id)
--    é unique entre tarefas ativas e não-reagendadas. Lock atômico previne
--    race condition. Cobre toda cadência, não só 4 títulos.
--
-- O índice exclui tarefas reagendadas (rescheduled_from_id IS NOT NULL)
-- para não bloquear o fluxo de reschedule, que cria tarefa nova com mesmo
-- metadata e marca a antiga como concluida=true depois.
-- ============================================================================

-- ─── 1. Limpeza retroativa ────────────────────────────────────────────────

DO $cleanup$
DECLARE
    v_dup RECORD;
    v_keep_id UUID;
    v_any_done BOOLEAN;
    v_first_done_at TIMESTAMPTZ;
    v_cleaned INT := 0;
BEGIN
    FOR v_dup IN
        SELECT
            card_id,
            metadata->>'cadence_step_id' AS step_id,
            metadata->>'cadence_instance_id' AS instance_id
        FROM public.tarefas
        WHERE deleted_at IS NULL
          AND rescheduled_from_id IS NULL
          AND metadata ? 'cadence_step_id'
          AND metadata ? 'cadence_instance_id'
        GROUP BY card_id, metadata->>'cadence_step_id', metadata->>'cadence_instance_id'
        HAVING COUNT(*) > 1
    LOOP
        SELECT id INTO v_keep_id
        FROM public.tarefas
        WHERE card_id = v_dup.card_id
          AND metadata->>'cadence_step_id' = v_dup.step_id
          AND metadata->>'cadence_instance_id' = v_dup.instance_id
          AND deleted_at IS NULL
          AND rescheduled_from_id IS NULL
        ORDER BY created_at ASC
        LIMIT 1;

        SELECT BOOL_OR(concluida), MIN(concluida_em) FILTER (WHERE concluida)
        INTO v_any_done, v_first_done_at
        FROM public.tarefas
        WHERE card_id = v_dup.card_id
          AND metadata->>'cadence_step_id' = v_dup.step_id
          AND metadata->>'cadence_instance_id' = v_dup.instance_id
          AND deleted_at IS NULL
          AND rescheduled_from_id IS NULL;

        UPDATE public.tarefas
        SET concluida = true,
            concluida_em = COALESCE(concluida_em, v_first_done_at)
        WHERE id = v_keep_id AND v_any_done = true AND concluida = false;

        UPDATE public.tarefas
        SET deleted_at = NOW()
        WHERE card_id = v_dup.card_id
          AND metadata->>'cadence_step_id' = v_dup.step_id
          AND metadata->>'cadence_instance_id' = v_dup.instance_id
          AND deleted_at IS NULL
          AND rescheduled_from_id IS NULL
          AND id != v_keep_id;

        v_cleaned := v_cleaned + 1;
    END LOOP;

    RAISE NOTICE 'Limpeza generalizada de duplicatas: % grupos ajustados', v_cleaned;
END
$cleanup$;


-- ─── 2. Drop do trigger frágil ─────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_prevent_duplicate_cadence_tarefa ON public.tarefas;
DROP FUNCTION IF EXISTS public.prevent_duplicate_cadence_tarefa();


-- ─── 3. UNIQUE INDEX parcial ───────────────────────────────────────────────
-- Sem CONCURRENTLY porque o endpoint /database/query roda em transação e
-- a tabela tem ~3.6k linhas (lock dura milissegundos).

CREATE UNIQUE INDEX IF NOT EXISTS tarefas_unique_cadence_step
ON public.tarefas (
    card_id,
    (metadata->>'cadence_step_id'),
    (metadata->>'cadence_instance_id')
)
WHERE deleted_at IS NULL
  AND rescheduled_from_id IS NULL
  AND metadata ? 'cadence_step_id'
  AND metadata ? 'cadence_instance_id';

COMMENT ON INDEX public.tarefas_unique_cadence_step IS
'Garante que cada (card, step, instância) de cadência tenha no máximo uma '
'tarefa ativa. Substitui trigger BEFORE INSERT que tinha race condition. '
'Exclui tarefas reagendadas (rescheduled_from_id NOT NULL) que copiam '
'metadata da original.';


-- ─── 4. RPC para smoke test ─────────────────────────────────────────────────
-- Retorna a quantidade de grupos (card, step, instância) com 2+ tarefas
-- ativas. Esperado: 0. Se subir, há regressão na prevenção.

CREATE OR REPLACE FUNCTION public.cadence_tarefas_duplicates_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::bigint
    FROM (
        SELECT 1
        FROM public.tarefas
        WHERE deleted_at IS NULL
          AND rescheduled_from_id IS NULL
          AND metadata ? 'cadence_step_id'
          AND metadata ? 'cadence_instance_id'
        GROUP BY card_id, metadata->>'cadence_step_id', metadata->>'cadence_instance_id'
        HAVING COUNT(*) > 1
    ) dup;
$$;

GRANT EXECUTE ON FUNCTION public.cadence_tarefas_duplicates_count() TO authenticated, anon, service_role;
