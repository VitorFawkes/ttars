-- ============================================================================
-- Weddings — 2 RPCs para Diretor de Vendas
--
-- ww_qualidade_lead  — Visão A: "que tipo de lead vira venda?"
--   Universo: leads que ENTRARAM no período (filtro por created_at)
--   Por faixa de entrada (R$, destino, convidados): entraram, fecharam,
--   taxa de conversão, ticket médio vendido.
--
-- ww_drift_venda     — Visão B: "como o casal muda da entrada até fechar?"
--   Universo: vendas que FECHARAM no período (filtro por data da venda)
--   Comparando entrada do site × o que efetivamente vendeu (R$ pacote real,
--   destino vendido, convidados refinado pela closer).
--
-- Fonte de valor real vendido: ww_closer_valor_pacote (string BR, ex: "100.000"
-- → R$ 100 mil). NÃO usar valor_final como fallback — é semanticamente outra
-- coisa (parcela, sinal) e está em centavos.
-- ============================================================================

-- Helper: converte R$ numérico em faixa canônica (mesmo dicionário do formulário)
CREATE OR REPLACE FUNCTION public._ww_valor_to_faixa(p_valor NUMERIC) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_valor IS NULL OR p_valor < 5000 THEN RETURN NULL; END IF;
    IF p_valor <  50000 THEN RETURN 'Até R$50 mil'; END IF;
    IF p_valor <  80000 THEN RETURN 'R$50-80 mil'; END IF;
    IF p_valor < 100000 THEN RETURN 'R$80-100 mil'; END IF;
    IF p_valor < 200000 THEN RETURN 'R$100-200 mil'; END IF;
    IF p_valor < 500000 THEN RETURN 'R$200-500 mil'; END IF;
    RETURN '+R$500 mil';
END $$;

-- Ordem das faixas para drift (subiu/desceu)
CREATE OR REPLACE FUNCTION public._ww_faixa_ordem(p_faixa TEXT) RETURNS INT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    RETURN CASE p_faixa
        WHEN 'Até R$50 mil'    THEN 1
        WHEN 'R$50-80 mil'     THEN 2
        WHEN 'R$50-100 mil'    THEN 2
        WHEN 'R$80-100 mil'    THEN 3
        WHEN 'R$100-200 mil'   THEN 4
        WHEN 'R$200-500 mil'   THEN 5
        WHEN '+R$500 mil'      THEN 6
        ELSE NULL END;
END $$;

CREATE OR REPLACE FUNCTION public._ww_conv_ordem(p_conv TEXT) RETURNS INT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    RETURN CASE p_conv
        WHEN 'Apenas o casal' THEN 1
        WHEN 'Até 20'         THEN 2
        WHEN '20-50'          THEN 3
        WHEN '50-80'          THEN 4
        WHEN '80-100'         THEN 5
        WHEN '+100'           THEN 6
        ELSE NULL END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- VISÃO A — Qualidade de lead (quem vira venda?)
-- ════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.ww_qualidade_lead(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[]);
DROP FUNCTION IF EXISTS public.ww_qualidade_lead(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT);

CREATE OR REPLACE FUNCTION public.ww_qualidade_lead(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_date_mode  TEXT DEFAULT 'cohort'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total_entraram INT; v_total_fecharam INT;
    v_por_faixa JSON; v_por_destino JSON; v_por_convidados JSON;
    v_heatmap_faixa_destino JSON;
    v_cobertura JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    -- "Fechou" = card tem ww_closer_data_ganho preenchido (sinal canônico operacional).
    -- Em throughput: filtra pela data do ganho.
    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT c.id,
           (NULLIF(c.produto_data->>'ww_closer_data_ganho','') IS NOT NULL) AS fechou,
           _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa_e,
           _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS conv_e,
           _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form') AS dest_e,
           NULLIF(REPLACE(REPLACE(c.produto_data->>'ww_closer_valor_pacote','.',''),',','.'),'')::NUMERIC AS valor_pac,
           _ww2_norm_origem(c.marketing_data) AS origem
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
    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ql WHERE origem != ALL(p_origins); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;

    SELECT json_build_object(
        'com_faixa',     COUNT(*) FILTER (WHERE faixa_e IS NOT NULL),
        'com_destino',   COUNT(*) FILTER (WHERE dest_e IS NOT NULL),
        'com_convidados',COUNT(*) FILTER (WHERE conv_e IS NOT NULL)
    ) INTO v_cobertura FROM _ww_ql;

    -- Por faixa de investimento (entrada)
    WITH ord AS (SELECT * FROM (VALUES ('Até R$50 mil',1),('R$50-80 mil',2),('R$50-100 mil',3),('R$80-100 mil',4),('R$100-200 mil',5),('R$200-500 mil',6),('+R$500 mil',7)) AS o(cat,n))
    SELECT json_agg(json_build_object(
        'categoria', faixa_e,
        'entraram', entraram,
        'fecharam', fecharam,
        'taxa_pct', CASE WHEN entraram > 0 THEN ROUND(100.0 * fecharam / entraram, 1) ELSE NULL END,
        'ticket_medio', ROUND(ticket_medio::NUMERIC, 0),
        'ticket_p25', ROUND(p25::NUMERIC, 0),
        'ticket_p75', ROUND(p75::NUMERIC, 0),
        'ticket_amostra', ticket_amostra
    ) ORDER BY ordem) INTO v_por_faixa
    FROM (
        SELECT faixa_e, ord.n AS ordem,
               COUNT(*) AS entraram,
               COUNT(*) FILTER (WHERE fechou) AS fecharam,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_medio,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_amostra
          FROM _ww_ql
          JOIN ord ON ord.cat = faixa_e
         WHERE faixa_e IS NOT NULL
         GROUP BY faixa_e, ord.n
    ) x;

    -- Por destino (entrada)
    SELECT json_agg(json_build_object(
        'categoria', dest_e,
        'entraram', entraram,
        'fecharam', fecharam,
        'taxa_pct', CASE WHEN entraram > 0 THEN ROUND(100.0 * fecharam / entraram, 1) ELSE NULL END,
        'ticket_medio', ROUND(ticket_medio::NUMERIC, 0),
        'ticket_p25', ROUND(p25::NUMERIC, 0),
        'ticket_p75', ROUND(p75::NUMERIC, 0),
        'ticket_amostra', ticket_amostra
    ) ORDER BY entraram DESC) INTO v_por_destino
    FROM (
        SELECT dest_e,
               COUNT(*) AS entraram,
               COUNT(*) FILTER (WHERE fechou) AS fecharam,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_medio,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_amostra
          FROM _ww_ql
         WHERE dest_e IS NOT NULL
         GROUP BY dest_e
         HAVING COUNT(*) >= 3
    ) x;

    -- Por convidados (entrada)
    WITH ord AS (SELECT * FROM (VALUES ('Apenas o casal',1),('Até 20',2),('20-50',3),('50-80',4),('80-100',5),('+100',6)) AS o(cat,n))
    SELECT json_agg(json_build_object(
        'categoria', conv_e,
        'entraram', entraram,
        'fecharam', fecharam,
        'taxa_pct', CASE WHEN entraram > 0 THEN ROUND(100.0 * fecharam / entraram, 1) ELSE NULL END,
        'ticket_medio', ROUND(ticket_medio::NUMERIC, 0),
        'ticket_p25', ROUND(p25::NUMERIC, 0),
        'ticket_p75', ROUND(p75::NUMERIC, 0),
        'ticket_amostra', ticket_amostra
    ) ORDER BY ordem) INTO v_por_convidados
    FROM (
        SELECT conv_e, ord.n AS ordem,
               COUNT(*) AS entraram,
               COUNT(*) FILTER (WHERE fechou) AS fecharam,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_medio,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_amostra
          FROM _ww_ql
          JOIN ord ON ord.cat = conv_e
         WHERE conv_e IS NOT NULL
         GROUP BY conv_e, ord.n
    ) x;

    -- Heatmap faixa × destino (entraram + fecharam + taxa)
    SELECT json_agg(json_build_object(
        'faixa', faixa_e, 'destino', dest_e,
        'entraram', entraram, 'fecharam', fecharam,
        'taxa_pct', CASE WHEN entraram > 0 THEN ROUND(100.0 * fecharam / entraram, 1) ELSE NULL END,
        'ticket_medio', ROUND(ticket_medio::NUMERIC, 0)
    )) INTO v_heatmap_faixa_destino
    FROM (
        SELECT faixa_e, dest_e,
               COUNT(*) AS entraram,
               COUNT(*) FILTER (WHERE fechou) AS fecharam,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_medio
          FROM _ww_ql
         WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL
         GROUP BY faixa_e, dest_e
         HAVING COUNT(*) >= 2
    ) x;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'date_mode', p_date_mode,
        'total_entraram', v_total_entraram,
        'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_total_entraram > 0 THEN ROUND(100.0 * v_total_fecharam / v_total_entraram, 1) ELSE NULL END,
        'cobertura', v_cobertura,
        'por_faixa',      COALESCE(v_por_faixa,      '[]'::JSON),
        'por_destino',    COALESCE(v_por_destino,    '[]'::JSON),
        'por_convidados', COALESCE(v_por_convidados, '[]'::JSON),
        'heatmap_faixa_destino', COALESCE(v_heatmap_faixa_destino, '[]'::JSON)
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_qualidade_lead(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- VISÃO B — Drift de venda (entrada × o que vendeu)
-- ════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.ww_drift_venda(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[]);
DROP FUNCTION IF EXISTS public.ww_drift_venda(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT);

CREATE OR REPLACE FUNCTION public.ww_drift_venda(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_date_mode  TEXT DEFAULT 'cohort'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total INT;
    v_total_fechados INT;
    v_inv_json JSON; v_dest_json JSON; v_conv_json JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    -- "Fechou" = card tem ww_closer_data_ganho preenchido (campo "Data/Hora do
    -- Ganho" que o closer registra no fechamento do contrato). Esse é o sinal
    -- canônico operacional, validado com o time. status_comercial='ganho' não
    -- serve porque o trigger só dispara em stages com is_won=true e o time
    -- pula essa stage.
    -- "Data da venda" = ww_closer_data_ganho.
    -- cohort:     universo = TODOS leads criados no período (fluxo de entrada).
    -- throughput: universo = vendas que fecharam no período (data_ganho no período).
    CREATE TEMP TABLE _ww_dv ON COMMIT DROP AS
    SELECT c.id,
           NULLIF(c.produto_data->>'ww_closer_data_ganho','')::TIMESTAMPTZ AS data_venda,
           (NULLIF(c.produto_data->>'ww_closer_data_ganho','') IS NOT NULL) AS fechou,
           _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa_e,
           NULLIF(REPLACE(REPLACE(c.produto_data->>'ww_closer_valor_pacote','.',''),',','.'),'')::NUMERIC AS valor_pac,
           _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form') AS dest_e,
           COALESCE(
             _ww2_norm_dest_strict(c.produto_data->>'ww_onde_casar_refinado'),
             _ww2_norm_dest_strict(c.produto_data->>'ww_destino')
           ) AS dest_v,
           _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS conv_e,
           _ww2_norm_conv_strict(c.produto_data->>'ww_convidados_refinado') AS conv_r,
           _ww2_norm_origem(c.marketing_data) AS origem
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
    IF p_origins IS NOT NULL THEN DELETE FROM _ww_dv WHERE origem != ALL(p_origins); END IF;
    SELECT COUNT(*) INTO v_total FROM _ww_dv;

    -- ── INVESTIMENTO: entrada × VALOR REAL VENDIDO (R$ pacote → faixa)
    -- Valor real só existe quando lead fechou. Não-fechados não contribuem ao drift.
    WITH dados AS (
        SELECT faixa_e,
               fechou,
               CASE WHEN fechou THEN _ww_valor_to_faixa(valor_pac) END AS faixa_v,
               CASE WHEN fechou THEN valor_pac END AS valor_pac
          FROM _ww_dv
    ),
    cobertura AS (
        SELECT
            COUNT(*) AS total_leads,
            COUNT(*) FILTER (WHERE fechou) AS total_fechados,
            COUNT(*) FILTER (WHERE faixa_e IS NOT NULL) AS com_entrada,
            COUNT(*) FILTER (WHERE valor_pac >= 5000) AS com_valor_real,
            COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND valor_pac >= 5000) AS com_ambos
          FROM dados
    ),
    drift AS (
        SELECT
            COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_e) = _ww_faixa_ordem(faixa_v)) AS manteve,
            COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) > _ww_faixa_ordem(faixa_e)) AS subiu,
            COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) < _ww_faixa_ordem(faixa_e)) AS desceu,
            AVG(valor_pac) FILTER (WHERE faixa_e IS NOT NULL AND valor_pac >= 5000) AS ticket_medio_geral
          FROM dados
    ),
    matriz AS (
        SELECT faixa_e, faixa_v,
               COUNT(*) AS qtd,
               ROUND(AVG(valor_pac)::NUMERIC, 0) AS ticket_medio
          FROM dados
         WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND valor_pac >= 5000
         GROUP BY faixa_e, faixa_v
    ),
    -- Para cada faixa de entrada, qual o ticket médio dos que fecharam
    ticket_por_entrada AS (
        SELECT faixa_e,
               COUNT(*) FILTER (WHERE valor_pac >= 5000) AS amostra,
               ROUND(AVG(valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS ticket_medio,
               ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS p25,
               ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS mediana,
               ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE valor_pac >= 5000)::NUMERIC, 0) AS p75,
               MIN(valor_pac) FILTER (WHERE valor_pac >= 5000) AS minv,
               MAX(valor_pac) FILTER (WHERE valor_pac >= 5000) AS maxv
          FROM dados
         WHERE faixa_e IS NOT NULL
         GROUP BY faixa_e
    )
    SELECT json_build_object(
        'cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON),
        'ticket_por_entrada', COALESCE((SELECT json_agg(row_to_json(t) ORDER BY _ww_faixa_ordem(t.faixa_e)) FROM ticket_por_entrada t WHERE t.amostra > 0), '[]'::JSON)
    ) INTO v_inv_json;

    -- ── DESTINO: entrada × vendido (só para quem fechou)
    WITH dados AS (
        SELECT dest_e,
               CASE WHEN fechou THEN dest_v END AS dest_v,
               fechou
          FROM _ww_dv
    ),
    cobertura AS (
        SELECT COUNT(*) AS total_leads,
               COUNT(*) FILTER (WHERE fechou) AS total_fechados,
               COUNT(*) FILTER (WHERE dest_e IS NOT NULL) AS com_entrada,
               COUNT(*) FILTER (WHERE dest_v IS NOT NULL) AS com_vendido,
               COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL) AS com_ambos
          FROM dados
    ),
    drift AS (
        SELECT COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e = dest_v) AS manteve,
               COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e != dest_v) AS mudou
          FROM dados
    ),
    matriz AS (
        SELECT dest_e, dest_v, COUNT(*) AS qtd
          FROM dados
         WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL
         GROUP BY dest_e, dest_v
    ),
    top_migracoes AS (
        SELECT dest_e AS de, dest_v AS para, COUNT(*) AS qtd
          FROM dados
         WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e != dest_v
         GROUP BY dest_e, dest_v
         ORDER BY COUNT(*) DESC
         LIMIT 8
    )
    SELECT json_build_object(
        'cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON),
        'top_migracoes', COALESCE((SELECT json_agg(row_to_json(t)) FROM top_migracoes t), '[]'::JSON)
    ) INTO v_dest_json;

    -- ── CONVIDADOS: entrada × refinado pela closer (só para quem fechou)
    WITH dados AS (
        SELECT conv_e,
               CASE WHEN fechou THEN conv_r END AS conv_r,
               fechou
          FROM _ww_dv
    ),
    cobertura AS (
        SELECT COUNT(*) AS total_leads,
               COUNT(*) FILTER (WHERE fechou) AS total_fechados,
               COUNT(*) FILTER (WHERE conv_e IS NOT NULL) AS com_entrada,
               COUNT(*) FILTER (WHERE conv_r IS NOT NULL) AS com_refinado,
               COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL) AS com_ambos
          FROM dados
    ),
    drift AS (
        SELECT COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_e) = _ww_conv_ordem(conv_r)) AS manteve,
               COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_r) > _ww_conv_ordem(conv_e)) AS subiu,
               COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_r) < _ww_conv_ordem(conv_e)) AS desceu
          FROM dados
    ),
    matriz AS (
        SELECT conv_e, conv_r, COUNT(*) AS qtd
          FROM dados
         WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL
         GROUP BY conv_e, conv_r
    )
    SELECT json_build_object(
        'cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON)
    ) INTO v_conv_json;

    SELECT COUNT(*) INTO v_total_fechados FROM _ww_dv WHERE fechou;
    DROP TABLE _ww_dv;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'date_mode', p_date_mode,
        'total_leads',    v_total,
        'total_fechados', v_total_fechados,
        'total_vendas',   v_total_fechados,  -- alias legacy
        'investimento', v_inv_json,
        'destino',      v_dest_json,
        'convidados',   v_conv_json
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_drift_venda(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT) TO authenticated;
