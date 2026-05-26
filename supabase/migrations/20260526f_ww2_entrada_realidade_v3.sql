CREATE OR REPLACE FUNCTION public.ww2_entrada_realidade(
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
    v_conv_stats JSON; v_inv_stats JSON; v_dest_stats JSON;
    v_conv_matriz JSON; v_inv_matriz JSON; v_dest_matriz JSON;
    v_conv_categorias JSON; v_inv_categorias JSON; v_dest_categorias JSON;
    v_inv_valores JSON;
    v_outro_textos JSON;
    v_cross_inv_conv JSON; v_cross_inv_dest JSON; v_cross_conv_dest JSON;
    v_inv_pacote_por_conv JSON; v_inv_pacote_por_dest JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_er ON COMMIT DROP AS
    SELECT c.id, c.status_comercial, c.valor_final,
           _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS conv_e,
           _ww2_norm_conv_strict(c.produto_data->>'ww_convidados_refinado') AS conv_r,
           _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS inv_e,
           _ww2_norm_faixa_strict(c.produto_data->>'ww_investimento_refinado') AS inv_r,
           NULLIF(REPLACE(REPLACE(c.produto_data->>'ww_closer_valor_pacote','.',''),',','.'),'')::NUMERIC AS valor_pac,
           _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form') AS dest_e,
           COALESCE(
             _ww2_norm_dest_strict(c.produto_data->>'ww_onde_casar_refinado'),
             _ww2_norm_dest_strict(c.produto_data->>'ww_destino')
           ) AS dest_r,
           NULLIF(c.produto_data->>'ww_destino_livre_refinado','') AS dest_livre,
           _ww2_norm_origem(c.marketing_data) AS origem,
           ph.slug AS phase_slug,
           (c.status_comercial='ganho' OR ph.slug='pos_venda') AS fechado
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;
    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_er WHERE origem != ALL(p_origins); END IF;
    IF p_only_fechados THEN DELETE FROM _ww2_er WHERE NOT fechado; END IF;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechado) INTO v_total, v_total_fechados FROM _ww2_er;

    -- Categorias canônicas em ordem
    v_conv_categorias := '["Apenas o casal","Até 20","20-50","50-80","80-100","+100"]'::JSON;
    v_inv_categorias := '["Até R$50 mil","R$50-80 mil","R$50-100 mil","R$80-100 mil","R$100-200 mil","R$200-500 mil","+R$500 mil"]'::JSON;
    -- Destinos: usar os encontrados (com >=5 ocorrências na entrada ou refinado)
    SELECT json_agg(d ORDER BY tot DESC) INTO v_dest_categorias FROM (
        SELECT d, SUM(c) AS tot FROM (
            SELECT dest_e AS d, COUNT(*) AS c FROM _ww2_er WHERE dest_e IS NOT NULL GROUP BY dest_e
            UNION ALL
            SELECT dest_r, COUNT(*) FROM _ww2_er WHERE dest_r IS NOT NULL GROUP BY dest_r
        ) x GROUP BY d HAVING SUM(c) >= 5
    ) y;

    -- ── STATS GLOBAIS ──
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
        'com_valor_pacote', COUNT(*) FILTER (WHERE valor_pac >= 5000)
    ) INTO v_inv_stats FROM _ww2_er;
    SELECT json_build_object(
        'com_entrada', COUNT(*) FILTER (WHERE dest_e IS NOT NULL),
        'com_refinado', COUNT(*) FILTER (WHERE dest_r IS NOT NULL),
        'com_ambos', COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_r IS NOT NULL),
        'manteve', COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_r IS NOT NULL AND dest_e = dest_r),
        'mudou', COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_r IS NOT NULL AND dest_e != dest_r)
    ) INTO v_dest_stats FROM _ww2_er;

    -- ── MATRIZES DE TRANSIÇÃO ENTRADA × REFINADO (qtd absoluta) ──
    SELECT json_agg(json_build_object('e', conv_e, 'r', conv_r, 'qtd', qtd)) INTO v_conv_matriz
    FROM (SELECT conv_e, conv_r, COUNT(*) AS qtd FROM _ww2_er
          WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL
          GROUP BY conv_e, conv_r) x;
    SELECT json_agg(json_build_object('e', inv_e, 'r', inv_r, 'qtd', qtd)) INTO v_inv_matriz
    FROM (SELECT inv_e, inv_r, COUNT(*) AS qtd FROM _ww2_er
          WHERE inv_e IS NOT NULL AND inv_r IS NOT NULL
          GROUP BY inv_e, inv_r) x;
    SELECT json_agg(json_build_object('e', dest_e, 'r', dest_r, 'qtd', qtd)) INTO v_dest_matriz
    FROM (SELECT dest_e, dest_r, COUNT(*) AS qtd FROM _ww2_er
          WHERE dest_e IS NOT NULL AND dest_r IS NOT NULL
          GROUP BY dest_e, dest_r) x;

    -- ── CRUZAMENTOS REALIDADE × REALIDADE (perfil real) ──
    SELECT json_agg(json_build_object('inv', inv_r, 'conv', conv_r, 'qtd', qtd)) INTO v_cross_inv_conv
    FROM (SELECT inv_r, conv_r, COUNT(*) AS qtd FROM _ww2_er
          WHERE inv_r IS NOT NULL AND conv_r IS NOT NULL
          GROUP BY inv_r, conv_r) x;
    SELECT json_agg(json_build_object('inv', inv_r, 'dest', dest_r, 'qtd', qtd)) INTO v_cross_inv_dest
    FROM (SELECT inv_r, dest_r, COUNT(*) AS qtd FROM _ww2_er
          WHERE inv_r IS NOT NULL AND dest_r IS NOT NULL
          GROUP BY inv_r, dest_r) x;
    SELECT json_agg(json_build_object('conv', conv_r, 'dest', dest_r, 'qtd', qtd)) INTO v_cross_conv_dest
    FROM (SELECT conv_r, dest_r, COUNT(*) AS qtd FROM _ww2_er
          WHERE conv_r IS NOT NULL AND dest_r IS NOT NULL
          GROUP BY conv_r, dest_r) x;

    -- ── VALOR PACOTE POR CATEGORIA REFINADA ──
    -- Por faixa investimento entrada (já tinha)
    WITH ord AS (SELECT * FROM (VALUES ('Até R$50 mil',1),('R$50-80 mil',2),('R$50-100 mil',3),('R$80-100 mil',4),('R$100-200 mil',5),('R$200-500 mil',6),('+R$500 mil',7)) AS o(cat,n))
    SELECT json_agg(json_build_object(
        'entrada', inv_e, 'amostra', amostra,
        'p25', p25, 'mediana', p50, 'p75', p75, 'media', media, 'minimo', minv, 'maximo', maxv,
        'amostra_suficiente', amostra >= 10
    ) ORDER BY ordem) INTO v_inv_valores
    FROM (
        SELECT inv_e, oe.n AS ordem,
               COUNT(*) FILTER (WHERE valor_pac >= 5000) AS amostra,
               ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS p25,
               ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS p50,
               ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS p75,
               ROUND(AVG(valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS media,
               MIN(valor_pac) FILTER (WHERE valor_pac >= 5000) AS minv,
               MAX(valor_pac) FILTER (WHERE valor_pac >= 5000) AS maxv
          FROM _ww2_er e
          JOIN ord oe ON oe.cat = e.inv_e
         WHERE inv_e IS NOT NULL
         GROUP BY inv_e, oe.n
    ) x WHERE amostra > 0;

    -- Por nº convidados refinado
    WITH ord AS (SELECT * FROM (VALUES ('Apenas o casal',1),('Até 20',2),('20-50',3),('50-80',4),('80-100',5),('+100',6)) AS o(cat,n))
    SELECT json_agg(json_build_object(
        'categoria', conv_r, 'amostra', amostra,
        'p25', p25, 'mediana', p50, 'p75', p75, 'media', media, 'minimo', minv, 'maximo', maxv
    ) ORDER BY ordem) INTO v_inv_pacote_por_conv
    FROM (
        SELECT conv_r, oe.n AS ordem,
               COUNT(*) FILTER (WHERE valor_pac >= 5000) AS amostra,
               ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS p25,
               ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS p50,
               ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS p75,
               ROUND(AVG(valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS media,
               MIN(valor_pac) FILTER (WHERE valor_pac >= 5000) AS minv,
               MAX(valor_pac) FILTER (WHERE valor_pac >= 5000) AS maxv
          FROM _ww2_er e
          JOIN ord oe ON oe.cat = e.conv_r
         WHERE conv_r IS NOT NULL
         GROUP BY conv_r, oe.n
    ) x WHERE amostra > 0;

    -- Por destino refinado
    SELECT json_agg(json_build_object(
        'categoria', dest_r, 'amostra', amostra,
        'p25', p25, 'mediana', p50, 'p75', p75, 'media', media, 'minimo', minv, 'maximo', maxv
    ) ORDER BY amostra DESC) INTO v_inv_pacote_por_dest
    FROM (
        SELECT dest_r,
               COUNT(*) FILTER (WHERE valor_pac >= 5000) AS amostra,
               ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS p25,
               ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS p50,
               ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS p75,
               ROUND(AVG(valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS media,
               MIN(valor_pac) FILTER (WHERE valor_pac >= 5000) AS minv,
               MAX(valor_pac) FILTER (WHERE valor_pac >= 5000) AS maxv
          FROM _ww2_er WHERE dest_r IS NOT NULL GROUP BY dest_r
    ) x WHERE amostra > 0;

    SELECT json_agg(json_build_object('texto', dest_livre, 'qtd', qtd)) INTO v_outro_textos
    FROM (SELECT dest_livre, COUNT(*) AS qtd FROM _ww2_er
          WHERE dest_e = 'Outro' AND dest_livre IS NOT NULL AND LENGTH(TRIM(dest_livre)) > 0
          GROUP BY dest_livre ORDER BY COUNT(*) DESC LIMIT 15) x;

    DROP TABLE _ww2_er;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'only_fechados', p_only_fechados,
        'total_leads', v_total, 'total_fechados', v_total_fechados,
        'convidados', json_build_object(
            'stats', v_conv_stats,
            'categorias', v_conv_categorias,
            'matriz', COALESCE(v_conv_matriz, '[]'::JSON)
        ),
        'investimento', json_build_object(
            'stats', v_inv_stats,
            'categorias', v_inv_categorias,
            'matriz', COALESCE(v_inv_matriz, '[]'::JSON),
            'valores_por_faixa_entrada', COALESCE(v_inv_valores, '[]'::JSON)
        ),
        'destino', json_build_object(
            'stats', v_dest_stats,
            'categorias', COALESCE(v_dest_categorias, '[]'::JSON),
            'matriz', COALESCE(v_dest_matriz, '[]'::JSON),
            'destino_livre_quando_outro', COALESCE(v_outro_textos, '[]'::JSON)
        ),
        'cross_real', json_build_object(
            'investimento_x_convidados', COALESCE(v_cross_inv_conv, '[]'::JSON),
            'investimento_x_destino', COALESCE(v_cross_inv_dest, '[]'::JSON),
            'convidados_x_destino', COALESCE(v_cross_conv_dest, '[]'::JSON),
            'valor_pacote_por_convidados', COALESCE(v_inv_pacote_por_conv, '[]'::JSON),
            'valor_pacote_por_destino', COALESCE(v_inv_pacote_por_dest, '[]'::JSON)
        )
    );
END $func$;
