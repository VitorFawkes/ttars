-- Fix: column reference "motivo" is ambiguous no ORDER BY de analytics_operations_health.
-- A coluna m.motivo da CTE colidia com o nome da coluna do RETURN TABLE.
-- Solução: renomear coluna do CTE pra _motivo, mantendo o nome do RETURN como motivo.

DROP FUNCTION IF EXISTS public.analytics_operations_health(uuid[], int);

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
        SELECT c.id, c.titulo, c.dono_atual_id, c.pipeline_stage_id, c.produto_data
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
            cp.id AS d_card_id,
            cp.titulo AS d_titulo,
            cp.dono_atual_id AS d_dono_id,
            cp.pipeline_stage_id AS d_stage_atual,
            NULLIF(cp.produto_data->'data_exata_da_viagem'->>'start', '')::DATE AS d_start,
            NULLIF(cp.produto_data->'data_exata_da_viagem'->>'end', '')::DATE   AS d_end,
            fn_calcular_etapa_pos_venda(cp.id) AS d_stage_esperado
        FROM cards_pos cp
    ),
    com_motivo AS (
        SELECT
            d.d_card_id,
            d.d_titulo,
            d.d_dono_id,
            d.d_stage_atual,
            d.d_stage_esperado,
            d.d_start,
            d.d_end,
            CASE
                WHEN d.d_start IS NULL OR d.d_end IS NULL THEN 'data_ausente'
                WHEN d.d_stage_esperado IS NOT NULL
                     AND d.d_stage_esperado <> d.d_stage_atual THEN 'etapa_errada'
                ELSE NULL
            END AS _motivo
        FROM diagnostico d
    ),
    filtrados AS (
        SELECT * FROM com_motivo WHERE _motivo IS NOT NULL
    ),
    totals AS (
        SELECT
            COUNT(*)::BIGINT AS t_total,
            COUNT(*) FILTER (WHERE _motivo = 'data_ausente')::BIGINT AS t_data,
            COUNT(*) FILTER (WHERE _motivo = 'etapa_errada')::BIGINT AS t_etapa
        FROM filtrados
    ),
    ordenados AS (
        SELECT f.*
        FROM filtrados f
        ORDER BY
            CASE f._motivo WHEN 'etapa_errada' THEN 0 ELSE 1 END,
            f.d_start NULLS LAST
        LIMIT p_limit
    )
    SELECT
        o.d_card_id::UUID         AS card_id,
        o.d_titulo::TEXT          AS titulo,
        prof.nome::TEXT           AS dono_atual_nome,
        o.d_stage_atual::UUID     AS stage_atual_id,
        s_atual.nome::TEXT        AS stage_atual_nome,
        o.d_stage_esperado::UUID  AS stage_esperado_id,
        s_esp.nome::TEXT          AS stage_esperado_nome,
        o.d_start::DATE           AS data_inicio,
        o.d_end::DATE             AS data_fim,
        o._motivo::TEXT           AS motivo,
        (SELECT t_total FROM totals) AS total_count,
        (SELECT t_data FROM totals)  AS total_data_ausente,
        (SELECT t_etapa FROM totals) AS total_etapa_errada
    FROM ordenados o
    LEFT JOIN profiles prof          ON prof.id = o.d_dono_id
    LEFT JOIN pipeline_stages s_atual ON s_atual.id = o.d_stage_atual
    LEFT JOIN pipeline_stages s_esp   ON s_esp.id = o.d_stage_esperado;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_operations_health TO authenticated;
