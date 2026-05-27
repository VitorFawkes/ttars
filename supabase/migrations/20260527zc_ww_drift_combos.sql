-- ============================================================================
-- ww_drift_combos — análises cruzadas em Entrada × Realidade
--
-- Permite que a tab "Entrada × Realidade" mostre cruzamentos ricos de
-- Investimento × Convidados × Destino, identificando combos vencedores e
-- células de alta/baixa conversão sem precisar de marketing/UTM.
--
-- Returna:
--   - top_combos_entrada: 10 perfis 3D mais comuns entre quem ENTROU
--   - top_combos_fechados: 10 perfis 3D mais comuns entre quem FECHOU + taxa
--   - matriz_faixa_conv, matriz_faixa_destino, matriz_destino_conv: heatmaps
--     2D com entrou, fechou e taxa em cada célula
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww_drift_combos(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_date_mode  TEXT DEFAULT 'cohort'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total_leads INT := 0;
    v_total_fechados INT := 0;
    v_combos_entrada JSON;
    v_combos_fechados JSON;
    v_matriz_faixa_conv JSON;
    v_matriz_faixa_destino JSON;
    v_matriz_destino_conv JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww_dc ON COMMIT DROP AS
    SELECT _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa_e,
           _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form')    AS dest_e,
           _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS conv_e,
           (NULLIF(c.produto_data->>'ww_closer_data_ganho','') IS NOT NULL) AS fechou
      FROM cards c
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND (
         (p_date_mode = 'cohort'
            AND c.created_at >= p_date_start AND c.created_at <= p_date_end)
         OR
         (p_date_mode = 'throughput'
            AND NULLIF(c.produto_data->>'ww_closer_data_ganho','')::TIMESTAMPTZ >= p_date_start
            AND NULLIF(c.produto_data->>'ww_closer_data_ganho','')::TIMESTAMPTZ <= p_date_end)
       );

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_leads, v_total_fechados FROM _ww_dc;

    -- Top 10 combos 3D entre quem ENTROU
    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa_e, 'destino', dest_e, 'convidados', conv_e,
      'qtd', qtd,
      'pct', CASE WHEN v_total_leads > 0 THEN ROUND(100.0 * qtd / v_total_leads, 1) END
    ) ORDER BY qtd DESC), '[]'::JSON) INTO v_combos_entrada
    FROM (
      SELECT faixa_e, dest_e, conv_e, COUNT(*) AS qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, dest_e, conv_e
       HAVING COUNT(*) >= 2
       ORDER BY COUNT(*) DESC LIMIT 10
    ) g;

    -- Top 10 combos 3D entre quem FECHOU
    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa_e, 'destino', dest_e, 'convidados', conv_e,
      'fechou', fechou_qtd, 'entrou', entrou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    ) ORDER BY fechou_qtd DESC), '[]'::JSON) INTO v_combos_fechados
    FROM (
      SELECT faixa_e, dest_e, conv_e,
             COUNT(*) AS entrou_qtd,
             COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, dest_e, conv_e
       HAVING COUNT(*) FILTER (WHERE fechou) >= 1
       ORDER BY COUNT(*) FILTER (WHERE fechou) DESC LIMIT 10
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', faixa_e, 'y', conv_e,
      'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_faixa_conv
    FROM (
      SELECT faixa_e, conv_e,
             COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, conv_e HAVING COUNT(*) >= 2
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', faixa_e, 'y', dest_e,
      'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_faixa_destino
    FROM (
      SELECT faixa_e, dest_e,
             COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL
       GROUP BY faixa_e, dest_e HAVING COUNT(*) >= 2
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', conv_e, 'y', dest_e,
      'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_destino_conv
    FROM (
      SELECT conv_e, dest_e,
             COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE conv_e IS NOT NULL AND dest_e IS NOT NULL
       GROUP BY conv_e, dest_e HAVING COUNT(*) >= 2
    ) g;

    DROP TABLE _ww_dc;
    RETURN json_build_object(
      'date_start', p_date_start, 'date_end', p_date_end,
      'date_mode', p_date_mode,
      'total_leads', v_total_leads,
      'total_fechados', v_total_fechados,
      'top_combos_entrada', v_combos_entrada,
      'top_combos_fechados', v_combos_fechados,
      'matriz_faixa_conv', v_matriz_faixa_conv,
      'matriz_faixa_destino', v_matriz_faixa_destino,
      'matriz_destino_conv', v_matriz_destino_conv
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_drift_combos(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT) TO authenticated;
