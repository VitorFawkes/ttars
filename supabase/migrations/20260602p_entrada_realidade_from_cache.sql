-- ============================================================================
-- Fase C — aba ENTRADA × REALIDADE lê do cache AC (não mais de cards).
-- Compara DECLARADO (form: faixa/convidados) × REAL (orçamento/convidados reais).
-- DESTINO real e VALOR DE PACOTE: ignorados (o AC não guarda) → seções vazias.
--
-- Orçamento real vem com unidade bagunçada (29 casos: "200"=200mil, "2000000"=200mil
-- com zero a mais, R$20k, euros...). Regra de normalização (assumindo tudo >= R$50 mil):
--   valor < 1000  → ×1000  ("200" = 200 mil)
--   valor > 1.000.000 → ÷10 (zero digitado a mais)
--   piso de R$50.000 (nada abaixo disso)
-- depois bucketiza na MESMA faixa do declarado.
-- ============================================================================

-- Normalizador do orçamento real → faixa (mesmos rótulos do declarado)
CREATE OR REPLACE FUNCTION public._ww_ac_orcamento_real_faixa(p_valor NUMERIC)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v NUMERIC;
BEGIN
    IF p_valor IS NULL OR p_valor <= 0 THEN RETURN NULL; END IF;
    v := p_valor;
    IF v < 1000 THEN v := v * 1000; END IF;        -- "200" = 200 mil
    WHILE v > 1000000 LOOP v := v / 10; END LOOP;   -- zero(s) a mais
    v := GREATEST(v, 50000);                        -- piso: tudo >= R$50 mil
    RETURN CASE
        WHEN v <= 50000  THEN 'Até R$50 mil'
        WHEN v <= 80000  THEN 'R$50-80 mil'
        WHEN v <= 100000 THEN 'R$80-100 mil'
        WHEN v <= 200000 THEN 'R$100-200 mil'
        WHEN v <= 500000 THEN 'R$200-500 mil'
        ELSE '+R$500 mil'
    END;
END $$;

DROP FUNCTION IF EXISTS public.ww2_entrada_realidade(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], BOOLEAN);

CREATE FUNCTION public.ww2_entrada_realidade(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '365 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_only_fechados BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total INT; v_total_fechados INT;
    v_conv_categorias JSON; v_inv_categorias JSON; v_dest_categorias JSON;
    v_conv_stats JSON; v_inv_stats JSON; v_dest_stats JSON;
    v_conv_matriz JSON; v_inv_matriz JSON; v_dest_matriz JSON;
    v_cross_inv_conv JSON; v_cross_inv_dest JSON; v_cross_conv_dest JSON;
    v_inv_valores JSON; v_inv_pacote_por_conv JSON; v_inv_pacote_por_dest JSON;
    v_outro_textos JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_er ON COMMIT DROP AS
    SELECT c.ac_deal_id AS id,
           COALESCE(c.marco_ganho,FALSE) AS fechado,
           _ww2_norm_conv_strict(c.convidados_raw) AS conv_e,
           -- convidados real → MESMOS buckets do declarado
           CASE WHEN c.real_convidados_parsed IS NULL THEN NULL
                WHEN c.real_convidados_parsed <= 2   THEN 'Apenas o casal'
                WHEN c.real_convidados_parsed <= 20  THEN 'Até 20'
                WHEN c.real_convidados_parsed <= 50  THEN '20-50'
                WHEN c.real_convidados_parsed <= 80  THEN '50-80'
                WHEN c.real_convidados_parsed <= 100 THEN '80-100'
                ELSE '+100' END AS conv_r,
           _ww2_norm_faixa_strict(c.faixa_raw) AS inv_e,
           _ww_ac_orcamento_real_faixa(c.real_orcamento_parsed) AS inv_r,
           NULL::NUMERIC AS valor_pac,           -- ignorado (AC não tem)
           _ww2_norm_dest_strict(c.destino_raw) AS dest_e,
           NULL::TEXT AS dest_r,                  -- ignorado (AC não tem destino real)
           NULL::TEXT AS dest_livre,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           c.marco_ganho AS fechado2
      FROM ww_ac_deal_funnel_cache c
     WHERE COALESCE(c.is_ww,TRUE) AND NOT COALESCE(c.is_duplicado,FALSE)
       AND (
         (p_only_fechados AND c.marco_ganho AND c.ganho_at >= p_date_start AND c.ganho_at <= p_date_end)
         OR
         (NOT p_only_fechados AND c.deal_created_at >= p_date_start AND c.deal_created_at <= p_date_end)
       );
    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_er WHERE origem != ALL(p_origins); END IF;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechado) INTO v_total, v_total_fechados FROM _ww2_er;

    v_conv_categorias := '["Apenas o casal","Até 20","20-50","50-80","80-100","+100"]'::JSON;
    v_inv_categorias := '["Até R$50 mil","R$50-80 mil","R$50-100 mil","R$80-100 mil","R$100-200 mil","R$200-500 mil","+R$500 mil"]'::JSON;
    v_dest_categorias := '[]'::JSON;   -- destino real ignorado

    SELECT json_build_object(
        'com_entrada', COUNT(*) FILTER (WHERE conv_e IS NOT NULL),
        'com_refinado', COUNT(*) FILTER (WHERE conv_r IS NOT NULL),
        'com_ambos', COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL),
        'manteve', COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND conv_e = conv_r),
        'mudou', COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND conv_e != conv_r)
    ) INTO v_conv_stats FROM _ww2_er;
    SELECT json_build_object(
        'com_entrada', COUNT(*) FILTER (WHERE inv_e IS NOT NULL),
        'com_refinado', COUNT(*) FILTER (WHERE inv_r IS NOT NULL),
        'com_ambos', COUNT(*) FILTER (WHERE inv_e IS NOT NULL AND inv_r IS NOT NULL),
        'manteve', COUNT(*) FILTER (WHERE inv_e IS NOT NULL AND inv_r IS NOT NULL AND inv_e = inv_r),
        'mudou', COUNT(*) FILTER (WHERE inv_e IS NOT NULL AND inv_r IS NOT NULL AND inv_e != inv_r),
        'com_valor_pacote', 0
    ) INTO v_inv_stats FROM _ww2_er;
    v_dest_stats := json_build_object('com_entrada',0,'com_refinado',0,'com_ambos',0,'manteve',0,'mudou',0);

    SELECT json_agg(json_build_object('e', conv_e, 'r', conv_r, 'qtd', qtd)) INTO v_conv_matriz
    FROM (SELECT conv_e, conv_r, COUNT(*) AS qtd FROM _ww2_er
          WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL GROUP BY conv_e, conv_r) x;
    SELECT json_agg(json_build_object('e', inv_e, 'r', inv_r, 'qtd', qtd)) INTO v_inv_matriz
    FROM (SELECT inv_e, inv_r, COUNT(*) AS qtd FROM _ww2_er
          WHERE inv_e IS NOT NULL AND inv_r IS NOT NULL GROUP BY inv_e, inv_r) x;
    v_dest_matriz := '[]'::JSON;
    v_cross_inv_conv := '[]'::JSON; v_cross_inv_dest := '[]'::JSON; v_cross_conv_dest := '[]'::JSON;
    v_inv_valores := '[]'::JSON; v_inv_pacote_por_conv := '[]'::JSON; v_inv_pacote_por_dest := '[]'::JSON;
    v_outro_textos := '[]'::JSON;

    DROP TABLE _ww2_er;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'only_fechados', p_only_fechados,
        'date_mode_used', CASE WHEN p_only_fechados THEN 'data_venda' ELSE 'data_entrada' END,
        'total_leads', v_total, 'total_fechados', v_total_fechados,
        'convidados', json_build_object('stats', v_conv_stats, 'categorias', v_conv_categorias, 'matriz', COALESCE(v_conv_matriz, '[]'::JSON)),
        'investimento', json_build_object('stats', v_inv_stats, 'categorias', v_inv_categorias, 'matriz', COALESCE(v_inv_matriz, '[]'::JSON), 'valores_por_faixa_entrada', '[]'::JSON),
        'destino', json_build_object('stats', v_dest_stats, 'categorias', '[]'::JSON, 'matriz', '[]'::JSON, 'destino_livre_quando_outro', '[]'::JSON),
        'cross_real', json_build_object('investimento_x_convidados', '[]'::JSON, 'investimento_x_destino', '[]'::JSON, 'convidados_x_destino', '[]'::JSON, 'valor_pacote_por_convidados', '[]'::JSON, 'valor_pacote_por_destino', '[]'::JSON)
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww2_entrada_realidade(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], BOOLEAN) TO authenticated;
