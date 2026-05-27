-- ============================================================================
-- Analytics-Weddings — Onda 3: ww_drift_venda v2
--
-- Mantém tudo que existia + adiciona:
--   - drift_por_origem: pra cada origem, manteve/subiu/desceu de faixa.
--   - drift_por_consultor: qual closer faz upsell (subiu) mais.
--   - drift_por_mes: evolução temporal da aderência entrada × realidade.
--   - vendas_lista enriquecida: contato_external_id, contato_nome, valor_final,
--     origem, consultor_nome (pra dar deep-link AC direto da lista de vendas).
-- ============================================================================

DROP FUNCTION IF EXISTS public.ww_drift_venda(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.ww_drift_venda(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_date_mode  TEXT DEFAULT 'cohort',
    p_tipos      TEXT[] DEFAULT NULL
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
    v_breakdown_tipo JSON;
    v_vendas_lista JSON;
    v_drift_origem JSON;
    v_drift_consultor JSON;
    v_drift_mes JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww_dv ON COMMIT DROP AS
    SELECT c.id, c.titulo,
           c.dono_atual_id, c.valor_final, c.pessoa_principal_id,
           NULLIF(c.produto_data->>'ww_closer_data_ganho','')::TIMESTAMPTZ AS data_venda,
           (NULLIF(c.produto_data->>'ww_closer_data_ganho','') IS NOT NULL) AS fechou,
           _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa_e,
           COALESCE(
             _ww_parse_orcamento_to_faixa(c.produto_data->>'ww_questionario_orcamento'),
             _ww2_norm_faixa_strict(c.produto_data->>'ww_investimento_refinado')
           ) AS faixa_v,
           COALESCE(
             _ww_parse_convidados_to_int(c.produto_data->>'ww_questionario_convidados'),
             _ww_parse_convidados_to_int(c.produto_data->>'ww_closer_valor_pacote')
           ) AS num_convidados_real,
           _ww2_norm_conv_strict(c.produto_data->>'ww_convidados_refinado') AS conv_r_categoria,
           _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form') AS dest_e,
           _ww2_norm_dest_strict(c.produto_data->>'ww_destino') AS dest_v,
           _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS conv_e,
           _ww2_norm_origem(c.marketing_data) AS origem,
           _ww_norm_tipo(c.produto_data->>'ww_tipo_casamento') AS tipo_casamento,
           NULLIF(c.produto_data->>'ww_closer_monde_venda','') AS monde_venda,
           pr.nome AS consultor_nome,
           co.nome AS contato_nome,
           CASE WHEN co.external_source = 'active_campaign' THEN co.external_id ELSE NULL END AS contato_external_id
      FROM cards c
      LEFT JOIN profiles pr ON pr.id = c.dono_atual_id
      LEFT JOIN contatos co ON co.id = c.pessoa_principal_id
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
    IF p_tipos   IS NOT NULL THEN DELETE FROM _ww_dv WHERE tipo_casamento IS NULL OR tipo_casamento != ALL(p_tipos); END IF;
    SELECT COUNT(*) INTO v_total FROM _ww_dv;

    -- ── INVESTIMENTO (mesma lógica da v1)
    WITH dados AS (
        SELECT faixa_e, fechou, CASE WHEN fechou THEN faixa_v END AS faixa_v FROM _ww_dv
    ),
    cobertura AS (
        SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
               COUNT(*) FILTER (WHERE faixa_e IS NOT NULL) AS com_entrada,
               COUNT(*) FILTER (WHERE faixa_v IS NOT NULL) AS com_realidade,
               COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL) AS com_ambos
          FROM dados
    ),
    drift AS (
        SELECT COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_e) = _ww_faixa_ordem(faixa_v)) AS manteve,
               COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) > _ww_faixa_ordem(faixa_e)) AS subiu,
               COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) < _ww_faixa_ordem(faixa_e)) AS desceu
          FROM dados
    ),
    matriz AS (
        SELECT faixa_e, faixa_v, COUNT(*) AS qtd FROM dados
         WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL
         GROUP BY faixa_e, faixa_v
    )
    SELECT json_build_object(
        'cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON)
    ) INTO v_inv_json;

    -- ── DESTINO
    WITH dados AS (
        SELECT dest_e, CASE WHEN fechou THEN dest_v END AS dest_v, fechou FROM _ww_dv
    ),
    cobertura AS (
        SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
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
        SELECT dest_e, dest_v, COUNT(*) AS qtd FROM dados
         WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL
         GROUP BY dest_e, dest_v
    ),
    top_migracoes AS (
        SELECT dest_e AS de, dest_v AS para, COUNT(*) AS qtd FROM dados
         WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e != dest_v
         GROUP BY dest_e, dest_v ORDER BY COUNT(*) DESC LIMIT 8
    )
    SELECT json_build_object(
        'cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON),
        'top_migracoes', COALESCE((SELECT json_agg(row_to_json(t)) FROM top_migracoes t), '[]'::JSON)
    ) INTO v_dest_json;

    -- ── CONVIDADOS
    WITH dados AS (
        SELECT conv_e, fechou,
               CASE WHEN fechou THEN
                 COALESCE(
                   CASE
                     WHEN num_convidados_real IS NULL THEN NULL
                     WHEN num_convidados_real <= 2   THEN 'Apenas o casal'
                     WHEN num_convidados_real <= 20  THEN 'Até 20'
                     WHEN num_convidados_real <= 50  THEN '20-50'
                     WHEN num_convidados_real <= 80  THEN '50-80'
                     WHEN num_convidados_real <= 100 THEN '80-100'
                     ELSE '+100'
                   END,
                   conv_r_categoria
                 )
               END AS conv_r,
               CASE WHEN fechou THEN num_convidados_real END AS num_convidados_real
          FROM _ww_dv
    ),
    cobertura AS (
        SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
               COUNT(*) FILTER (WHERE conv_e IS NOT NULL) AS com_entrada,
               COUNT(*) FILTER (WHERE conv_r IS NOT NULL) AS com_realidade,
               COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL) AS com_ambos,
               COUNT(*) FILTER (WHERE num_convidados_real IS NOT NULL) AS com_numero_exato
          FROM dados
    ),
    drift AS (
        SELECT COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_e) = _ww_conv_ordem(conv_r)) AS manteve,
               COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_r) > _ww_conv_ordem(conv_e)) AS subiu,
               COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_r) < _ww_conv_ordem(conv_e)) AS desceu
          FROM dados
    ),
    matriz AS (
        SELECT conv_e, conv_r, COUNT(*) AS qtd FROM dados
         WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL
         GROUP BY conv_e, conv_r
    )
    SELECT json_build_object(
        'cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON)
    ) INTO v_conv_json;

    SELECT COUNT(*) INTO v_total_fechados FROM _ww_dv WHERE fechou;

    -- ── Drift por origem (NOVO v2)
    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem,
      'vendas', vendas,
      'manteve', manteve, 'subiu', subiu, 'desceu', desceu,
      'manteve_pct', CASE WHEN vendas > 0 THEN ROUND(100.0 * manteve / vendas, 1) END,
      'subiu_pct',   CASE WHEN vendas > 0 THEN ROUND(100.0 * subiu / vendas, 1) END,
      'desceu_pct',  CASE WHEN vendas > 0 THEN ROUND(100.0 * desceu / vendas, 1) END,
      'ticket_medio_vendido', ROUND(ticket::NUMERIC, 0)
    ) ORDER BY vendas DESC), '[]'::JSON) INTO v_drift_origem
    FROM (
      SELECT origem,
             COUNT(*) FILTER (WHERE fechou) AS vendas,
             COUNT(*) FILTER (WHERE fechou AND faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_e) = _ww_faixa_ordem(faixa_v)) AS manteve,
             COUNT(*) FILTER (WHERE fechou AND faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) > _ww_faixa_ordem(faixa_e)) AS subiu,
             COUNT(*) FILTER (WHERE fechou AND faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) < _ww_faixa_ordem(faixa_e)) AS desceu,
             AVG(num_convidados_real) FILTER (WHERE fechou) AS ticket
        FROM _ww_dv
       WHERE origem IS NOT NULL
       GROUP BY origem
       HAVING COUNT(*) FILTER (WHERE fechou) >= 1
    ) g;

    -- ── Drift por consultor (NOVO v2)
    SELECT COALESCE(json_agg(json_build_object(
      'consultor_id', consultor_id,
      'consultor_nome', consultor_nome,
      'vendas', vendas,
      'manteve', manteve, 'subiu', subiu, 'desceu', desceu,
      'manteve_pct', CASE WHEN vendas > 0 THEN ROUND(100.0 * manteve / vendas, 1) END,
      'subiu_pct',   CASE WHEN vendas > 0 THEN ROUND(100.0 * subiu / vendas, 1) END,
      'desceu_pct',  CASE WHEN vendas > 0 THEN ROUND(100.0 * desceu / vendas, 1) END,
      'ticket_medio', ROUND(ticket::NUMERIC, 0)
    ) ORDER BY vendas DESC), '[]'::JSON) INTO v_drift_consultor
    FROM (
      SELECT dono_atual_id AS consultor_id, consultor_nome,
             COUNT(*) FILTER (WHERE fechou) AS vendas,
             COUNT(*) FILTER (WHERE fechou AND faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_e) = _ww_faixa_ordem(faixa_v)) AS manteve,
             COUNT(*) FILTER (WHERE fechou AND faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) > _ww_faixa_ordem(faixa_e)) AS subiu,
             COUNT(*) FILTER (WHERE fechou AND faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) < _ww_faixa_ordem(faixa_e)) AS desceu,
             AVG(num_convidados_real) FILTER (WHERE fechou) AS ticket
        FROM _ww_dv
       WHERE dono_atual_id IS NOT NULL
       GROUP BY dono_atual_id, consultor_nome
       HAVING COUNT(*) FILTER (WHERE fechou) >= 1
    ) g;

    -- ── Drift por mês (NOVO v2)
    SELECT COALESCE(json_agg(json_build_object(
      'mes', mes,
      'vendas', vendas,
      'manteve_pct', CASE WHEN vendas > 0 THEN ROUND(100.0 * manteve / vendas, 1) END,
      'subiu_pct',   CASE WHEN vendas > 0 THEN ROUND(100.0 * subiu / vendas, 1) END,
      'desceu_pct',  CASE WHEN vendas > 0 THEN ROUND(100.0 * desceu / vendas, 1) END
    ) ORDER BY mes), '[]'::JSON) INTO v_drift_mes
    FROM (
      SELECT TO_CHAR(date_trunc('month', data_venda), 'YYYY-MM') AS mes,
             COUNT(*) AS vendas,
             COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_e) = _ww_faixa_ordem(faixa_v)) AS manteve,
             COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) > _ww_faixa_ordem(faixa_e)) AS subiu,
             COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) < _ww_faixa_ordem(faixa_e)) AS desceu
        FROM _ww_dv
       WHERE fechou AND data_venda IS NOT NULL
       GROUP BY 1
    ) m;

    -- Breakdown por tipo (DW vs Elopment)
    SELECT json_agg(json_build_object(
        'tipo', tipo, 'fechados', fechados,
        'convidados_medio', ROUND(convidados_medio::NUMERIC, 0)
    ) ORDER BY fechados DESC) INTO v_breakdown_tipo
    FROM (
        SELECT COALESCE(tipo_casamento, 'Não classificado') AS tipo,
               COUNT(*) FILTER (WHERE fechou) AS fechados,
               AVG(num_convidados_real) FILTER (WHERE fechou AND num_convidados_real IS NOT NULL) AS convidados_medio
          FROM _ww_dv
         WHERE fechou
         GROUP BY tipo_casamento
    ) x;

    -- Lista de vendas fechadas — ENRIQUECIDA na v2
    SELECT json_agg(json_build_object(
        'card_id', id, 'titulo', titulo,
        'data_venda', data_venda,
        'num_convidados', num_convidados_real,
        'tipo_casamento', tipo_casamento,
        'monde_venda', monde_venda,
        'destino_vendido', dest_v,
        'origem', origem,
        'valor_final', valor_final,
        'consultor_nome', consultor_nome,
        'contato_nome', contato_nome,
        'contato_external_id', contato_external_id
    ) ORDER BY data_venda DESC NULLS LAST) INTO v_vendas_lista
    FROM (SELECT * FROM _ww_dv WHERE fechou LIMIT 200) sub;

    DROP TABLE _ww_dv;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'date_mode', p_date_mode,
        'total_leads',    v_total,
        'total_fechados', v_total_fechados,
        'total_vendas',   v_total_fechados,
        'investimento', v_inv_json,
        'destino',      v_dest_json,
        'convidados',   v_conv_json,
        'breakdown_tipo', COALESCE(v_breakdown_tipo, '[]'::JSON),
        'vendas_lista',   COALESCE(v_vendas_lista, '[]'::JSON),
        'drift_por_origem', v_drift_origem,
        'drift_por_consultor', v_drift_consultor,
        'drift_por_mes', v_drift_mes
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_drift_venda(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT, TEXT[]) TO authenticated;
