-- analytics_planner_stage_x_owner: dados pro heatmap interativo "Tempo em cada etapa por pessoa".
-- Retorna 1 linha por cruzamento (etapa × planner) com 3 métricas:
--   tempo_medio_dias   — média de dias na etapa pra cards QUE JÁ SAÍRAM no período
--   tempo_pior_dias    — p90 de dias na etapa (cauda lenta)
--   cards_atuais       — quantos cards estão NESTA etapa AGORA (snapshot)
-- Frontend escolhe qual métrica colorir o heatmap via toggle.
--
-- Período (p_date_start/p_date_end) filtra QUANDO o card saiu da etapa
-- (busca via activities tipo=stage_changed). Para `cards_atuais` o período
-- não se aplica (snapshot).
--
-- Filtros opcionais: stage_ids (lista de etapas), owner_ids (lista de planners).
-- Só conta cards onde vendas_owner_id IS NOT NULL (regra: Planner-only).

CREATE OR REPLACE FUNCTION public.analytics_planner_stage_x_owner(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_stage_ids  UUID[]      DEFAULT NULL,
    p_owner_ids  UUID[]      DEFAULT NULL,
    p_product    TEXT        DEFAULT NULL
)
RETURNS TABLE(
    stage_id          UUID,
    stage_nome        TEXT,
    phase_slug        TEXT,
    stage_ordem       INT,
    phase_order       INT,
    planner_id        UUID,
    planner_nome      TEXT,
    tempo_medio_dias  NUMERIC,
    tempo_pior_dias   NUMERIC,
    cards_passaram    INT,
    cards_atuais      INT
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
        SELECT s.id, s.nome, s.ordem::INT, pp.slug AS phase_slug, pp.order_index AS phase_order
        FROM pipeline_stages s
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE s.ativo = true
          AND (p_stage_ids IS NULL OR COALESCE(array_length(p_stage_ids, 1), 0) = 0
               OR s.id = ANY(p_stage_ids))
    ),
    -- Cards que SAÍRAM de uma etapa no período (via activities)
    transicoes AS (
        SELECT
            (a.metadata->>'old_stage_id')::UUID AS stage_id,
            c.vendas_owner_id AS owner_id,
            EXTRACT(EPOCH FROM (
                a.created_at - COALESCE(
                    (SELECT prev.created_at FROM activities prev
                     WHERE prev.card_id = a.card_id
                       AND prev.tipo = 'stage_changed'
                       AND prev.created_at < a.created_at
                     ORDER BY prev.created_at DESC LIMIT 1),
                    c.created_at
                )
            )) / 86400.0 AS dias_na_etapa
        FROM activities a
        JOIN cards c ON c.id = a.card_id
        WHERE a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start
          AND a.created_at < p_date_end
          AND c.org_id = v_org
          AND c.vendas_owner_id IS NOT NULL
          AND c.deleted_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
               OR c.vendas_owner_id = ANY(p_owner_ids))
    ),
    -- Cards ATUAIS em cada etapa (snapshot)
    atuais AS (
        SELECT
            c.pipeline_stage_id AS stage_id,
            c.vendas_owner_id AS owner_id
        FROM cards c
        WHERE c.org_id = v_org
          AND c.vendas_owner_id IS NOT NULL
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
               OR c.vendas_owner_id = ANY(p_owner_ids))
    ),
    -- Lista de planners ativos pra fazer o produto cartesiano com stages
    planners AS (
        SELECT DISTINCT p.id, p.nome
        FROM profiles p
        JOIN org_members om ON om.user_id = p.id AND om.org_id = v_org
        WHERE p.active != false
          AND p.role = 'vendas'
          AND (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
               OR p.id = ANY(p_owner_ids))
    )
    SELECT
        s.id AS stage_id,
        s.nome AS stage_nome,
        s.phase_slug,
        s.ordem AS stage_ordem,
        s.phase_order,
        pl.id AS planner_id,
        pl.nome AS planner_nome,
        ROUND(COALESCE(
            (SELECT AVG(dias_na_etapa) FROM transicoes t
             WHERE t.stage_id = s.id AND t.owner_id = pl.id),
            0
        ), 1)::NUMERIC AS tempo_medio_dias,
        ROUND(COALESCE(
            (SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY dias_na_etapa)
             FROM transicoes t
             WHERE t.stage_id = s.id AND t.owner_id = pl.id),
            0
        ), 1)::NUMERIC AS tempo_pior_dias,
        (SELECT COUNT(*)::INT FROM transicoes t
         WHERE t.stage_id = s.id AND t.owner_id = pl.id) AS cards_passaram,
        (SELECT COUNT(*)::INT FROM atuais a
         WHERE a.stage_id = s.id AND a.owner_id = pl.id) AS cards_atuais
    FROM stages s
    CROSS JOIN planners pl
    WHERE EXISTS (
        SELECT 1 FROM transicoes t WHERE t.stage_id = s.id AND t.owner_id = pl.id
        UNION ALL
        SELECT 1 FROM atuais a WHERE a.stage_id = s.id AND a.owner_id = pl.id
    )
    ORDER BY s.phase_order NULLS LAST, s.ordem, pl.nome;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_planner_stage_x_owner TO authenticated;
