-- ============================================================================
-- MIGRATION: Detecção de tarefas duplicadas em níveis (tiers) + fuzzy match
-- Date: 2026-05-06
--
-- CONTEXTO:
-- A versão anterior (20260506c) classificava como duplicada qualquer par
-- (card_id, tipo, titulo) repetido. Isso gerava falsos positivos (cadências
-- legítimas de follow-up) e falsos negativos (race conditions em segundos
-- de diferença ficavam no mesmo balde de cadeias intencionais; e variações
-- de título tipo "Criar App" / "Fazer App" não eram detectadas).
--
-- ESTA VERSÃO classifica em 3 níveis de confiança + 1 categoria de cadeia
-- legítima, e adiciona busca por título similar (trigram).
--
-- TIERS:
--   exact     → quase certeza de duplicata (auto-flagar)
--                 - Mesmo metadata.cadence_step_id no mesmo card
--                 - Mesmo external_id + external_source no mesmo card
--                 - Criadas com < 5 minutos de diferença
--   possible  → mesmo card+tipo+titulo, sem sinal forte (revisar)
--   fuzzy     → mesmo card+tipo, títulos com similaridade > 0.55 (revisar)
--   chain     → reagendamento explícito (rescheduled_from_id) — NÃO duplicar
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Substitui a view simples pela base de buckets que alimenta a nova RPC
DROP VIEW IF EXISTS public.vw_tarefas_duplicadas;

DROP FUNCTION IF EXISTS public.find_duplicate_tasks(text, uuid);
DROP FUNCTION IF EXISTS public.find_duplicate_tasks_tiered(text, uuid);


-- ─── RPC: detecção em tiers ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.find_duplicate_tasks_tiered(
    p_scope text DEFAULT 'todas',
    p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
    tier text,                       -- 'exact' | 'possible' | 'fuzzy' | 'chain'
    reason text,                     -- explicação humana
    card_id uuid,
    card_titulo text,
    card_produto text,
    card_stage_nome text,
    contato_nome text,
    tipo text,
    titulos_distintos text[],        -- títulos únicos no grupo (ex: ["Criar App", "Fazer App"])
    titulo_exemplo text,             -- representante (mais antigo)
    task_ids uuid[],
    created_ats timestamptz[],
    data_vencimentos timestamptz[],
    responsavel_ids uuid[],
    concluidas boolean[],
    statuses text[],
    titulos text[],
    metadatas jsonb[],
    qtd bigint,
    similarity_score numeric         -- 1.0 para exato/possible/chain, 0..1 para fuzzy
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

    IF p_scope = 'meu_time' AND p_user_id IS NOT NULL THEN
        SELECT team_id INTO v_team_id FROM public.profiles WHERE id = p_user_id LIMIT 1;
    END IF;

    -- Helper CTE: bucket base por (card, tipo, titulo_norm)
    RETURN QUERY
    WITH bucket_base AS (
        SELECT
            cc.org_id,
            t.card_id,
            t.tipo,
            lower(trim(regexp_replace(t.titulo, '\s+', ' ', 'g'))) AS titulo_norm,
            array_agg(t.id ORDER BY t.created_at ASC) AS ids,
            array_agg(t.titulo ORDER BY t.created_at ASC) AS titulos_arr,
            array_agg(t.created_at ORDER BY t.created_at ASC) AS createds,
            array_agg(t.data_vencimento ORDER BY t.created_at ASC) AS vencs,
            array_agg(t.responsavel_id ORDER BY t.created_at ASC) AS resps,
            array_agg(t.concluida ORDER BY t.created_at ASC) AS concs,
            array_agg(t.status ORDER BY t.created_at ASC) AS sts,
            array_agg(t.metadata ORDER BY t.created_at ASC) AS metas,
            array_agg(t.external_id ORDER BY t.created_at ASC) AS exts,
            array_agg(t.rescheduled_from_id ORDER BY t.created_at ASC) AS resched_from,
            COUNT(*) AS qtd
        FROM public.tarefas t
        JOIN public.cards cc ON cc.id = t.card_id
        WHERE t.deleted_at IS NULL
          AND t.titulo IS NOT NULL
          AND t.card_id IS NOT NULL
          AND cc.org_id = v_org_id
          AND (
              p_scope = 'todas'
              OR (p_scope = 'minhas' AND p_user_id IS NOT NULL AND t.responsavel_id = p_user_id)
              OR (p_scope = 'meu_time' AND v_team_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM public.profiles p
                    WHERE p.id = t.responsavel_id AND p.team_id = v_team_id
              ))
          )
        GROUP BY cc.org_id, t.card_id, t.tipo, lower(trim(regexp_replace(t.titulo, '\s+', ' ', 'g')))
    ),
    -- Bucket com >= 2 registros (potencial duplicata)
    bucket_dup AS (
        SELECT * FROM bucket_base WHERE qtd > 1
    ),
    -- Sinais por bucket
    bucket_signals AS (
        SELECT
            b.*,
            -- Sinal: mesmo cadence_step_id?
            (
                SELECT COUNT(DISTINCT m->>'cadence_step_id') = 1
                       AND BOOL_AND(m->>'cadence_step_id' IS NOT NULL)
                FROM unnest(b.metas) AS m
            ) AS same_cadence_step,
            -- Sinal: criadas com < 5 minutos entre primeira e última?
            (
                EXTRACT(EPOCH FROM (b.createds[array_length(b.createds, 1)] - b.createds[1])) < 300
            ) AS within_5min,
            -- Sinal: mesmo external_id?
            (
                array_length(array_remove(b.exts, NULL), 1) = b.qtd
                AND (SELECT COUNT(DISTINCT e) = 1 FROM unnest(b.exts) AS e WHERE e IS NOT NULL)
            ) AS same_external_id,
            -- Cadeia legítima: pelo menos uma tem rescheduled_from_id
            (
                array_length(array_remove(b.resched_from, NULL), 1) >= 1
            ) AS has_reschedule_chain
        FROM bucket_dup b
    ),
    -- TIER 1: EXACT (alta confiança)
    tier_exact AS (
        SELECT
            'exact'::text AS tier,
            CASE
                WHEN bs.same_cadence_step THEN 'Mesmo passo de cadência re-disparado'
                WHEN bs.within_5min THEN
                    'Criadas em ' || GREATEST(1, EXTRACT(EPOCH FROM (bs.createds[array_length(bs.createds, 1)] - bs.createds[1]))::int)::text || ' segundos'
                WHEN bs.same_external_id THEN 'Mesma importação externa'
                ELSE 'Sinal forte de duplicata'
            END AS reason,
            bs.card_id,
            ARRAY[bs.titulo_norm]::text[] AS titulos_distintos,
            bs.titulos_arr[1] AS titulo_exemplo,
            bs.tipo,
            bs.ids,
            bs.titulos_arr,
            bs.createds,
            bs.vencs,
            bs.resps,
            bs.concs,
            bs.sts,
            bs.metas,
            bs.qtd,
            1.0::numeric AS similarity_score,
            bs.has_reschedule_chain
        FROM bucket_signals bs
        WHERE (bs.same_cadence_step OR bs.within_5min OR bs.same_external_id)
          AND NOT bs.has_reschedule_chain
    ),
    -- TIER 2: POSSIBLE (mesmo título exato, sem sinal forte, sem cadeia)
    tier_possible AS (
        SELECT
            'possible'::text AS tier,
            'Títulos idênticos no mesmo card' AS reason,
            bs.card_id,
            ARRAY[bs.titulo_norm]::text[] AS titulos_distintos,
            bs.titulos_arr[1] AS titulo_exemplo,
            bs.tipo,
            bs.ids,
            bs.titulos_arr,
            bs.createds,
            bs.vencs,
            bs.resps,
            bs.concs,
            bs.sts,
            bs.metas,
            bs.qtd,
            1.0::numeric AS similarity_score,
            bs.has_reschedule_chain
        FROM bucket_signals bs
        WHERE NOT (bs.same_cadence_step OR bs.within_5min OR bs.same_external_id)
          AND NOT bs.has_reschedule_chain
    ),
    -- TIER 4: CHAIN (reagendamento legítimo)
    tier_chain AS (
        SELECT
            'chain'::text AS tier,
            'Cadeia de reagendamento (legítima)' AS reason,
            bs.card_id,
            ARRAY[bs.titulo_norm]::text[] AS titulos_distintos,
            bs.titulos_arr[1] AS titulo_exemplo,
            bs.tipo,
            bs.ids,
            bs.titulos_arr,
            bs.createds,
            bs.vencs,
            bs.resps,
            bs.concs,
            bs.sts,
            bs.metas,
            bs.qtd,
            1.0::numeric AS similarity_score,
            bs.has_reschedule_chain
        FROM bucket_signals bs
        WHERE bs.has_reschedule_chain
    ),
    -- TIER 3: FUZZY (mesmo card+tipo, títulos similares mas DIFERENTES)
    -- Combina pares de buckets distintos com similarity > 0.55
    fuzzy_pairs AS (
        SELECT
            a.card_id,
            a.tipo,
            a.titulo_norm AS norm_a,
            b.titulo_norm AS norm_b,
            a.titulos_arr[1] AS titulo_a,
            b.titulos_arr[1] AS titulo_b,
            similarity(a.titulo_norm, b.titulo_norm) AS sim,
            a.ids || b.ids AS ids,
            a.titulos_arr || b.titulos_arr AS titulos_arr,
            a.createds || b.createds AS createds,
            a.vencs || b.vencs AS vencs,
            a.resps || b.resps AS resps,
            a.concs || b.concs AS concs,
            a.sts || b.sts AS sts,
            a.metas || b.metas AS metas,
            a.qtd + b.qtd AS qtd,
            a.has_reschedule_chain OR b.has_reschedule_chain AS has_reschedule_chain
        FROM bucket_signals a
        JOIN bucket_signals b
          ON a.card_id = b.card_id
          AND a.tipo = b.tipo
          AND a.titulo_norm < b.titulo_norm     -- evita auto-pair e duplicatas A↔B vs B↔A
          AND similarity(a.titulo_norm, b.titulo_norm) > 0.55
    ),
    tier_fuzzy AS (
        SELECT
            'fuzzy'::text AS tier,
            'Títulos similares: "' || fp.titulo_a || '" e "' || fp.titulo_b
                || '" (' || ROUND(fp.sim * 100)::text || '% similaridade)' AS reason,
            fp.card_id,
            ARRAY[fp.norm_a, fp.norm_b]::text[] AS titulos_distintos,
            fp.titulo_a AS titulo_exemplo,
            fp.tipo,
            fp.ids,
            fp.titulos_arr,
            fp.createds,
            fp.vencs,
            fp.resps,
            fp.concs,
            fp.sts,
            fp.metas,
            fp.qtd,
            fp.sim AS similarity_score,
            fp.has_reschedule_chain
        FROM fuzzy_pairs fp
        WHERE NOT fp.has_reschedule_chain
    ),
    -- Inclui também buckets isolados (qtd=1) que têm par fuzzy — caso "Criar App"
    -- existir uma vez e "Fazer App" outra vez no mesmo card. Já coberto por
    -- fuzzy_pairs porque bucket_signals só pega qtd > 1; precisamos olhar
    -- bucket_base direto.
    fuzzy_pairs_singletons AS (
        SELECT
            a.card_id,
            a.tipo,
            a.titulo_norm AS norm_a,
            b.titulo_norm AS norm_b,
            a.titulos_arr[1] AS titulo_a,
            b.titulos_arr[1] AS titulo_b,
            similarity(a.titulo_norm, b.titulo_norm) AS sim,
            a.ids || b.ids AS ids,
            a.titulos_arr || b.titulos_arr AS titulos_arr,
            a.createds || b.createds AS createds,
            a.vencs || b.vencs AS vencs,
            a.resps || b.resps AS resps,
            a.concs || b.concs AS concs,
            a.sts || b.sts AS sts,
            a.metas || b.metas AS metas,
            a.qtd + b.qtd AS qtd,
            (array_length(array_remove(a.resched_from, NULL), 1) >= 1
             OR array_length(array_remove(b.resched_from, NULL), 1) >= 1) AS has_reschedule_chain
        FROM bucket_base a
        JOIN bucket_base b
          ON a.card_id = b.card_id
          AND a.tipo = b.tipo
          AND a.titulo_norm < b.titulo_norm
          AND similarity(a.titulo_norm, b.titulo_norm) > 0.55
        -- Pelo menos um dos lados tem que ser singleton (qtd=1) — os pares com qtd>1 dos 2 lados já vão em fuzzy_pairs
        WHERE (a.qtd = 1 OR b.qtd = 1)
    ),
    tier_fuzzy_extra AS (
        SELECT
            'fuzzy'::text AS tier,
            'Títulos similares: "' || fp.titulo_a || '" e "' || fp.titulo_b
                || '" (' || ROUND(fp.sim * 100)::text || '% similaridade)' AS reason,
            fp.card_id,
            ARRAY[fp.norm_a, fp.norm_b]::text[] AS titulos_distintos,
            fp.titulo_a AS titulo_exemplo,
            fp.tipo,
            fp.ids,
            fp.titulos_arr,
            fp.createds,
            fp.vencs,
            fp.resps,
            fp.concs,
            fp.sts,
            fp.metas,
            fp.qtd,
            fp.sim AS similarity_score,
            fp.has_reschedule_chain
        FROM fuzzy_pairs_singletons fp
        WHERE NOT fp.has_reschedule_chain
    )
    -- União de todos os tiers, com info do card
    SELECT
        u.tier,
        u.reason,
        u.card_id,
        c.titulo AS card_titulo,
        c.produto::text AS card_produto,
        ps.nome AS card_stage_nome,
        ct.nome AS contato_nome,
        u.tipo,
        u.titulos_distintos,
        u.titulo_exemplo,
        u.ids AS task_ids,
        u.createds AS created_ats,
        u.vencs AS data_vencimentos,
        u.resps AS responsavel_ids,
        u.concs AS concluidas,
        u.sts AS statuses,
        u.titulos_arr AS titulos,
        u.metas AS metadatas,
        u.qtd,
        u.similarity_score
    FROM (
        SELECT * FROM tier_exact
        UNION ALL
        SELECT * FROM tier_possible
        UNION ALL
        SELECT * FROM tier_fuzzy
        UNION ALL
        SELECT * FROM tier_fuzzy_extra
        UNION ALL
        SELECT * FROM tier_chain
    ) u
    JOIN public.cards c ON c.id = u.card_id
    LEFT JOIN public.pipeline_stages ps ON ps.id = c.pipeline_stage_id
    LEFT JOIN public.contatos ct ON ct.id = c.contato_principal_id
    ORDER BY
        CASE u.tier WHEN 'exact' THEN 1 WHEN 'possible' THEN 2 WHEN 'fuzzy' THEN 3 ELSE 4 END,
        u.qtd DESC,
        c.titulo NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_tasks_tiered(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_duplicate_tasks_tiered(text, uuid) TO service_role;

COMMENT ON FUNCTION public.find_duplicate_tasks_tiered IS
'Detecção de tarefas duplicadas por viagem em 4 níveis: exact (cadence_step / 5min / external_id), possible (titulo idêntico), fuzzy (titulo similar via trigram > 0.55), chain (reagendamento legítimo). p_scope: todas | minhas | meu_time.';
