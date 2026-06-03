-- 20260603i — ww_drift_combos: aceitar p_tipos (filtro DW×Elopement nos heatmaps da aba Entrada×Realidade)
--
-- A função lê vw_ww_funnel_base (que já tem o `tipo` canônico combinado da 20260603f), mas não
-- filtrava por tipo → os 3 heatmaps "Onde a conversão acontece" + Top combos não respondiam ao
-- filtro DW/Elopement (enquanto o resto da aba, via ww_v2_drift_venda, já respondia).
--
-- REBASE (TOP 5 #5): parte da 20260603a (def viva, conversão sempre por safra). Só ADICIONA o
-- parâmetro p_tipos + um AND no temp table. Nada da lógica removido. DROP+CREATE (assinatura muda).

DROP FUNCTION IF EXISTS public.ww_drift_combos(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT);

CREATE FUNCTION public.ww_drift_combos(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_date_mode  TEXT DEFAULT 'cohort',
    p_tipos      TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total_leads INT; v_total_fechados INT;
    v_top_entrada JSON;
    v_combos_fechados JSON;
    v_matriz_faixa_conv JSON;
    v_matriz_faixa_destino JSON;
    v_matriz_destino_conv JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    -- Conversão é SEMPRE por safra: universo = quem ENTROU no período (data_entrada).
    CREATE TEMP TABLE _ww_dc ON COMMIT DROP AS
    SELECT v.faixa   AS faixa_e,
           v.destino AS dest_e,
           v.convidados AS conv_e,
           COALESCE(v.ganho, FALSE) AS fechou,
           v.ganho_at
      FROM vw_ww_funnel_base v
     WHERE v.data_entrada >= p_date_start AND v.data_entrada <= p_date_end
       AND (p_tipos IS NULL OR v.tipo = ANY(p_tipos));

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_leads, v_total_fechados FROM _ww_dc;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa_e, 'destino', dest_e, 'convidados', conv_e, 'qtd', qtd,
      'pct', CASE WHEN v_total_leads > 0 THEN ROUND(100.0 * qtd / v_total_leads, 1) END
    ) ORDER BY qtd DESC), '[]'::JSON) INTO v_top_entrada
    FROM (
      SELECT faixa_e, dest_e, conv_e, COUNT(*) AS qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, dest_e, conv_e ORDER BY COUNT(*) DESC LIMIT 10
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa_e, 'destino', dest_e, 'convidados', conv_e,
      'fechou', fechou_qtd, 'entrou', entrou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    ) ORDER BY fechou_qtd DESC), '[]'::JSON) INTO v_combos_fechados
    FROM (
      SELECT faixa_e, dest_e, conv_e,
             COUNT(*) FILTER (WHERE fechou) AS fechou_qtd,
             COUNT(*) AS entrou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, dest_e, conv_e
      HAVING COUNT(*) FILTER (WHERE fechou) > 0
       ORDER BY COUNT(*) FILTER (WHERE fechou) DESC LIMIT 10
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', faixa_e, 'y', conv_e, 'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_faixa_conv
    FROM (
      SELECT faixa_e, conv_e, COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, conv_e
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', faixa_e, 'y', dest_e, 'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_faixa_destino
    FROM (
      SELECT faixa_e, dest_e, COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL
       GROUP BY faixa_e, dest_e
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', conv_e, 'y', dest_e, 'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_destino_conv
    FROM (
      SELECT conv_e, dest_e, COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE conv_e IS NOT NULL AND dest_e IS NOT NULL
       GROUP BY conv_e, dest_e
    ) g;

    DROP TABLE _ww_dc;
    RETURN json_build_object(
      'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', 'cohort',
      'total_leads', v_total_leads, 'total_fechados', v_total_fechados,
      'top_combos_entrada', v_top_entrada,
      'top_combos_fechados', v_combos_fechados,
      'matriz_faixa_conv', v_matriz_faixa_conv,
      'matriz_faixa_destino', v_matriz_faixa_destino,
      'matriz_destino_conv', v_matriz_destino_conv,
      'fonte_marcos', 'vw_ww_funnel_base (cache AC) — conversão sempre por safra + filtro tipo'
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww_drift_combos(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[]) TO authenticated;
