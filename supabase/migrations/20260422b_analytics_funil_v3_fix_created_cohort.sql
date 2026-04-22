-- Fix: analytics_funnel_conversion_v3 com p_date_ref='created' estava contando cada
-- card da coorte em apenas 1 etapa (a primeira etapa histórica). Isso quebrava a leitura
-- de funil: um card criado no período que progrediu do "Novo Lead" até "Reservas" só
-- aparecia em "Novo Lead". Visualmente, o funil ficava sem jornada.
--
-- Semântica esperada pelo usuário (Vitor, 2026-04-22):
--   - Referência = Criação → coorte de cards criados no período. Cada card da coorte
--     deve aparecer em TODAS as etapas pelas quais passou (etapa inicial + transições
--     posteriores, mesmo que fora do período de criação). Isso dá o funil clássico
--     "de 59 cards, 30 chegaram em Proposta, 10 em Reservas, 3 fecharam".
--   - Referência = Na Etapa → fica como estava: conta transições que ocorreram dentro
--     do período (atividade na etapa no período).

CREATE OR REPLACE FUNCTION public.analytics_funnel_conversion_v3(
    p_date_start  timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end    timestamptz DEFAULT now(),
    p_product     text   DEFAULT NULL,
    p_date_ref    text   DEFAULT 'stage',
    p_status      text[] DEFAULT NULL,
    p_ganho_fase  text   DEFAULT NULL,
    p_stage_id    uuid   DEFAULT NULL,
    p_owner_id    uuid   DEFAULT NULL,
    p_owner_ids   uuid[] DEFAULT NULL,
    p_tag_ids     uuid[] DEFAULT NULL
)
RETURNS TABLE(
    stage_id           uuid,
    stage_nome         text,
    phase_slug         text,
    ordem              integer,
    current_count      bigint,
    period_count       bigint,
    period_valor       numeric,
    period_receita     numeric,
    p50_days_in_stage  numeric,
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

    -- Coorte para date_ref='created': cards criados no período.
    cohort_created AS (
        SELECT pop.id, pop.pipeline_stage_id, pop.created_at
        FROM population pop
        WHERE p_date_ref = 'created'
          AND pop.created_at >= p_date_start AND pop.created_at < p_date_end
    ),

    -- 2a. Entradas por etapa — date_ref='stage'
    --     Conta pelo momento da transição (atividade na etapa NO PERÍODO) + creation
    --     entries para cards criados no período (1 linha por card, na sua 1ª etapa).
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

    -- 2b. Entradas por etapa — date_ref='created' (coorte)
    --     Cada card da coorte aparece em CADA etapa pela qual passou:
    --       • etapa inicial (old_stage_id da 1ª transição OU pipeline_stage_id atual)
    --       • cada new_stage_id visitado via stage_changed (em qualquer tempo)
    --     Isso dá o funil clássico de coorte: "de N cards criados, quantos chegaram em cada etapa".
    period_entries_created AS (
        -- Etapa inicial (onde o card estava quando criado)
        SELECT
            COALESCE(
                (SELECT (a2.metadata->>'old_stage_id')::UUID
                 FROM activities a2
                 WHERE a2.card_id = co.id AND a2.tipo = 'stage_changed'
                 ORDER BY a2.created_at ASC LIMIT 1),
                co.pipeline_stage_id
            ) AS entered_stage_id,
            co.id AS card_id
        FROM cohort_created co
        WHERE p_date_ref = 'created'
        UNION
        -- Qualquer etapa visitada pelo card da coorte (transições em qualquer tempo)
        SELECT (a.metadata->>'new_stage_id')::UUID AS entered_stage_id, a.card_id
        FROM activities a
        WHERE p_date_ref = 'created'
          AND a.tipo = 'stage_changed'
          AND a.card_id IN (SELECT id FROM cohort_created)
    ),

    period_entries AS (
        SELECT entered_stage_id, card_id FROM period_entries_stage
        UNION
        SELECT entered_stage_id, card_id FROM period_entries_created
    ),

    -- 3. Filtro "desde etapa X": restringe universo a cards que passaram por p_stage_id.
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

    -- 4. Deduplica por (stage, card) e agrega valor/receita uma vez por card.
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

    -- 5. Durações em etapa — mediana/p75 das transições SAINDO da etapa.
    --     Para date_ref='stage': considera transições dentro do período.
    --     Para date_ref='created': considera transições da coorte inteira (qualquer tempo)
    --     para dar medidas representativas da jornada.
    stage_durations AS (
        SELECT
            (a.metadata->>'old_stage_id')::UUID AS exited_stage_id,
            LEAST(
                EXTRACT(EPOCH FROM (
                    a.created_at - GREATEST(
                        CASE WHEN p_date_ref = 'stage' THEN p_date_start
                             ELSE '2000-01-01'::timestamptz END,
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
          AND a.card_id IN (
              SELECT id FROM cohort_created WHERE p_date_ref = 'created'
              UNION ALL
              SELECT id FROM population
              WHERE p_date_ref = 'stage'
          )
          AND CASE WHEN p_date_ref = 'stage'
                   THEN a.created_at >= p_date_start AND a.created_at < p_date_end
                   ELSE TRUE END
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

    -- 6. Snapshot ao vivo (independente de período/status/ganho_fase).
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

GRANT EXECUTE ON FUNCTION public.analytics_funnel_conversion_v3 TO authenticated;
