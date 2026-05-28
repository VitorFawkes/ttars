-- ============================================================================
-- Paridade total nas 3 abas principais — 155 ganhos AC field 87 em todas
--
-- ww_v2_drift_venda (Entrada × Realidade) e ww_v2_lead_ideal (Lead Ideal ×
-- Pipeline) usavam ww_v2_casamentos_cache (161 entries depois do sync de 17
-- ganhos adicionais). Mas o número canônico é 155 (deals com AC field 87
-- preenchido = "[WW] [Closer] Data-Hora Ganho").
--
-- Diferença de 6: contatos marcados como ganho por critério antigo
-- (data_fechamento manual ou ww_closer_data_hora_ganho) mas SEM o campo 87 AC.
--
-- Solução: ambas RPCs aplicam filtro EXISTS pra reduzir universo ao canônico
-- (mesmos 155 do funil), mantendo dados ricos do cache antigo (entrada ×
-- realidade, perfil histórico).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww_v2_drift_venda(
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
    v_total INT; v_total_fechados INT;
    v_inv_json JSON; v_dest_json JSON; v_conv_json JSON;
    v_vendas_lista JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING nao encontrado'); END IF;

    CREATE TEMP TABLE _ww_v2_dv ON COMMIT DROP AS
    SELECT contact_id AS id, contato_nome AS titulo,
           deal_ganho_id AS ac_deal_id, data_ganho AS data_venda, TRUE AS fechou,
           _ww2_norm_faixa_strict(entrada_invest) AS faixa_e,
           _ww2_norm_dest_strict(entrada_destino) AS dest_e,
           _ww2_norm_conv_strict(entrada_conv) AS conv_e,
           _ww_parse_orcamento_to_faixa(real_orcamento_total) AS faixa_v,
           _ww2_norm_dest_strict(real_destino) AS dest_v,
           COALESCE(real_pacote_conv, real_num_conv) AS num_convidados_real,
           CASE
             WHEN COALESCE(real_pacote_conv, real_num_conv) IS NULL THEN NULL
             WHEN COALESCE(real_pacote_conv, real_num_conv) <= 2 THEN 'Apenas o casal'
             WHEN COALESCE(real_pacote_conv, real_num_conv) <= 20 THEN 'Ate 20'
             WHEN COALESCE(real_pacote_conv, real_num_conv) <= 50 THEN '20-50'
             WHEN COALESCE(real_pacote_conv, real_num_conv) <= 80 THEN '50-80'
             WHEN COALESCE(real_pacote_conv, real_num_conv) <= 100 THEN '80-100'
             ELSE '+100' END AS conv_r,
           real_valor_assess AS valor_final, real_monde AS monde_venda,
           fonte_lead AS origem, NULL::TEXT AS tipo_casamento,
           contato_nome, contact_id AS contato_external_id
      FROM ww_v2_casamentos_cache c
      WHERE EXISTS (SELECT 1 FROM ww_ac_deal_funnel_cache fc
                    WHERE fc.contact_id = c.contact_id AND fc.is_ww AND fc.ganho_at IS NOT NULL);

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    SELECT COUNT(*) INTO v_total FROM _ww_v2_dv;
    SELECT COUNT(*) INTO v_total_fechados FROM _ww_v2_dv WHERE fechou;

    WITH dados AS (SELECT faixa_e, fechou, CASE WHEN fechou THEN faixa_v END AS faixa_v FROM _ww_v2_dv),
    cobertura AS (SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
                         COUNT(*) FILTER (WHERE faixa_e IS NOT NULL) AS com_entrada,
                         COUNT(*) FILTER (WHERE faixa_v IS NOT NULL) AS com_realidade,
                         COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL) AS com_ambos FROM dados),
    drift AS (SELECT
          COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_e) = _ww_faixa_ordem(faixa_v)) AS manteve,
          COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) > _ww_faixa_ordem(faixa_e)) AS subiu,
          COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) < _ww_faixa_ordem(faixa_e)) AS desceu FROM dados),
    matriz AS (SELECT faixa_e, faixa_v, COUNT(*) AS qtd FROM dados WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL GROUP BY faixa_e, faixa_v)
    SELECT json_build_object('cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON))
    INTO v_inv_json;

    WITH dados AS (SELECT dest_e, CASE WHEN fechou THEN dest_v END AS dest_v, fechou FROM _ww_v2_dv),
    cobertura AS (SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
                         COUNT(*) FILTER (WHERE dest_e IS NOT NULL) AS com_entrada,
                         COUNT(*) FILTER (WHERE dest_v IS NOT NULL) AS com_vendido,
                         COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL) AS com_ambos FROM dados),
    drift AS (SELECT COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e = dest_v) AS manteve,
                     COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e != dest_v) AS mudou FROM dados),
    matriz AS (SELECT dest_e, dest_v, COUNT(*) AS qtd FROM dados WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL GROUP BY dest_e, dest_v),
    top_migracoes AS (SELECT dest_e AS de, dest_v AS para, COUNT(*) AS qtd FROM dados
         WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e != dest_v
         GROUP BY dest_e, dest_v ORDER BY COUNT(*) DESC LIMIT 8)
    SELECT json_build_object('cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON),
        'top_migracoes', COALESCE((SELECT json_agg(row_to_json(t)) FROM top_migracoes t), '[]'::JSON))
    INTO v_dest_json;

    WITH dados AS (SELECT conv_e, fechou,
               CASE WHEN fechou THEN conv_r END AS conv_r,
               CASE WHEN fechou THEN num_convidados_real END AS num_convidados_real FROM _ww_v2_dv),
    cobertura AS (SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
                         COUNT(*) FILTER (WHERE conv_e IS NOT NULL) AS com_entrada,
                         COUNT(*) FILTER (WHERE conv_r IS NOT NULL) AS com_realidade,
                         COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL) AS com_ambos,
                         COUNT(*) FILTER (WHERE num_convidados_real IS NOT NULL) AS com_numero_exato FROM dados),
    drift AS (SELECT
          COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_e) = _ww_conv_ordem(conv_r)) AS manteve,
          COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_r) > _ww_conv_ordem(conv_e)) AS subiu,
          COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_r) < _ww_conv_ordem(conv_e)) AS desceu FROM dados),
    matriz AS (SELECT conv_e, conv_r, COUNT(*) AS qtd FROM dados WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL GROUP BY conv_e, conv_r)
    SELECT json_build_object('cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON))
    INTO v_conv_json;

    SELECT json_agg(json_build_object('card_id', id, 'titulo', titulo, 'data_venda', data_venda,
        'num_convidados', num_convidados_real, 'tipo_casamento', tipo_casamento,
        'monde_venda', monde_venda, 'destino_vendido', dest_v, 'origem', origem,
        'valor_final', valor_final, 'consultor_nome', NULL::TEXT,
        'contato_nome', contato_nome, 'contato_external_id', contato_external_id,
        'ac_deal_id', ac_deal_id) ORDER BY data_venda DESC NULLS LAST, id) INTO v_vendas_lista
    FROM (SELECT * FROM _ww_v2_dv WHERE fechou LIMIT 200) sub;

    DROP TABLE _ww_v2_dv;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id, 'date_mode', p_date_mode,
        'fonte_v2', 'ww_v2_casamentos_cache filtrado por ganho_at AC field 87',
        'total_leads', v_total, 'total_fechados', v_total_fechados, 'total_vendas', v_total_fechados,
        'investimento', v_inv_json, 'destino', v_dest_json, 'convidados', v_conv_json,
        'breakdown_tipo', '[]'::JSON, 'vendas_lista', COALESCE(v_vendas_lista, '[]'::JSON),
        'drift_por_consultor', '[]'::JSON, 'drift_por_mes', '[]'::JSON
    );
END $func$;

CREATE OR REPLACE FUNCTION public.ww_v2_lead_ideal(
    p_atual_start     TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_atual_end       TIMESTAMPTZ DEFAULT NOW(),
    p_org_id          UUID DEFAULT NULL,
    p_historico_start TIMESTAMPTZ DEFAULT NULL,
    p_historico_end   TIMESTAMPTZ DEFAULT NULL,
    p_historico_meses INT DEFAULT 12,
    p_min_amostra     INT DEFAULT 2
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_hist_start TIMESTAMPTZ; v_hist_end TIMESTAMPTZ;
    v_total_hist INT := 0; v_total_atual INT := 0;
    v_comparacoes JSON; v_cruzamentos JSON;
    v_top_perfis_hist JSON; v_top_perfis_atual JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 2));
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING nao encontrado'); END IF;

    IF p_historico_start IS NOT NULL AND p_historico_end IS NOT NULL THEN
      v_hist_start := p_historico_start; v_hist_end := p_historico_end;
    ELSE
      v_hist_start := '1970-01-01'::timestamptz; v_hist_end := NOW();
    END IF;

    CREATE TEMP TABLE _ww_v2_pli_h ON COMMIT DROP AS
    SELECT _ww2_norm_faixa_strict(c.entrada_invest) AS faixa,
           _ww2_norm_dest_strict(c.entrada_destino) AS destino,
           _ww2_norm_conv_strict(c.entrada_conv) AS convidados
      FROM ww_v2_casamentos_cache c
      WHERE (c.data_ganho IS NULL OR (c.data_ganho >= v_hist_start AND c.data_ganho <= v_hist_end))
        AND EXISTS (SELECT 1 FROM ww_ac_deal_funnel_cache fc
                    WHERE fc.contact_id = c.contact_id AND fc.is_ww AND fc.ganho_at IS NOT NULL);

    CREATE TEMP TABLE _ww_v2_pli_a ON COMMIT DROP AS
    SELECT _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form') AS destino,
           _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS convidados
      FROM cards c
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_atual_start AND c.created_at <= p_atual_end;

    SELECT COUNT(*) INTO v_total_hist FROM _ww_v2_pli_h;
    SELECT COUNT(*) INTO v_total_atual FROM _ww_v2_pli_a;

    WITH dims AS (
      SELECT 'faixa' AS dim, faixa AS cat FROM _ww_v2_pli_h WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino', destino FROM _ww_v2_pli_h WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados', convidados FROM _ww_v2_pli_h WHERE convidados IS NOT NULL
    ),
    dims_a AS (
      SELECT 'faixa' AS dim, faixa AS cat FROM _ww_v2_pli_a WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino', destino FROM _ww_v2_pli_a WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados', convidados FROM _ww_v2_pli_a WHERE convidados IS NOT NULL
    ),
    tot_h AS (SELECT dim, COUNT(*) AS total FROM dims GROUP BY dim),
    tot_a AS (SELECT dim, COUNT(*) AS total FROM dims_a GROUP BY dim),
    by_h AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims GROUP BY dim, cat),
    by_a AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims_a GROUP BY dim, cat),
    cats AS (SELECT DISTINCT dim, cat FROM (SELECT dim, cat FROM by_h UNION ALL SELECT dim, cat FROM by_a) z),
    rws AS (
      SELECT c.dim, c.cat,
             COALESCE(h.qtd, 0) AS historico_qtd, COALESCE(a.qtd, 0) AS atual_qtd,
             CASE WHEN th.total > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / th.total, 1) END AS historico_pct,
             CASE WHEN ta.total > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / ta.total, 1) END AS atual_pct
        FROM cats c
        LEFT JOIN by_h h ON h.dim=c.dim AND h.cat=c.cat
        LEFT JOIN by_a a ON a.dim=c.dim AND a.cat=c.cat
        LEFT JOIN tot_h th ON th.dim=c.dim
        LEFT JOIN tot_a ta ON ta.dim=c.dim
    )
    SELECT COALESCE(json_agg(json_build_object('dimensao', dim, 'dados', dados)), '[]'::JSON) INTO v_comparacoes
    FROM (
      SELECT dim, json_agg(json_build_object(
          'categoria', cat, 'historico_qtd', historico_qtd, 'historico_pct', historico_pct,
          'atual_qtd', atual_qtd, 'atual_pct', atual_pct,
          'lift', CASE WHEN historico_pct IS NULL OR historico_pct = 0 OR atual_pct IS NULL THEN NULL
                       ELSE ROUND((atual_pct / historico_pct)::numeric, 2) END,
          'delta_pp', CASE WHEN historico_pct IS NULL OR atual_pct IS NULL THEN NULL
                           ELSE ROUND((atual_pct - historico_pct)::numeric, 1) END
        ) ORDER BY historico_qtd DESC, atual_qtd DESC) AS dados
        FROM rws WHERE historico_qtd >= v_min OR atual_qtd >= v_min
       GROUP BY dim
    ) g;

    SELECT json_build_object(
      'faixa_x_convidados', (
        WITH h AS (SELECT faixa AS x, convidados AS y, COUNT(*) AS qtd FROM _ww_v2_pli_h WHERE faixa IS NOT NULL AND convidados IS NOT NULL GROUP BY faixa, convidados),
             a AS (SELECT faixa AS x, convidados AS y, COUNT(*) AS qtd FROM _ww_v2_pli_a WHERE faixa IS NOT NULL AND convidados IS NOT NULL GROUP BY faixa, convidados),
             cells AS (SELECT DISTINCT x, y FROM (SELECT x, y FROM h UNION ALL SELECT x, y FROM a) z)
        SELECT COALESCE(json_agg(json_build_object('x', cells.x, 'y', cells.y,
          'hist_qtd', COALESCE(h.qtd, 0), 'hist_pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / v_total_hist, 1) END,
          'atual_qtd', COALESCE(a.qtd, 0), 'atual_pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / v_total_atual, 1) END
        )), '[]'::JSON) FROM cells LEFT JOIN h ON h.x = cells.x AND h.y = cells.y LEFT JOIN a ON a.x = cells.x AND a.y = cells.y
      ),
      'faixa_x_destino', (
        WITH h AS (SELECT faixa AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_h WHERE faixa IS NOT NULL AND destino IS NOT NULL GROUP BY faixa, destino),
             a AS (SELECT faixa AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_a WHERE faixa IS NOT NULL AND destino IS NOT NULL GROUP BY faixa, destino),
             cells AS (SELECT DISTINCT x, y FROM (SELECT x, y FROM h UNION ALL SELECT x, y FROM a) z)
        SELECT COALESCE(json_agg(json_build_object('x', cells.x, 'y', cells.y,
          'hist_qtd', COALESCE(h.qtd, 0), 'hist_pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / v_total_hist, 1) END,
          'atual_qtd', COALESCE(a.qtd, 0), 'atual_pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / v_total_atual, 1) END
        )), '[]'::JSON) FROM cells LEFT JOIN h ON h.x = cells.x AND h.y = cells.y LEFT JOIN a ON a.x = cells.x AND a.y = cells.y
      ),
      'convidados_x_destino', (
        WITH h AS (SELECT convidados AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_h WHERE convidados IS NOT NULL AND destino IS NOT NULL GROUP BY convidados, destino),
             a AS (SELECT convidados AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_a WHERE convidados IS NOT NULL AND destino IS NOT NULL GROUP BY convidados, destino),
             cells AS (SELECT DISTINCT x, y FROM (SELECT x, y FROM h UNION ALL SELECT x, y FROM a) z)
        SELECT COALESCE(json_agg(json_build_object('x', cells.x, 'y', cells.y,
          'hist_qtd', COALESCE(h.qtd, 0), 'hist_pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / v_total_hist, 1) END,
          'atual_qtd', COALESCE(a.qtd, 0), 'atual_pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / v_total_atual, 1) END
        )), '[]'::JSON) FROM cells LEFT JOIN h ON h.x = cells.x AND h.y = cells.y LEFT JOIN a ON a.x = cells.x AND a.y = cells.y
      )
    ) INTO v_cruzamentos;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa, 'destino', destino, 'convidados', convidados, 'qtd', qtd,
      'pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * qtd / v_total_hist, 1) END
    ) ORDER BY qtd DESC), '[]'::JSON) INTO v_top_perfis_hist
    FROM (SELECT faixa, destino, convidados, COUNT(*) AS qtd FROM _ww_v2_pli_h
           WHERE faixa IS NOT NULL AND destino IS NOT NULL AND convidados IS NOT NULL
           GROUP BY faixa, destino, convidados HAVING COUNT(*) >= 1 ORDER BY COUNT(*) DESC LIMIT 10) g;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa, 'destino', destino, 'convidados', convidados, 'qtd', qtd,
      'pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * qtd / v_total_atual, 1) END
    ) ORDER BY qtd DESC), '[]'::JSON) INTO v_top_perfis_atual
    FROM (SELECT faixa, destino, convidados, COUNT(*) AS qtd FROM _ww_v2_pli_a
           WHERE faixa IS NOT NULL AND destino IS NOT NULL AND convidados IS NOT NULL
           GROUP BY faixa, destino, convidados HAVING COUNT(*) >= v_min ORDER BY COUNT(*) DESC LIMIT 10) g;

    DROP TABLE _ww_v2_pli_h; DROP TABLE _ww_v2_pli_a;

    RETURN json_build_object(
      'atual_start', p_atual_start, 'atual_end', p_atual_end,
      'historico_start', v_hist_start, 'historico_end', v_hist_end,
      'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
      'min_amostra', v_min,
      'fonte_v2', 'ww_v2_casamentos_cache filtrado por ganho AC field 87',
      'total_historico', v_total_hist, 'total_atual', v_total_atual,
      'comparacoes', v_comparacoes, 'cruzamentos', v_cruzamentos,
      'top_perfis_historico', v_top_perfis_hist, 'top_perfis_atual', v_top_perfis_atual
    );
END $func$;
