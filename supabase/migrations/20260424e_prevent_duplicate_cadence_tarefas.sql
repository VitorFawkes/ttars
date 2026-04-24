-- ============================================================================
-- MIGRATION: Evitar duplicação das tarefas da cadência "Pós-venda: App & Conteúdo"
-- Date: 2026-04-24
--
-- PROBLEMA:
-- A cadência "Pós-venda: App & Conteúdo" dispara quando um card entra na
-- etapa "App & Conteúdo em Montagem". Se o card já tem as 4 tarefas
-- (porque a cadência rodou antes, ou porque a importação criou), e o card
-- é movido entre etapas pós-venda (saindo e voltando, ou entrando pela
-- primeira vez via import de update), a cadência reinicia e cria TAREFAS
-- DUPLICADAS com o mesmo título.
--
-- Cards em App & Conteúdo/Pré-embarque acabam com 2+ "Criar App",
-- 2+ "Conferir Vouchers", etc.
--
-- SOLUÇÃO:
--
-- 1. Trigger BEFORE INSERT em tarefas: se o card já tem uma tarefa não
--    deletada com o mesmo título entre os 4 da cadência, o INSERT é
--    silenciosamente pulado. Cobre qualquer rota que tente duplicar:
--    cadence-engine, RPCs, edge functions, scripts.
--
-- 2. Limpeza única: para cada card com duplicatas, mantém a tarefa mais
--    antiga (preservando histórico), transfere concluída=true se QUALQUER
--    duplicata estava concluída, e soft-deleta as redundantes.
-- ============================================================================

-- ─── 1. Função de prevenção ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_duplicate_cadence_tarefa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Scope: tarefas da cadência oficial "Pós-venda: App & Conteúdo"
    IF NEW.titulo IN ('Criar App', 'Conferir Vouchers', 'Adicionar vouchers no App', 'Liberar App')
       AND NEW.deleted_at IS NULL
       AND NEW.card_id IS NOT NULL
    THEN
        IF EXISTS (
            SELECT 1 FROM public.tarefas
            WHERE card_id = NEW.card_id
              AND titulo = NEW.titulo
              AND deleted_at IS NULL
              AND id IS DISTINCT FROM NEW.id
        ) THEN
            -- Retornando NULL em BEFORE INSERT cancela a operação silenciosamente.
            RETURN NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_cadence_tarefa ON public.tarefas;

CREATE TRIGGER trg_prevent_duplicate_cadence_tarefa
BEFORE INSERT ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.prevent_duplicate_cadence_tarefa();


-- ─── 2. Limpeza única das duplicatas existentes ────────────────────────────
-- Para cada (card_id, titulo) com 2+ tarefas ativas, mantém a mais antiga
-- e soft-deleta o resto. Preserva concluída=true na que fica.

DO $cleanup$
DECLARE
    v_dup RECORD;
    v_keep_id UUID;
    v_any_done BOOLEAN;
    v_first_done_at TIMESTAMPTZ;
    v_cleaned INT := 0;
BEGIN
    FOR v_dup IN
        SELECT card_id, titulo
        FROM public.tarefas
        WHERE titulo IN ('Criar App', 'Conferir Vouchers', 'Adicionar vouchers no App', 'Liberar App')
          AND deleted_at IS NULL
        GROUP BY card_id, titulo
        HAVING COUNT(*) > 1
    LOOP
        -- Acha a mais antiga (mantém)
        SELECT id INTO v_keep_id
        FROM public.tarefas
        WHERE card_id = v_dup.card_id
          AND titulo = v_dup.titulo
          AND deleted_at IS NULL
        ORDER BY created_at ASC
        LIMIT 1;

        -- Agrega estado de conclusão das duplicatas: se alguma estava feita, a que fica herda
        SELECT BOOL_OR(concluida), MIN(concluida_em) FILTER (WHERE concluida)
        INTO v_any_done, v_first_done_at
        FROM public.tarefas
        WHERE card_id = v_dup.card_id
          AND titulo = v_dup.titulo
          AND deleted_at IS NULL;

        -- Se alguma duplicata estava concluída e a que fica não está, transfere
        UPDATE public.tarefas
        SET concluida = true,
            concluida_em = COALESCE(concluida_em, v_first_done_at)
        WHERE id = v_keep_id AND v_any_done = true AND concluida = false;

        -- Soft-delete o resto
        UPDATE public.tarefas
        SET deleted_at = NOW()
        WHERE card_id = v_dup.card_id
          AND titulo = v_dup.titulo
          AND deleted_at IS NULL
          AND id != v_keep_id;

        v_cleaned := v_cleaned + 1;
    END LOOP;

    RAISE NOTICE 'Limpeza de duplicatas concluída: % grupos ajustados', v_cleaned;
END
$cleanup$;
