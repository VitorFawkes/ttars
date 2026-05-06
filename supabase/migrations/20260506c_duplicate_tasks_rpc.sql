-- ============================================================================
-- MIGRATION: Visão de tarefas duplicadas por viagem + bulk soft-delete
-- Date: 2026-05-06
--
-- CONTEXTO:
-- Cadências e automações criam tarefas duplicadas em produção (re-trigger,
-- importação, etc). O trigger anti-duplicata existente cobre apenas 4 títulos
-- hardcoded (App & Conteúdo). Para o resto, o usuário precisa enxergar as
-- duplicatas agrupadas por viagem e excluir em lote.
--
-- DEFINIÇÃO DE DUPLICATA:
--   Mesma viagem (card_id) + mesmo tipo + mesmo título normalizado
--   (lower + trim + colapsa whitespace).
--   A data de vencimento NÃO entra no matching — duplicatas de re-trigger
--   costumam ter datas próximas mas diferentes.
-- ============================================================================

-- ─── 1. View: agrupamento de duplicatas ────────────────────────────────────

CREATE OR REPLACE VIEW public.vw_tarefas_duplicadas AS
SELECT
    c.org_id,
    t.card_id,
    t.tipo,
    lower(trim(regexp_replace(t.titulo, '\s+', ' ', 'g'))) AS titulo_norm,
    -- Representante (mais antiga) para exibição
    (array_agg(t.titulo ORDER BY t.created_at ASC))[1] AS titulo_exemplo,
    array_agg(t.id ORDER BY t.created_at ASC) AS task_ids,
    array_agg(t.created_at ORDER BY t.created_at ASC) AS created_ats,
    array_agg(t.data_vencimento ORDER BY t.created_at ASC) AS data_vencimentos,
    array_agg(t.responsavel_id ORDER BY t.created_at ASC) AS responsavel_ids,
    array_agg(t.concluida ORDER BY t.created_at ASC) AS concluidas,
    array_agg(t.status ORDER BY t.created_at ASC) AS statuses,
    array_agg(t.metadata ORDER BY t.created_at ASC) AS metadatas,
    COUNT(*) AS qtd
FROM public.tarefas t
JOIN public.cards c ON c.id = t.card_id
WHERE t.deleted_at IS NULL
  AND t.titulo IS NOT NULL
  AND t.card_id IS NOT NULL
GROUP BY c.org_id, t.card_id, t.tipo, lower(trim(regexp_replace(t.titulo, '\s+', ' ', 'g')))
HAVING COUNT(*) > 1;

COMMENT ON VIEW public.vw_tarefas_duplicadas IS
'Agrupa tarefas duplicadas por (card_id, tipo, titulo normalizado). Usada pela RPC find_duplicate_tasks. Definição intencional: data de vencimento NÃO entra no matching — duplicatas de re-trigger de cadência costumam ter datas próximas mas diferentes.';


-- ─── 2. RPC: lista grupos de duplicatas com info da viagem ─────────────────

DROP FUNCTION IF EXISTS public.find_duplicate_tasks(text, uuid);

CREATE OR REPLACE FUNCTION public.find_duplicate_tasks(
    p_scope text DEFAULT 'todas',
    p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
    card_id uuid,
    card_titulo text,
    card_produto text,
    card_stage_nome text,
    contato_nome text,
    tipo text,
    titulo_norm text,
    titulo_exemplo text,
    task_ids uuid[],
    created_ats timestamptz[],
    data_vencimentos timestamptz[],
    responsavel_ids uuid[],
    concluidas boolean[],
    statuses text[],
    metadatas jsonb[],
    qtd bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid := requesting_org_id();
    v_team_id uuid;
BEGIN
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'requesting_org_id() retornou NULL — chamada sem JWT?';
    END IF;

    -- Para escopo 'meu_time' precisamos do team_id do usuário
    IF p_scope = 'meu_time' AND p_user_id IS NOT NULL THEN
        SELECT team_id INTO v_team_id
        FROM public.profiles
        WHERE id = p_user_id
        LIMIT 1;
    END IF;

    RETURN QUERY
    SELECT
        v.card_id,
        c.titulo AS card_titulo,
        c.produto::text AS card_produto,
        ps.nome AS card_stage_nome,
        ct.nome AS contato_nome,
        v.tipo,
        v.titulo_norm,
        v.titulo_exemplo,
        v.task_ids,
        v.created_ats,
        v.data_vencimentos,
        v.responsavel_ids,
        v.concluidas,
        v.statuses,
        v.metadatas,
        v.qtd
    FROM public.vw_tarefas_duplicadas v
    JOIN public.cards c ON c.id = v.card_id
    LEFT JOIN public.pipeline_stages ps ON ps.id = c.pipeline_stage_id
    LEFT JOIN public.contatos ct ON ct.id = c.contato_principal_id
    WHERE v.org_id = v_org_id
      AND (
          p_scope = 'todas'
          OR (p_scope = 'minhas' AND p_user_id IS NOT NULL AND p_user_id = ANY(v.responsavel_ids))
          OR (p_scope = 'meu_time' AND v_team_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = ANY(v.responsavel_ids) AND p.team_id = v_team_id
          ))
      )
    ORDER BY v.qtd DESC, c.titulo NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_tasks(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_duplicate_tasks(text, uuid) TO service_role;

COMMENT ON FUNCTION public.find_duplicate_tasks IS
'Retorna grupos de tarefas duplicadas por viagem, respeitando o org do usuário. p_scope: todas | minhas | meu_time. p_user_id obrigatório para scopes != todas.';


-- ─── 3. RPC: soft-delete em lote com checagem de org ───────────────────────

DROP FUNCTION IF EXISTS public.bulk_soft_delete_tarefas(uuid[]);

CREATE OR REPLACE FUNCTION public.bulk_soft_delete_tarefas(
    p_task_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id uuid := requesting_org_id();
    v_count integer;
BEGIN
    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'requesting_org_id() retornou NULL — chamada sem JWT?';
    END IF;

    IF p_task_ids IS NULL OR array_length(p_task_ids, 1) IS NULL THEN
        RETURN 0;
    END IF;

    UPDATE public.tarefas t
    SET deleted_at = NOW(),
        status = 'cancelada'
    FROM public.cards c
    WHERE t.id = ANY(p_task_ids)
      AND c.id = t.card_id
      AND c.org_id = v_org_id
      AND t.deleted_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_soft_delete_tarefas(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_soft_delete_tarefas(uuid[]) TO service_role;

COMMENT ON FUNCTION public.bulk_soft_delete_tarefas IS
'Soft-delete em lote de tarefas. Filtra por org_id do JWT — tentativa cross-org retorna 0. Marca status=cancelada e deleted_at=now().';
