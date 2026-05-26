-- Normalização AGRESSIVA: unifica todas as variações em 6 buckets canônicos
CREATE OR REPLACE FUNCTION public._ww2_norm_conv_strict(p_raw TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v TEXT;
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    v := LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(p_raw, '_', ' ', 'g'), '\s+', ' ', 'g')));
    -- remover acentos básicos
    v := TRANSLATE(v, 'áàâãéêíóôõúç', 'aaaaeeiooouc');
    -- bucketizar
    IF v LIKE '%apenas%casal%' OR v LIKE '%so o casal%' THEN RETURN 'Apenas o casal'; END IF;
    IF v LIKE '%ate 20%' THEN RETURN 'Até 20'; END IF;
    IF v LIKE '%20 a 50%' OR v LIKE '%menos de 50%' OR v LIKE '%ate de 50%' THEN RETURN '20-50'; END IF;
    IF v LIKE '%50 a 80%' THEN RETURN '50-80'; END IF;
    IF v LIKE '%50 e 100%' THEN RETURN '50-80'; END IF;  -- categoria antiga "50 e 100"→buckets mais novos
    IF v LIKE '%80 a 100%' OR v LIKE '%80 e 100%' THEN RETURN '80-100'; END IF;
    IF v LIKE '%acima de 100%' OR v LIKE '%mais de 100%' OR v LIKE '%+100%' THEN RETURN '+100'; END IF;
    RETURN NULL;  -- só categorias canônicas, ignora ruído
END $$;

CREATE OR REPLACE FUNCTION public._ww2_norm_faixa_strict(p_raw TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v TEXT;
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    v := LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(p_raw, '_', ' ', 'g'), '\s+', ' ', 'g')));
    v := TRANSLATE(v, 'áàâãéêíóôõúç', 'aaaaeeiooouc');
    IF v LIKE '%menos de r$50%' OR v LIKE '%ate r$50%' OR v LIKE '%ate de r$50%' THEN RETURN 'Até R$50 mil'; END IF;
    IF v LIKE '%r$50 e r$80%' THEN RETURN 'R$50-80 mil'; END IF;
    IF v LIKE '%r$80 e r$100%' THEN RETURN 'R$80-100 mil'; END IF;
    IF v LIKE '%r$50 e r$100%' THEN RETURN 'R$50-100 mil'; END IF;
    IF v LIKE '%r$100 e r$200%' THEN RETURN 'R$100-200 mil'; END IF;
    IF v LIKE '%r$200 e r$500%' THEN RETURN 'R$200-500 mil'; END IF;
    IF v LIKE '%mais de r$500%' OR v LIKE '%acima de r$500%' THEN RETURN '+R$500 mil'; END IF;
    RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public._ww2_norm_dest_strict(p_raw TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v TEXT;
BEGIN
    IF p_raw IS NULL THEN RETURN NULL; END IF;
    v := LOWER(TRIM(REGEXP_REPLACE(REGEXP_REPLACE(p_raw, '_', ' ', 'g'), '\s+', ' ', 'g')));
    v := TRANSLATE(v, 'áàâãéêíóôõúç', 'aaaaeeiooouc');
    -- destinos canônicos da lista do formulário + variações comuns
    IF v LIKE '%nordeste%' OR v LIKE '%bahia%' OR v LIKE '%imbassa%' THEN RETURN 'Nordeste'; END IF;
    IF v LIKE '%caribe%' OR v LIKE '%cancun%' OR v LIKE '%punta cana%' OR v LIKE '%riviera maya%' OR v LIKE '%mexico%' OR v LIKE '%dominicana%' OR v LIKE '%hard rock%' OR v LIKE '%dreams %' OR v LIKE '%palladium%' OR v LIKE '%impressive%' THEN RETURN 'Caribe'; END IF;
    IF v LIKE '%italia%' OR v LIKE '%agriturismo%' OR v LIKE '%toscana%' OR v LIKE '%amalfi%' OR v LIKE '%positano%' THEN RETURN 'Itália'; END IF;
    IF v LIKE '%mendoza%' OR v LIKE '%argentina%' THEN RETURN 'Mendoza'; END IF;
    IF v LIKE '%portugal%' OR v LIKE '%lisboa%' OR v LIKE '%porto%' THEN RETURN 'Portugal'; END IF;
    IF v LIKE '%maldivas%' THEN RETURN 'Maldivas'; END IF;
    IF v LIKE '%europa%' THEN RETURN 'Europa'; END IF;
    IF v = 'outro' OR v = 'outras' OR v = 'outros' THEN RETURN 'Outro'; END IF;
    IF v LIKE '%fora do brasil%' OR v LIKE '%fora brasil%' THEN RETURN 'Fora do Brasil'; END IF;
    RETURN 'Outro';  -- qualquer não-canônico vira "Outro"
END $$;

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
    v_conv_summary JSON; v_inv_summary JSON; v_dest_summary JSON;
    v_conv_transicoes JSON; v_inv_transicoes JSON; v_dest_transicoes JSON;
    v_inv_valores JSON;
    v_outro_textos JSON;
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

    -- ── STATS GLOBAIS por dimensão (taxa de refinamento honesta) ──
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
        'com_valor_pacote', COUNT(*) FILTER (WHERE valor_pac > 5000)  -- filtra outliers <R$5k
    ) INTO v_inv_stats FROM _ww2_er;
    SELECT json_build_object(
        'com_entrada', COUNT(*) FILTER (WHERE dest_e IS NOT NULL),
        'com_refinado', COUNT(*) FILTER (WHERE dest_r IS NOT NULL),
        'com_ambos', COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_r IS NOT NULL),
        'manteve', COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_r IS NOT NULL AND dest_e = dest_r),
        'mudou', COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_r IS NOT NULL AND dest_e != dest_r)
    ) INTO v_dest_stats FROM _ww2_er;

    -- ── SUMÁRIO por categoria de entrada (SÓ leads com AMBOS preenchidos) ──
    -- Convidados (ordem)
    WITH ord AS (SELECT * FROM (VALUES ('Apenas o casal',1),('Até 20',2),('20-50',3),('50-80',4),('80-100',5),('+100',6)) AS o(cat,n))
    SELECT json_agg(json_build_object(
        'entrada', conv_e, 'total', total, 'manteve', manteve, 'subiu', subiu, 'desceu', desceu,
        'pct_manteve', ROUND(100.0 * manteve / NULLIF(total, 0), 0),
        'top_destino', top_dest, 'amostra_suficiente', total >= 10
    ) ORDER BY ordem) INTO v_conv_summary
    FROM (
        SELECT e.conv_e,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE e.conv_r = e.conv_e) AS manteve,
               COUNT(*) FILTER (WHERE oe.n < orr.n) AS subiu,
               COUNT(*) FILTER (WHERE oe.n > orr.n) AS desceu,
               (SELECT conv_r FROM _ww2_er j2 WHERE j2.conv_e = e.conv_e AND j2.conv_r IS NOT NULL AND j2.conv_r != e.conv_e
                GROUP BY conv_r ORDER BY COUNT(*) DESC LIMIT 1) AS top_dest,
               oe.n AS ordem
          FROM _ww2_er e
          JOIN ord oe ON oe.cat = e.conv_e
          LEFT JOIN ord orr ON orr.cat = e.conv_r
         WHERE e.conv_e IS NOT NULL AND e.conv_r IS NOT NULL
         GROUP BY e.conv_e, oe.n
    ) x;

    -- Investimento
    WITH ord AS (SELECT * FROM (VALUES ('Até R$50 mil',1),('R$50-80 mil',2),('R$50-100 mil',3),('R$80-100 mil',4),('R$100-200 mil',5),('R$200-500 mil',6),('+R$500 mil',7)) AS o(cat,n))
    SELECT json_agg(json_build_object(
        'entrada', inv_e, 'total', total, 'manteve', manteve, 'subiu', subiu, 'desceu', desceu,
        'pct_manteve', ROUND(100.0 * manteve / NULLIF(total, 0), 0),
        'top_destino', top_dest, 'amostra_suficiente', total >= 10
    ) ORDER BY ordem) INTO v_inv_summary
    FROM (
        SELECT e.inv_e,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE e.inv_r = e.inv_e) AS manteve,
               COUNT(*) FILTER (WHERE oe.n < orr.n) AS subiu,
               COUNT(*) FILTER (WHERE oe.n > orr.n) AS desceu,
               (SELECT inv_r FROM _ww2_er j2 WHERE j2.inv_e = e.inv_e AND j2.inv_r IS NOT NULL AND j2.inv_r != e.inv_e
                GROUP BY inv_r ORDER BY COUNT(*) DESC LIMIT 1) AS top_dest,
               oe.n AS ordem
          FROM _ww2_er e
          JOIN ord oe ON oe.cat = e.inv_e
          LEFT JOIN ord orr ON orr.cat = e.inv_r
         WHERE e.inv_e IS NOT NULL AND e.inv_r IS NOT NULL
         GROUP BY e.inv_e, oe.n
    ) x;

    -- Destino
    SELECT json_agg(json_build_object(
        'entrada', dest_e, 'total', total, 'manteve', manteve, 'mudou', mudou,
        'pct_manteve', ROUND(100.0 * manteve / NULLIF(total, 0), 0),
        'top_destino', top_dest, 'amostra_suficiente', total >= 10
    ) ORDER BY total DESC) INTO v_dest_summary
    FROM (
        SELECT e.dest_e,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE e.dest_r = e.dest_e) AS manteve,
               COUNT(*) FILTER (WHERE e.dest_r != e.dest_e) AS mudou,
               (SELECT dest_r FROM _ww2_er j2 WHERE j2.dest_e = e.dest_e AND j2.dest_r IS NOT NULL AND j2.dest_r != e.dest_e
                GROUP BY dest_r ORDER BY COUNT(*) DESC LIMIT 1) AS top_dest
          FROM _ww2_er e
         WHERE e.dest_e IS NOT NULL AND e.dest_r IS NOT NULL
         GROUP BY e.dest_e
    ) x;

    -- ── TRANSIÇÕES (top 8 onde entrada != real) ──
    SELECT json_agg(json_build_object('de',de,'para',para,'qtd',qtd) ORDER BY qtd DESC) INTO v_conv_transicoes
    FROM (SELECT conv_e AS de, conv_r AS para, COUNT(*) AS qtd FROM _ww2_er
          WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND conv_e != conv_r
          GROUP BY conv_e, conv_r ORDER BY COUNT(*) DESC LIMIT 8) x;
    SELECT json_agg(json_build_object('de',de,'para',para,'qtd',qtd) ORDER BY qtd DESC) INTO v_inv_transicoes
    FROM (SELECT inv_e AS de, inv_r AS para, COUNT(*) AS qtd FROM _ww2_er
          WHERE inv_e IS NOT NULL AND inv_r IS NOT NULL AND inv_e != inv_r
          GROUP BY inv_e, inv_r ORDER BY COUNT(*) DESC LIMIT 8) x;
    SELECT json_agg(json_build_object('de',de,'para',para,'qtd',qtd) ORDER BY qtd DESC) INTO v_dest_transicoes
    FROM (SELECT dest_e AS de, dest_r AS para, COUNT(*) AS qtd FROM _ww2_er
          WHERE dest_e IS NOT NULL AND dest_r IS NOT NULL AND dest_e != dest_r
          GROUP BY dest_e, dest_r ORDER BY COUNT(*) DESC LIMIT 10) x;

    -- ── VALORES de pacote por faixa entrada (excluindo outliers < R$5k) ──
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

    -- ── TEXTOS LIVRES quando "Outro" ──
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
            'sumario', COALESCE(v_conv_summary, '[]'::JSON),
            'top_transicoes', COALESCE(v_conv_transicoes, '[]'::JSON)
        ),
        'investimento', json_build_object(
            'stats', v_inv_stats,
            'sumario', COALESCE(v_inv_summary, '[]'::JSON),
            'top_transicoes', COALESCE(v_inv_transicoes, '[]'::JSON),
            'valores_por_faixa', COALESCE(v_inv_valores, '[]'::JSON)
        ),
        'destino', json_build_object(
            'stats', v_dest_stats,
            'sumario', COALESCE(v_dest_summary, '[]'::JSON),
            'top_transicoes', COALESCE(v_dest_transicoes, '[]'::JSON),
            'destino_livre_quando_outro', COALESCE(v_outro_textos, '[]'::JSON)
        )
    );
END $func$;
