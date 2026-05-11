-- Revisão /analytics/funil (2026-04-22)
--
-- Motivação: `analytics_funnel_conversion` ignorava `p_date_start/p_date_end/p_mode/p_stage_id`
-- no corpo da função — retornava apenas um snapshot de cards `status_comercial = 'aberto'`
-- por etapa, sem recortar por período, sem refletir ganhos/perdas, sem respeitar "desde etapa".
-- Resultado: toda a página mentia ao usuário (Filtro "Este mês" vs "Tudo" não mudava nada).
--
-- Plano mestre (/Users/vitorgambetti/.claude/plans/analytics-rebuild.md) atualizado em
-- 2026-04-22 substitui o antigo princípio "Analisar (Entries/Ganho SDR/...)" por:
--   - Referência: "Na Etapa" (default) | "Criação"
--   - Status: Todos · Abertos · Ganhos · Perdidos (dimensão separada)
--   - Por quem fechou: Qualquer · SDR · Planner · Pós (sub-filtro quando Ganhos ativo)
--
-- Esta migration cria a RPC `analytics_funnel_conversion_v3` com a nova semântica.
-- A RPC antiga (`analytics_funnel_conversion`) fica intocada até cleanup pós-migração do Funil.
--
-- Também:
--   - `analytics_funnel_velocity_v3`: versão nova com `p_product` (a v1 sem p_product e a
--     v2 do persona ficam intocadas para manter compat; Funil novo migra para v3).
--   - `analytics_loss_reasons`: recria com assinatura canônica (p_owner_ids, p_tag_ids)
--     documentada, pois não havia migration não-arquivada que correspondesse à função viva.

-- ═══ 1. analytics_funnel_conversion_v3 ══════════════════════════════════════

DROP FUNCTION IF EXISTS public.analytics_funnel_conversion_v3(
    timestamptz, timestamptz, text, text, text[], text, uuid, uuid, uuid[], uuid[]
);

CREATE FUNCTION public.analytics_funnel_conversion_v3(
    p_date_start  timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end    timestamptz DEFAULT now(),
    p_product     text   DEFAULT NULL,
    p_date_ref    text   DEFAULT 'stage',       -- 'stage' | 'created'
    p_status      text[] DEFAULT NULL,          -- NULL = todos; ex: {'aberto'}, {'ganho'}, {'perdido'}
    p_ganho_fase  text   DEFAULT NULL,          -- 'sdr' | 'planner' | 'pos' | NULL
    p_stage_id    uuid   DEFAULT NULL,          -- "desde etapa": recorta universo para cards que passaram por essa etapa
    p_owner_id    uuid   DEFAULT NULL,
    p_owner_ids   uuid[] DEFAULT NULL,
    p_tag_ids     uuid[] DEFAULT NULL
)
RETURNS TABLE(
    stage_id           uuid,
    stage_nome         text,
    phase_slug         text,
    ordem              integer,
    current_count      bigint,       -- snapshot ao vivo: cards status='aberto' NA etapa agora (independente de período)
    period_count       bigint,       -- cards únicos que "caíram" nesta etapa no período conforme date_ref
    period_valor       numeric,      -- soma valor_final|valor_estimado dos cards do period_count
    period_receita     numeric,      -- soma receita dos cards do period_count
    p50_days_in_stage  numeric,      -- mediana de dias em etapa (cards que transicionaram para cá no período)
    p75_days_in_stage  numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_has_status boolean := p_status IS NOT NULL AND array_length(p_status, 1) > 0;
BEGIN
    RETURN QUERY
    WITH
    -- 1. Universo de cards: aplica produto/owner/tag/status/ganho_fase
    --    (população ANTES de recortar por etapa raiz).
    population AS (
        SELECT
            c.id,
            c.pipeline_stage_id,
            c.created_at,
            c.valor_final,
            c.valor_estimado,
            c.receita,
            c.status_comercial
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND (NOT v_has_status OR c.status_comercial::TEXT = ANY(p_status))
          AND (
              p_ganho_fase IS NULL
              OR (p_ganho_fase = 'sdr'     AND c.ganho_sdr = true
                  AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end)
              OR (p_ganho_fase = 'planner' AND c.ganho_planner = true
                  AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end)
              OR (p_ganho_fase = 'pos'     AND c.ganho_pos = true
                  AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end)
          )
    ),

    -- 2. Entradas no período por etapa, conforme date_ref.
    --    'stage': conta pelo momento da transição + creation_entries (cards criados no período
    --             entram via old_stage_id do 1º stage_changed OU pipeline_stage_id atual).
    --    'created': conta exclusivamente pelo created_at; associa à 1ª etapa histórica.
    period_entries_stage AS (
        SELECT (a.metadata->>'new_stage_id')::UUID AS entered_stage_id, a.card_id
        FROM activities a
        WHERE p_date_ref = 'stage'
          AND a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start AND a.created_at < p_date_end
          AND a.card_id IN (SELECT id FROM population)
        UNION
        SELECT
            COALESCE(
                (SELECT (a2.metadata->>'old_stage_id')::UUID
                 FROM activities a2
                 WHERE a2.card_id = pop.id AND a2.tipo = 'stage_changed'
                 ORDER BY a2.created_at ASC LIMIT 1),
                pop.pipeline_stage_id
            ) AS entered_stage_id,
            pop.id AS card_id
        FROM population pop
        WHERE p_date_ref = 'stage'
          AND pop.created_at >= p_date_start AND pop.created_at < p_date_end
    ),
    period_entries_created AS (
        SELECT
            COALESCE(
                (SELECT (a2.metadata->>'old_stage_id')::UUID
                 FROM activities a2
                 WHERE a2.card_id = pop.id AND a2.tipo = 'stage_changed'
                 ORDER BY a2.created_at ASC LIMIT 1),
                pop.pipeline_stage_id
            ) AS entered_stage_id,
            pop.id AS card_id
        FROM population pop
        WHERE p_date_ref = 'created'
          AND pop.created_at >= p_date_start AND pop.created_at < p_date_end
    ),
    period_entries AS (
        SELECT entered_stage_id, card_id FROM period_entries_stage
        UNION
        SELECT entered_stage_id, card_id FROM period_entries_created
    ),

    -- 3. Filtro "desde etapa X": restringe universo a cards que passaram pelo p_stage_id.
    --    Inclui tanto transições para a etapa quanto cards que nasceram nela.
    root_passes AS (
        SELECT DISTINCT card_id FROM (
            SELECT a.card_id
            FROM activities a
            WHERE a.tipo = 'stage_changed'
              AND (a.metadata->>'new_stage_id')::UUID = p_stage_id
              AND a.card_id IN (SELECT id FROM population)
            UNION
            SELECT pop.id AS card_id
            FROM population pop
            WHERE (
                SELECT (a2.metadata->>'old_stage_id')::UUID
                FROM activities a2
                WHERE a2.card_id = pop.id AND a2.tipo = 'stage_changed'
                ORDER BY a2.created_at ASC LIMIT 1
            ) = p_stage_id
              OR pop.pipeline_stage_id = p_stage_id
        ) _passes
    ),
    period_entries_filtered AS (
        SELECT pe.entered_stage_id, pe.card_id
        FROM period_entries pe
        WHERE p_stage_id IS NULL
           OR pe.card_id IN (SELECT card_id FROM root_passes)
    ),

    -- 4. Deduplica por (entered_stage_id, card_id) e agrega valor/receita uma vez por card.
    stage_cards_unique AS (
        SELECT DISTINCT entered_stage_id, card_id
        FROM period_entries_filtered
    ),
    stage_totals AS (
        SELECT
            sc.entered_stage_id,
            COUNT(*)::BIGINT AS period_count,
            COALESCE(SUM(COALESCE(pop.valor_final, pop.valor_estimado, 0)), 0)::NUMERIC AS period_valor,
            COALESCE(SUM(pop.receita), 0)::NUMERIC AS period_receita
        FROM stage_cards_unique sc
        JOIN population pop ON pop.id = sc.card_id
        GROUP BY sc.entered_stage_id
    ),

    -- 5. Durações em etapa: só para cards da população que transicionaram SAINDO da etapa no período.
    --    Cap em 365 dias para evitar outliers (cards paradíssimos há anos).
    stage_durations AS (
        SELECT
            (a.metadata->>'old_stage_id')::UUID AS exited_stage_id,
            LEAST(
                EXTRACT(EPOCH FROM (
                    a.created_at - GREATEST(
                        p_date_start,
                        COALESCE(
                            (SELECT prev.created_at FROM activities prev
                             WHERE prev.card_id = a.card_id
                               AND prev.tipo = 'stage_changed'
                               AND prev.created_at < a.created_at
                             ORDER BY prev.created_at DESC LIMIT 1),
                            (SELECT c.created_at FROM cards c WHERE c.id = a.card_id)
                        )
                    )
                )) / 86400.0,
                365
            ) AS dias
        FROM activities a
        WHERE a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start AND a.created_at < p_date_end
          AND a.card_id IN (SELECT id FROM population)
          AND (p_stage_id IS NULL OR a.card_id IN (SELECT card_id FROM root_passes))
    ),
    stage_percentiles AS (
        SELECT
            exited_stage_id,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias)::NUMERIC  AS p50_days,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY dias)::NUMERIC AS p75_days
        FROM stage_durations
        GROUP BY exited_stage_id
    ),

    -- 6. Snapshot ao vivo por etapa: cards abertos AGORA (independente de período).
    --    Respeita os mesmos filtros de owner/tag/produto, mas ignora date/status/ganho_fase.
    live_snapshot AS (
        SELECT
            c.pipeline_stage_id AS live_stage_id,
            COUNT(*)::BIGINT    AS current_count
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.status_comercial = 'aberto'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
        GROUP BY c.pipeline_stage_id
    )

    SELECT
        s.id          AS stage_id,
        s.nome        AS stage_nome,
        pp.slug       AS phase_slug,
        s.ordem::INT  AS ordem,
        COALESCE(ls.current_count, 0)::BIGINT         AS current_count,
        COALESCE(st.period_count, 0)::BIGINT          AS period_count,
        COALESCE(st.period_valor, 0)::NUMERIC         AS period_valor,
        COALESCE(st.period_receita, 0)::NUMERIC       AS period_receita,
        COALESCE(sp.p50_days, 0)::NUMERIC             AS p50_days_in_stage,
        COALESCE(sp.p75_days, 0)::NUMERIC             AS p75_days_in_stage
    FROM pipeline_stages s
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
    LEFT JOIN stage_totals st      ON st.entered_stage_id = s.id
    LEFT JOIN stage_percentiles sp ON sp.exited_stage_id = s.id
    LEFT JOIN live_snapshot ls     ON ls.live_stage_id = s.id
    WHERE s.ativo = true
      AND (p_product IS NULL OR pip.produto::TEXT = p_product)
    ORDER BY pp.order_index, s.ordem;
END;
$$;

COMMENT ON FUNCTION public.analytics_funnel_conversion_v3 IS
'Funil v3 (2026-04-22): respeita período, date_ref (stage/created), status e ganho_fase. Substitui a semântica "mode" da v2 pelo novo padrão do plano analytics-rebuild.';

GRANT EXECUTE ON FUNCTION public.analytics_funnel_conversion_v3 TO authenticated;


-- ═══ 2. analytics_funnel_velocity_v3 (nova, com p_product) ═════════════════
-- A v1 (sem p_product) permanece intocada. Novo Funil usa _v2. Quando todos os
-- consumidores migrarem, a v1 pode ser dropada no cleanup final.

DROP FUNCTION IF EXISTS public.analytics_funnel_velocity_v3(
    timestamptz, timestamptz, text, uuid[], uuid[]
);

CREATE FUNCTION public.analytics_funnel_velocity_v3(
    p_date_start timestamptz DEFAULT (now() - interval '90 days'),
    p_date_end   timestamptz DEFAULT now(),
    p_product    text   DEFAULT NULL,
    p_owner_ids  uuid[] DEFAULT NULL,
    p_tag_ids    uuid[] DEFAULT NULL
)
RETURNS TABLE(
    stage_id        uuid,
    stage_nome      text,
    phase_slug      text,
    ordem           integer,
    cards_passaram  bigint,
    cards_atuais    bigint,
    mediana_dias    numeric,
    p90_dias        numeric,
    media_dias      numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH stages AS (
        SELECT s.id, s.nome, s.ordem, pp.slug AS phase_slug, pp.order_index AS phase_order
        FROM pipeline_stages s
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
    ),
    transicoes AS (
        SELECT
            (a.metadata->>'old_stage_id')::UUID AS stage_id,
            a.card_id,
            LEAST(
                EXTRACT(EPOCH FROM (
                    a.created_at - GREATEST(
                        p_date_start,
                        COALESCE(
                            (SELECT prev.created_at FROM activities prev
                             WHERE prev.card_id = a.card_id
                               AND prev.tipo = 'stage_changed'
                               AND prev.created_at < a.created_at
                             ORDER BY prev.created_at DESC LIMIT 1),
                            (SELECT c.created_at FROM cards c WHERE c.id = a.card_id)
                        )
                    )
                )) / 86400.0,
                365
            ) AS dias_na_etapa
        FROM activities a
        JOIN cards c ON c.id = a.card_id
        WHERE a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start
          AND a.created_at < p_date_end
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
    ),
    atuais AS (
        SELECT
            c.pipeline_stage_id AS stage_id,
            c.id AS card_id,
            LEAST(EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400.0, 365) AS dias_na_etapa
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.stage_entered_at IS NOT NULL
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
    ),
    metricas AS (
        SELECT
            s.id AS stage_id,
            s.nome AS stage_nome,
            s.phase_slug,
            s.ordem::INT AS ordem,
            s.phase_order,
            (SELECT COUNT(*) FROM transicoes t WHERE t.stage_id = s.id)::BIGINT AS cards_passaram,
            (SELECT COUNT(*) FROM atuais a WHERE a.stage_id = s.id)::BIGINT AS cards_atuais,
            COALESCE(
                (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS mediana_dias,
            COALESCE(
                (SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS p90_dias,
            COALESCE(
                (SELECT AVG(dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS media_dias
        FROM stages s
    )
    SELECT m.stage_id, m.stage_nome, m.phase_slug, m.ordem,
           m.cards_passaram, m.cards_atuais,
           ROUND(m.mediana_dias, 1), ROUND(m.p90_dias, 1), ROUND(m.media_dias, 1)
    FROM metricas m
    ORDER BY m.phase_order NULLS LAST, m.ordem;
END;
$$;

COMMENT ON FUNCTION public.analytics_funnel_velocity_v3 IS
'Velocidade por etapa (2026-04-22). Diferença da v1: aceita p_product para evitar mistura de pipelines quando a org tem mais de um produto vivo.';

GRANT EXECUTE ON FUNCTION public.analytics_funnel_velocity_v3 TO authenticated;


-- ═══ 3. analytics_loss_reasons (re-registra assinatura canônica) ═══════════
-- A função viva em prod aceita p_owner_ids e p_tag_ids, mas não havia migration não-arquivada
-- que a declarasse — risco de regressão em rebase/restore. Esta recriação torna a assinatura
-- explícita no repo e pronta para o smoke test de schema.

DROP FUNCTION IF EXISTS public.analytics_loss_reasons(
    timestamptz, timestamptz, text, text, uuid, uuid
);
DROP FUNCTION IF EXISTS public.analytics_loss_reasons(
    timestamptz, timestamptz, text, text, uuid, uuid, uuid[], uuid[]
);

CREATE FUNCTION public.analytics_loss_reasons(
    p_date_start timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end   timestamptz DEFAULT now(),
    p_product    text   DEFAULT NULL,
    p_mode       text   DEFAULT 'entries',
    p_stage_id   uuid   DEFAULT NULL,
    p_owner_id   uuid   DEFAULT NULL,
    p_owner_ids  uuid[] DEFAULT NULL,
    p_tag_ids    uuid[] DEFAULT NULL
)
RETURNS TABLE(motivo text, count bigint, percentage numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org      UUID   := requesting_org_id();
    total_lost BIGINT;
BEGIN
    SELECT COUNT(*) INTO total_lost
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial = 'perdido'
      AND COALESCE(c.card_type, 'standard') != 'sub_card'
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
      AND _a_tag_ok(c.id, p_tag_ids)
      AND CASE
          WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (
                  SELECT card_id FROM activities a
                  WHERE a.tipo = 'stage_changed'
                    AND (a.metadata->>'new_stage_id')::UUID = p_stage_id
                    AND a.created_at >= p_date_start AND a.created_at < p_date_end
              )
          WHEN p_mode = 'ganho_sdr' THEN
              c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
          WHEN p_mode = 'ganho_planner' THEN
              c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
          WHEN p_mode = 'ganho_total' THEN
              c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
          ELSE
              COALESCE(c.data_fechamento, c.updated_at) >= p_date_start
              AND COALESCE(c.data_fechamento, c.updated_at) < p_date_end
      END;

    RETURN QUERY
    SELECT
        COALESCE(NULLIF(TRIM(c.motivo_perda_comentario), ''), mp.nome, 'Sem motivo informado')::TEXT AS motivo,
        COUNT(*)::BIGINT AS count,
        CASE WHEN total_lost > 0
             THEN ROUND((COUNT(*)::NUMERIC / total_lost) * 100, 1)
             ELSE 0 END AS percentage
    FROM cards c
    LEFT JOIN motivos_perda mp ON mp.id = c.motivo_perda_id
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial = 'perdido'
      AND COALESCE(c.card_type, 'standard') != 'sub_card'
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
      AND _a_tag_ok(c.id, p_tag_ids)
      AND CASE
          WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (
                  SELECT card_id FROM activities a
                  WHERE a.tipo = 'stage_changed'
                    AND (a.metadata->>'new_stage_id')::UUID = p_stage_id
                    AND a.created_at >= p_date_start AND a.created_at < p_date_end
              )
          WHEN p_mode = 'ganho_sdr' THEN
              c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
          WHEN p_mode = 'ganho_planner' THEN
              c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
          WHEN p_mode = 'ganho_total' THEN
              c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
          ELSE
              COALESCE(c.data_fechamento, c.updated_at) >= p_date_start
              AND COALESCE(c.data_fechamento, c.updated_at) < p_date_end
      END
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_loss_reasons TO authenticated;
