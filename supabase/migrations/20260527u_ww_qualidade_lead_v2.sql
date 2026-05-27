-- ============================================================================
-- Analytics-Weddings — Onda 2: ww_qualidade_lead v2
--
-- Mantém todo o comportamento anterior e adiciona:
--   1. p_min_amostra (default 3) → categorias com entraram < N são agregadas
--      num bucket "Outros (amostra pequena)" e expostas em outros_amostra_pequena.
--   2. Cruzamentos: faixa×origem, destino×origem, faixa×tipo, convidados×origem.
--   3. Evolução mensal por faixa (mes_x_faixa).
--   4. comparacao_entrada_vs_fechamento: por dimensão, distribuição lado a lado
--      com lift = fechou_pct / entrada_pct (>1 = sobre-representado em vendas).
--
-- NÃO quebra contrato existente — payload antigo continua igual, só cresce.
-- ============================================================================

DROP FUNCTION IF EXISTS public.ww_qualidade_lead(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT, UUID, TEXT[]);

CREATE OR REPLACE FUNCTION public.ww_qualidade_lead(
    p_date_start     TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end       TIMESTAMPTZ DEFAULT NOW(),
    p_org_id         UUID DEFAULT NULL,
    p_origins        TEXT[] DEFAULT NULL,
    p_date_mode      TEXT DEFAULT 'cohort',
    p_event_stage_id UUID DEFAULT NULL,
    p_tipos          TEXT[] DEFAULT NULL,
    p_min_amostra    INT DEFAULT 3
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
    v_outros_amostra_pequena JSON;
    v_cruzamentos JSON;
    v_evolucao_mensal JSON;
    v_comparacao JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 3));
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    IF p_date_mode = 'throughput' AND p_event_stage_id IS NULL THEN
        RETURN json_build_object('error','Em modo throughput, é obrigatório informar a etapa de gatilho (p_event_stage_id).');
    END IF;

    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT c.id,
           c.created_at,
           (NULLIF(c.produto_data->>'ww_closer_data_ganho','') IS NOT NULL) AS fechou,
           _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa_e,
           _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS conv_e,
           _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form') AS dest_e,
           NULLIF(c.produto_data->>'ww_closer_valor_pacote','')::NUMERIC AS valor_pac,
           _ww2_norm_origem(c.marketing_data) AS origem,
           _ww_norm_tipo(c.produto_data->>'ww_tipo_casamento') AS tipo_casamento
      FROM cards c
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND (
         (p_date_mode = 'cohort'
            AND c.created_at >= p_date_start AND c.created_at <= p_date_end)
         OR
         (p_date_mode = 'throughput'
            AND EXISTS (
              SELECT 1 FROM activities a
               WHERE a.card_id = c.id
                 AND a.tipo = 'stage_changed'
                 AND (a.metadata->>'new_stage_id')::uuid = p_event_stage_id
                 AND a.created_at >= p_date_start
                 AND a.created_at <= p_date_end
            ))
       );
    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ql WHERE origem != ALL(p_origins); END IF;
    IF p_tipos   IS NOT NULL THEN DELETE FROM _ww_ql WHERE tipo_casamento IS NULL OR tipo_casamento != ALL(p_tipos); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;

    SELECT json_build_object(
        'com_faixa',     COUNT(*) FILTER (WHERE faixa_e IS NOT NULL),
        'com_destino',   COUNT(*) FILTER (WHERE dest_e IS NOT NULL),
        'com_convidados',COUNT(*) FILTER (WHERE conv_e IS NOT NULL)
    ) INTO v_cobertura FROM _ww_ql;

    -- Por faixa de investimento (entrada) — filtra amostra mínima
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
         HAVING COUNT(*) >= v_min
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
         HAVING COUNT(*) >= v_min
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
         HAVING COUNT(*) >= v_min
    ) x;

    -- Bucket "Outros (amostra pequena)" — agrega categorias com entraram < v_min em cada dimensão
    SELECT json_build_object(
      'faixa', (
        SELECT json_build_object(
          'entraram', SUM(c)::INT,
          'fecharam', SUM(f)::INT,
          'categorias_agrupadas', json_agg(faixa_e)
        )
        FROM (
          SELECT faixa_e, COUNT(*) AS c, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE faixa_e IS NOT NULL
           GROUP BY faixa_e HAVING COUNT(*) < v_min
        ) y
      ),
      'destino', (
        SELECT json_build_object(
          'entraram', SUM(c)::INT,
          'fecharam', SUM(f)::INT,
          'categorias_agrupadas', json_agg(dest_e)
        )
        FROM (
          SELECT dest_e, COUNT(*) AS c, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE dest_e IS NOT NULL
           GROUP BY dest_e HAVING COUNT(*) < v_min
        ) y
      ),
      'convidados', (
        SELECT json_build_object(
          'entraram', SUM(c)::INT,
          'fecharam', SUM(f)::INT,
          'categorias_agrupadas', json_agg(conv_e)
        )
        FROM (
          SELECT conv_e, COUNT(*) AS c, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE conv_e IS NOT NULL
           GROUP BY conv_e HAVING COUNT(*) < v_min
        ) y
      )
    ) INTO v_outros_amostra_pequena;

    -- Heatmap faixa × destino (mantém HAVING >= 2 como antes, independente do min_amostra global)
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

    -- ──────────────────────────────────────────────────────────────────────
    -- Cruzamentos novos (NOVO na v2)
    -- ──────────────────────────────────────────────────────────────────────
    SELECT json_build_object(
      'faixa_x_origem', COALESCE((
        SELECT json_agg(json_build_object(
          'linha', faixa_e, 'coluna', origem,
          'entraram', entraram, 'fecharam', fecharam,
          'taxa_pct', CASE WHEN entraram > 0 THEN ROUND(100.0 * fecharam / entraram, 1) ELSE NULL END
        ))
        FROM (
          SELECT faixa_e, origem, COUNT(*) AS entraram, COUNT(*) FILTER (WHERE fechou) AS fecharam
            FROM _ww_ql WHERE faixa_e IS NOT NULL AND origem IS NOT NULL
           GROUP BY faixa_e, origem
           HAVING COUNT(*) >= 2
        ) x
      ), '[]'::JSON),
      'destino_x_origem', COALESCE((
        SELECT json_agg(json_build_object(
          'linha', dest_e, 'coluna', origem,
          'entraram', entraram, 'fecharam', fecharam,
          'taxa_pct', CASE WHEN entraram > 0 THEN ROUND(100.0 * fecharam / entraram, 1) ELSE NULL END
        ))
        FROM (
          SELECT dest_e, origem, COUNT(*) AS entraram, COUNT(*) FILTER (WHERE fechou) AS fecharam
            FROM _ww_ql WHERE dest_e IS NOT NULL AND origem IS NOT NULL
           GROUP BY dest_e, origem
           HAVING COUNT(*) >= 2
        ) x
      ), '[]'::JSON),
      'faixa_x_tipo', COALESCE((
        SELECT json_agg(json_build_object(
          'linha', faixa_e, 'coluna', tipo_casamento,
          'entraram', entraram, 'fecharam', fecharam,
          'taxa_pct', CASE WHEN entraram > 0 THEN ROUND(100.0 * fecharam / entraram, 1) ELSE NULL END
        ))
        FROM (
          SELECT faixa_e, tipo_casamento, COUNT(*) AS entraram, COUNT(*) FILTER (WHERE fechou) AS fecharam
            FROM _ww_ql WHERE faixa_e IS NOT NULL AND tipo_casamento IS NOT NULL
           GROUP BY faixa_e, tipo_casamento
           HAVING COUNT(*) >= 2
        ) x
      ), '[]'::JSON),
      'convidados_x_origem', COALESCE((
        SELECT json_agg(json_build_object(
          'linha', conv_e, 'coluna', origem,
          'entraram', entraram, 'fecharam', fecharam,
          'taxa_pct', CASE WHEN entraram > 0 THEN ROUND(100.0 * fecharam / entraram, 1) ELSE NULL END
        ))
        FROM (
          SELECT conv_e, origem, COUNT(*) AS entraram, COUNT(*) FILTER (WHERE fechou) AS fecharam
            FROM _ww_ql WHERE conv_e IS NOT NULL AND origem IS NOT NULL
           GROUP BY conv_e, origem
           HAVING COUNT(*) >= 2
        ) x
      ), '[]'::JSON)
    ) INTO v_cruzamentos;

    -- Evolução mensal por faixa
    SELECT COALESCE(json_agg(json_build_object(
      'mes', mes, 'categoria', faixa_e,
      'entraram', entraram, 'fecharam', fecharam,
      'taxa_pct', CASE WHEN entraram > 0 THEN ROUND(100.0 * fecharam / entraram, 1) ELSE NULL END
    )), '[]'::JSON) INTO v_evolucao_mensal
    FROM (
      SELECT TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') AS mes,
             faixa_e,
             COUNT(*) AS entraram,
             COUNT(*) FILTER (WHERE fechou) AS fecharam
        FROM _ww_ql
       WHERE faixa_e IS NOT NULL
       GROUP BY 1, 2
       HAVING COUNT(*) >= 2
       ORDER BY 1, 2
    ) e;

    -- ──────────────────────────────────────────────────────────────────────
    -- Comparação entrada vs fechamento (NOVO na v2)
    -- Mesmo universo (_ww_ql), mas calcula distribuição % no grupo "entraram"
    -- vs distribuição % no grupo "fecharam" e o lift entre os dois.
    -- ──────────────────────────────────────────────────────────────────────
    WITH dims AS (
      SELECT 'faixa'      AS dim, faixa_e         AS cat FROM _ww_ql WHERE faixa_e IS NOT NULL
      UNION ALL SELECT 'destino', dest_e          FROM _ww_ql WHERE dest_e IS NOT NULL
      UNION ALL SELECT 'convidados', conv_e       FROM _ww_ql WHERE conv_e IS NOT NULL
      UNION ALL SELECT 'origem', origem           FROM _ww_ql WHERE origem IS NOT NULL
      UNION ALL SELECT 'tipo', tipo_casamento     FROM _ww_ql WHERE tipo_casamento IS NOT NULL
    ),
    dims_fech AS (
      SELECT 'faixa' AS dim, faixa_e AS cat FROM _ww_ql WHERE faixa_e IS NOT NULL AND fechou
      UNION ALL SELECT 'destino', dest_e FROM _ww_ql WHERE dest_e IS NOT NULL AND fechou
      UNION ALL SELECT 'convidados', conv_e FROM _ww_ql WHERE conv_e IS NOT NULL AND fechou
      UNION ALL SELECT 'origem', origem FROM _ww_ql WHERE origem IS NOT NULL AND fechou
      UNION ALL SELECT 'tipo', tipo_casamento FROM _ww_ql WHERE tipo_casamento IS NOT NULL AND fechou
    ),
    tot_e AS (SELECT dim, COUNT(*) AS total FROM dims GROUP BY dim),
    tot_f AS (SELECT dim, COUNT(*) AS total FROM dims_fech GROUP BY dim),
    by_e  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims GROUP BY dim, cat),
    by_f  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims_fech GROUP BY dim, cat),
    rows AS (
      SELECT e.dim, e.cat,
             e.qtd AS entrada_qtd,
             COALESCE(f.qtd, 0) AS fechou_qtd,
             CASE WHEN te.total > 0 THEN ROUND(100.0 * e.qtd / te.total, 1) END AS entrada_pct,
             CASE WHEN tf.total > 0 THEN ROUND(100.0 * COALESCE(f.qtd,0) / tf.total, 1) END AS fechou_pct,
             tf.total AS total_fech_dim
        FROM by_e e
        LEFT JOIN by_f f ON f.dim = e.dim AND f.cat = e.cat
        LEFT JOIN tot_e te ON te.dim = e.dim
        LEFT JOIN tot_f tf ON tf.dim = e.dim
    )
    SELECT COALESCE(json_agg(
      json_build_object(
        'dimensao', dim,
        'dados', dados
      )
    ), '[]'::JSON) INTO v_comparacao
    FROM (
      SELECT dim, json_agg(
        json_build_object(
          'categoria', cat,
          'entrada_qtd', entrada_qtd,
          'entrada_pct', entrada_pct,
          'fechou_qtd', fechou_qtd,
          'fechou_pct', fechou_pct,
          'lift', CASE
                    WHEN entrada_pct IS NULL OR entrada_pct = 0 THEN NULL
                    WHEN fechou_pct IS NULL THEN NULL
                    ELSE ROUND((fechou_pct / entrada_pct)::numeric, 2)
                  END
        ) ORDER BY entrada_qtd DESC
      ) AS dados
        FROM rows
        WHERE entrada_qtd >= v_min OR fechou_qtd >= 1
       GROUP BY dim
    ) g;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'date_mode', p_date_mode,
        'min_amostra', v_min,
        'total_entraram', v_total_entraram,
        'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_total_entraram > 0 THEN ROUND(100.0 * v_total_fecharam / v_total_entraram, 1) ELSE NULL END,
        'cobertura', v_cobertura,
        'por_faixa',      COALESCE(v_por_faixa,      '[]'::JSON),
        'por_destino',    COALESCE(v_por_destino,    '[]'::JSON),
        'por_convidados', COALESCE(v_por_convidados, '[]'::JSON),
        'outros_amostra_pequena', COALESCE(v_outros_amostra_pequena, '{}'::JSON),
        'heatmap_faixa_destino', COALESCE(v_heatmap_faixa_destino, '[]'::JSON),
        'cruzamentos', COALESCE(v_cruzamentos, '{}'::JSON),
        'evolucao_mensal_por_faixa', COALESCE(v_evolucao_mensal, '[]'::JSON),
        'comparacao_entrada_vs_fechamento', COALESCE(v_comparacao, '[]'::JSON)
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_qualidade_lead(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT, UUID, TEXT[], INT) TO authenticated;
