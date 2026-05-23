-- analytics_operations_health: detecta problemas operacionais em pós-venda.
-- Cenários cobertos:
--   1. data_ausente — card em pós-venda sem produto_data.data_exata_da_viagem
--      → confirmação pendente / quality gate violado silenciosamente
--   2. etapa_errada — card em pós-venda cuja etapa atual NÃO bate com
--      fn_calcular_etapa_pos_venda (cron de roteamento falhou ou data foi alterada
--      sem cron rodar)
--
-- Ambos casos: o sistema NÃO ENFORCE em runtime (cron diário), então precisa
-- ser monitorado.

CREATE OR REPLACE FUNCTION public.analytics_operations_health(
    p_owner_ids UUID[] DEFAULT NULL
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
    motivo             TEXT
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
            c.produto_data,
            c.created_at
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
            -- Tenta extrair datas de produto_data
            NULLIF(cp.produto_data->'data_exata_da_viagem'->>'start', '')::DATE AS d_start,
            NULLIF(cp.produto_data->'data_exata_da_viagem'->>'end', '')::DATE   AS d_end,
            -- Calcula etapa esperada via função existente
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
        m.motivo
    FROM com_motivo m
    LEFT JOIN profiles prof ON prof.id = m.dono_atual_id
    LEFT JOIN pipeline_stages s_atual ON s_atual.id = m.stage_atual_id
    LEFT JOIN pipeline_stages s_esp ON s_esp.id = m.stage_esperado_id
    WHERE m.motivo IS NOT NULL
    ORDER BY
        CASE m.motivo WHEN 'data_ausente' THEN 0 ELSE 1 END,
        m.d_start NULLS FIRST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_operations_health TO authenticated;

COMMENT ON FUNCTION public.analytics_operations_health IS
'Lista cards em pós-venda com problema: data_ausente (sem data de viagem em produto_data) ou etapa_errada (cron de roteamento não atualizou a etapa). Sistema NÃO enforce em runtime; só cron diário, daí precisar de monitor.';
