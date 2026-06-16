-- analytics_planner_forecast_by_dono — Previsão de fechamento só da etapa Planner
--
-- PROBLEMA (reportado pelo Vitor): ao filtrar/agrupar por pessoa no gráfico de
-- "Previsão de fechamento", o valor não batia com o pipeline daquela pessoa.
--
-- CAUSA RAIZ (verificada em prod, Welcome Trips, 585 cards abertos):
--   1) A função creditava todo card ao `vendas_owner_id`, mas o quadro/Kanban
--      mostra a pessoa por `dono_atual_id` (filtro "Responsáveis / Dono Atual").
--      Em 60% dos cards abertos esses dois campos divergem, e 105 cards (R$ 286k)
--      não tinham vendas_owner → sumiam totalmente do gráfico.
--   2) A função contava cards de TODAS as fases (SDR, Planner, Pós-venda), não só
--      os que estão de fato na etapa de Planner.
--   3) Valor usava COALESCE(valor_estimado, valor_final) — invertido em relação à
--      convenção do projeto (valor_final primeiro), usada no resto do CRM.
--
-- DECISÃO (Vitor): a previsão deve mostrar APENAS cards que estão na etapa de
-- Planner, creditando ao planner atual do card. Dentro da fase Planner,
-- dono_atual_id == vendas_owner_id (0 divergências em prod), então creditar pelo
-- dono atual passa a bater exatamente com o quadro da pessoa.
--
-- COMO:
--   - Restringe à fase cujo owner_field = 'vendas_owner_id' (a fase "Planner";
--     robusto entre produtos, sem depender de slug que colide entre pipelines).
--   - Credita por COALESCE(dono_atual_id, vendas_owner_id) (= planner atual).
--   - Valor por COALESCE(valor_final, valor_estimado, 0) (convenção do projeto).

DROP FUNCTION IF EXISTS public.analytics_planner_forecast_by_dono(date, date, uuid[], numeric, numeric, text[], uuid[], text);

CREATE FUNCTION public.analytics_planner_forecast_by_dono(
    p_date_start DATE        DEFAULT CURRENT_DATE,
    p_date_end   DATE        DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    p_owner_ids  UUID[]      DEFAULT NULL,
    p_value_min  NUMERIC     DEFAULT NULL,
    p_value_max  NUMERIC     DEFAULT NULL,
    p_origens    TEXT[]      DEFAULT NULL,
    p_stage_ids  UUID[]      DEFAULT NULL,
    p_product    TEXT        DEFAULT NULL
)
RETURNS TABLE(
    card_id        UUID,
    card_titulo    TEXT,
    valor          NUMERIC,
    data_prevista  DATE,
    planner_id     UUID,
    planner_nome   TEXT,
    origem         TEXT,
    stage_id       UUID,
    stage_nome     TEXT,
    phase_slug     TEXT,
    destino        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    SELECT
        c.id AS card_id,
        c.titulo AS card_titulo,
        COALESCE(c.valor_final, c.valor_estimado, 0)::NUMERIC AS valor,          -- ✨ convenção: valor_final primeiro
        _safe_date(c.produto_data->>'data_prevista_fechamento') AS data_prevista,
        COALESCE(c.dono_atual_id, c.vendas_owner_id) AS planner_id,              -- ✨ planner atual (= dono na fase Planner)
        p.nome AS planner_nome,
        COALESCE(NULLIF(c.origem, ''), 'sem_origem')::TEXT AS origem,
        c.pipeline_stage_id AS stage_id,
        s.nome AS stage_nome,
        pp.slug AS phase_slug,
        COALESCE(
            NULLIF(c.produto_data->>'destino', ''),
            NULLIF(c.produto_data->>'ww_mkt_destino_form', ''),
            'sem_destino'
        )::TEXT AS destino
    FROM cards c
    JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    JOIN profiles p ON p.id = COALESCE(c.dono_atual_id, c.vendas_owner_id)
    WHERE c.org_id = v_org
      AND pp.owner_field = 'vendas_owner_id'                                     -- ✨ SÓ a etapa de Planner
      AND COALESCE(c.dono_atual_id, c.vendas_owner_id) IS NOT NULL
      AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial NOT IN ('ganho', 'perdido')
      AND COALESCE(c.card_type, 'standard') != 'sub_card'
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
           OR COALESCE(c.dono_atual_id, c.vendas_owner_id) = ANY(p_owner_ids))
      AND (p_origens IS NULL OR COALESCE(array_length(p_origens, 1), 0) = 0
           OR COALESCE(NULLIF(c.origem, ''), 'sem_origem') = ANY(p_origens))
      AND (p_stage_ids IS NULL OR COALESCE(array_length(p_stage_ids, 1), 0) = 0
           OR c.pipeline_stage_id = ANY(p_stage_ids))
      AND c.produto_data IS NOT NULL
      AND _safe_date(c.produto_data->>'data_prevista_fechamento') BETWEEN p_date_start AND p_date_end
      AND (p_value_min IS NULL OR COALESCE(c.valor_final, c.valor_estimado, 0) >= p_value_min)
      AND (p_value_max IS NULL OR COALESCE(c.valor_final, c.valor_estimado, 0) <= p_value_max)
    ORDER BY data_prevista ASC, valor DESC;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.analytics_planner_forecast_by_dono(date, date, uuid[], numeric, numeric, text[], uuid[], text) TO authenticated;
