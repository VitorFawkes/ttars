-- Adiciona p_limit + total_count em analytics_operations_health.
-- Sem isso, PostgREST corta em 1000 sem o cliente saber quantos existem de verdade
-- (caso real: 3048 cards em pós-venda sem data, UI mostrava só 1000).

DROP FUNCTION IF EXISTS public.analytics_operations_health(uuid[]);

CREATE FUNCTION public.analytics_operations_health(
    p_owner_ids UUID[] DEFAULT NULL,
    p_limit     INT    DEFAULT 100
)
RETURNS TABLE(
    card_id            UUID,
    titulo             TEXT,
    dono_atual_nome    TEXT,
    stage_atual_id     UUID,
    stage_atual_nome   TEXT,
    stage_esperado_id  UUID,
    stage_esperado_nome TEXT,
    data_inicio        DATE,
    data_fim           DATE,
    motivo             TEXT,
    total_count        BIGINT,
    total_data_ausente BIGINT,
    total_etapa_errada BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH cards_pos AS (
        SELECT
            c.id,
            c.titulo,
            c.dono_atual_id,
            c.pipeline_stage_id,
            c.produto_data
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE c.org_id = v_org
          AND pp.slug = 'pos_venda'
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
    ),
    diagnostico AS (
        SELECT
            cp.id AS card_id,
            cp.titulo,
            cp.dono_atual_id,
            cp.pipeline_stage_id AS stage_atual_id,
            NULLIF(cp.produto_data->'data_exata_da_viagem'->>'start', '')::DATE AS d_start,
            NULLIF(cp.produto_data->'data_exata_da_viagem'->>'end', '')::DATE   AS d_end,
            fn_calcular_etapa_pos_venda(cp.id) AS stage_esperado_id
        FROM cards_pos cp
    ),
    com_motivo AS (
        SELECT
            d.card_id,
            d.titulo,
            d.dono_atual_id,
            d.stage_atual_id,
            d.stage_esperado_id,
            d.d_start,
            d.d_end,
            CASE
                WHEN d.d_start IS NULL OR d.d_end IS NULL THEN 'data_ausente'
                WHEN d.stage_esperado_id IS NOT NULL
                     AND d.stage_esperado_id <> d.stage_atual_id THEN 'etapa_errada'
                ELSE NULL
            END AS motivo
        FROM diagnostico d
    ),
    totals AS (
        SELECT
            COUNT(*) FILTER (WHERE motivo IS NOT NULL)::BIGINT AS t_total,
            COUNT(*) FILTER (WHERE motivo = 'data_ausente')::BIGINT AS t_data,
            COUNT(*) FILTER (WHERE motivo = 'etapa_errada')::BIGINT AS t_etapa
        FROM com_motivo
    )
    SELECT
        m.card_id,
        m.titulo,
        prof.nome AS dono_atual_nome,
        m.stage_atual_id,
        s_atual.nome AS stage_atual_nome,
        m.stage_esperado_id,
        s_esp.nome AS stage_esperado_nome,
        m.d_start AS data_inicio,
        m.d_end AS data_fim,
        m.motivo,
        (SELECT t_total FROM totals) AS total_count,
        (SELECT t_data FROM totals) AS total_data_ausente,
        (SELECT t_etapa FROM totals) AS total_etapa_errada
    FROM com_motivo m
    LEFT JOIN profiles prof ON prof.id = m.dono_atual_id
    LEFT JOIN pipeline_stages s_atual ON s_atual.id = m.stage_atual_id
    LEFT JOIN pipeline_stages s_esp ON s_esp.id = m.stage_esperado_id
    WHERE m.motivo IS NOT NULL
    ORDER BY
        CASE m.motivo WHEN 'etapa_errada' THEN 0 ELSE 1 END,  -- etapa errada primeiro (mais acionável)
        m.d_start NULLS LAST
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_operations_health TO authenticated;

COMMENT ON FUNCTION public.analytics_operations_health IS
'Lista cards em pós-venda com problema (data_ausente ou etapa_errada). Retorna até p_limit linhas (default 100) com total_count/total_data_ausente/total_etapa_errada no record. Etapa errada vem primeiro (mais acionável que volume legado de data ausente).';
