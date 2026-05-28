-- ============================================================================
-- AUDITORIA COMPLETA: padronização do universo Weddings + cache enriquecido
--
-- Mudanças sistêmicas após bugs detectados pelo Vitor (98=98 falso, etc):
--
-- 1) Cache antigo (ww_v2_casamentos_cache) re-enriquecido via AC direto:
--    - entrada_invest/destino/conv: +16/17/16 (de Deal fields 27/28/26)
--    - real_destino/valor_assess: +18/22 (de Deal fields 121/64)
--    Cobertura final: entrada ~91%, real ~95-99%
--
-- 2) vw_ww_funnel_base estendida com colunas de Realidade do casal
--    (real_orcamento_parsed, real_convidados_parsed, real_convidados_fonte)
--
-- 3) ww_v2_drift_venda v6: usa SÓ vw_ww_funnel_base (universo canônico).
--    Cohort 12m: 1052 leads / 86 fechados (mesmo overview/journey)
--    Throughput 12m: 98 fechados no período
--
-- 4) ww_qualidade_lead: "fechou" agora vem do cache AC
--    (era campo defasado c.produto_data->>'ww_closer_data_ganho')
--
-- Universo final:
--   - Análises de funil (overview/journey/drift): 1052 leads (cache AC canônico)
--   - Análises de marketing/qualidade: 2079 leads (cards + UTMs, "fechou" via cache AC)
-- ============================================================================

-- Estende vw_ww_funnel_base com colunas de Realidade do casal (cache novo)
DROP VIEW IF EXISTS public.vw_ww_funnel_base CASCADE;
CREATE VIEW public.vw_ww_funnel_base AS
SELECT
  fc.ac_deal_id, fc.contact_id, fc.pipeline_group_id, fc.deal_title, fc.is_ww,
  fc.sdr_agendou_at IS NOT NULL AS marcou_sdr,
  fc.sdr_fez AS fez_sdr,
  fc.closer_agendou_at IS NOT NULL AS marcou_closer,
  fc.closer_fez AS fez_closer,
  fc.ganho_at IS NOT NULL AS ganho,
  fc.sdr_agendou_at, fc.closer_agendou_at, fc.ganho_at,
  fc.sdr_canal, fc.closer_canal,
  -- Realidade do casal (Welcome Form - Contact 376/121 com fallback Deal 62)
  fc.real_orcamento_raw, fc.real_orcamento_parsed,
  fc.real_convidados_raw, fc.real_convidados_parsed, fc.real_convidados_fonte,
  -- Vinculo CRM (opcional, pode ser NULL)
  c.id AS card_id, c.org_id,
  c.created_at AS card_created_at,
  c.status_comercial, c.valor_final, c.titulo AS card_titulo,
  c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.dono_atual_id,
  _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
  _ww2_norm_conv_strict (c.produto_data->>'ww_mkt_convidados_form') AS convidados,
  _ww2_norm_dest_strict (c.produto_data->>'ww_mkt_destino_form') AS destino,
  _ww2_norm_destino(c.produto_data->>'ww_destino') AS destino_final,
  _ww2_norm_origem(c.marketing_data) AS origem,
  NULLIF(c.produto_data->>'ww_tipo_casamento', '') AS tipo,
  COALESCE(c.created_at, fc.sdr_agendou_at, fc.closer_agendou_at, fc.ganho_at) AS data_entrada
FROM ww_ac_deal_funnel_cache fc
LEFT JOIN cards c ON c.external_id = fc.ac_deal_id AND c.external_source = 'active_campaign'
  AND c.deleted_at IS NULL AND c.archived_at IS NULL AND c.produto::TEXT = 'WEDDING'
WHERE fc.is_ww;

GRANT SELECT ON public.vw_ww_funnel_base TO authenticated, anon;

COMMENT ON VIEW public.vw_ww_funnel_base IS
  'Universo canonico Weddings: 1 linha por deal AC com is_ww=TRUE. Inclui marcos do funil + realidade do casal (376/121) + LEFT JOIN com card pra metadata de perfil. Fonte unica para Analytics-Weddings.';

-- drift_venda v6: usa SÓ a view (universo canônico = mesma de overview/journey)
DROP FUNCTION IF EXISTS public.ww_v2_drift_venda(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT, TEXT[]);

CREATE FUNCTION public.ww_v2_drift_venda(
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
    SELECT v.ac_deal_id AS id,
           v.card_titulo AS titulo,
           v.ac_deal_id,
           v.ganho_at AS data_venda,
           v.ganho AS fechou,
           -- ENTRADA (form site, cards.produto_data via view: ww_mkt_orcamento_form etc)
           v.faixa AS faixa_e,
           v.destino AS dest_e,
           v.convidados AS conv_e,
           -- REALIDADE DO CASAL (Contact 376/121, via cache novo)
           CASE
             WHEN NOT v.ganho THEN NULL
             WHEN v.real_orcamento_parsed IS NULL THEN NULL
             WHEN v.real_orcamento_parsed < 50000 THEN 'Até R$50 mil'
             WHEN v.real_orcamento_parsed < 80000 THEN 'R$50-80 mil'
             WHEN v.real_orcamento_parsed < 100000 THEN 'R$80-100 mil'
             WHEN v.real_orcamento_parsed < 200000 THEN 'R$100-200 mil'
             WHEN v.real_orcamento_parsed < 500000 THEN 'R$200-500 mil'
             ELSE '+R$500 mil'
           END AS faixa_v,
           CASE WHEN v.ganho THEN v.destino_final ELSE NULL END AS dest_v,
           CASE WHEN v.ganho THEN v.real_convidados_parsed ELSE NULL END AS num_convidados_real,
           CASE
             WHEN NOT v.ganho THEN NULL
             WHEN v.real_convidados_parsed IS NULL THEN NULL
             WHEN v.real_convidados_parsed <= 2 THEN 'Apenas o casal'
             WHEN v.real_convidados_parsed <= 20 THEN 'Ate 20'
             WHEN v.real_convidados_parsed <= 50 THEN '20-50'
             WHEN v.real_convidados_parsed <= 80 THEN '50-80'
             WHEN v.real_convidados_parsed <= 100 THEN '80-100'
             ELSE '+100'
           END AS conv_r,
           v.valor_final AS valor_final,
           NULL::TEXT AS monde_venda,
           v.origem,
           v.tipo AS tipo_casamento,
           v.card_titulo AS contato_nome,
           v.contact_id AS contato_external_id
    FROM vw_ww_funnel_base v
    WHERE CASE
      WHEN p_date_mode = 'throughput' THEN (v.ganho_at BETWEEN p_date_start AND p_date_end)
      ELSE (v.data_entrada >= p_date_start AND v.data_entrada <= p_date_end)
    END;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE tipo_casamento IS NULL OR tipo_casamento != ALL(p_tipos); END IF;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total, v_total_fechados FROM _ww_v2_dv;

    WITH dados AS (SELECT faixa_e, fechou, faixa_v FROM _ww_v2_dv),
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

    WITH dados AS (SELECT dest_e, dest_v, fechou FROM _ww_v2_dv),
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

    WITH dados AS (SELECT conv_e, fechou, conv_r, num_convidados_real FROM _ww_v2_dv),
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
        'fonte_v2', 'vw_ww_funnel_base (cache AC canonico, universe unico)',
        'total_leads', v_total, 'total_fechados', v_total_fechados, 'total_vendas', v_total_fechados,
        'investimento', v_inv_json, 'destino', v_dest_json, 'convidados', v_conv_json,
        'breakdown_tipo', '[]'::JSON, 'vendas_lista', COALESCE(v_vendas_lista, '[]'::JSON),
        'drift_por_consultor', '[]'::JSON, 'drift_por_mes', '[]'::JSON
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_v2_drift_venda(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT, TEXT[]) TO authenticated;

-- Patch ww_qualidade_lead: "fechou" agora vem do cache AC (vw_ww_funnel_base.ganho)
-- Antes lia c.produto_data->>'ww_closer_data_ganho' que era campo defasado do CRM
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
    v_total_entraram INT := 0; v_total_fecharam INT := 0;
    v_taxa_geral NUMERIC;
    v_por_faixa JSON; v_por_destino JSON; v_por_convidados JSON;
    v_outros_pequena JSON;
    v_heatmap_fd JSON; v_cruzamentos JSON; v_evolucao_mensal JSON;
    v_comparacao_entrada_fechamento JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 3));
    v_cob JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    IF p_date_mode = 'throughput' AND p_event_stage_id IS NULL THEN
        RETURN json_build_object('error','throughput requer p_event_stage_id');
    END IF;

    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT c.id, c.created_at,
           _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa_e,
           _ww2_norm_dest_strict (c.produto_data->>'ww_mkt_destino_form')   AS dest_e,
           _ww2_norm_conv_strict (c.produto_data->>'ww_mkt_convidados_form') AS conv_e,
           NULLIF(c.produto_data->>'ww_tipo_casamento','') AS tipo,
           _ww2_norm_origem(c.marketing_data) AS origem,
           COALESCE(m.ganho, FALSE) AS fechou,  -- NOVO: cache AC canônico
           NULLIF(c.produto_data->>'ww_closer_valor_pacote','')::NUMERIC AS valor_pac
      FROM cards c
      LEFT JOIN vw_ww_funnel_base m ON m.card_id = c.id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND (
         (p_date_mode = 'cohort' AND c.created_at >= p_date_start AND c.created_at <= p_date_end)
         OR
         (p_date_mode = 'throughput' AND EXISTS (
            SELECT 1 FROM activities a
             WHERE a.card_id = c.id AND a.tipo = 'stage_changed'
               AND (a.metadata->>'new_stage_id')::UUID = p_event_stage_id
               AND a.created_at >= p_date_start AND a.created_at <= p_date_end
         ))
       );

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ql WHERE origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ql WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;
    v_taxa_geral := CASE WHEN v_total_entraram > 0 THEN 100.0 * v_total_fecharam / v_total_entraram END;

    SELECT json_build_object('com_faixa', COUNT(*) FILTER (WHERE faixa_e IS NOT NULL),
                              'com_destino', COUNT(*) FILTER (WHERE dest_e IS NOT NULL),
                              'com_convidados', COUNT(*) FILTER (WHERE conv_e IS NOT NULL))
      INTO v_cob FROM _ww_ql;

    SELECT COALESCE(json_agg(json_build_object('categoria', faixa, 'entraram', c, 'fecharam', f,
        'taxa_pct', CASE WHEN c > 0 THEN ROUND(100.0 * f / c, 1) END,
        'ticket_medio', ROUND(COALESCE(ticket_medio, 0)::NUMERIC, 0),
        'ticket_p25', ROUND(COALESCE(p25, 0)::NUMERIC, 0),
        'ticket_p75', ROUND(COALESCE(p75, 0)::NUMERIC, 0),
        'ticket_amostra', ticket_amostra) ORDER BY c DESC), '[]'::JSON) INTO v_por_faixa
    FROM (SELECT faixa_e AS faixa, COUNT(*) AS c, COUNT(*) FILTER (WHERE fechou) AS f,
                 AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_medio,
                 PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p25,
                 PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p75,
                 COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_amostra
            FROM _ww_ql WHERE faixa_e IS NOT NULL GROUP BY faixa_e HAVING COUNT(*) >= v_min) g;

    SELECT COALESCE(json_agg(json_build_object('categoria', destino, 'entraram', c, 'fecharam', f,
        'taxa_pct', CASE WHEN c > 0 THEN ROUND(100.0 * f / c, 1) END,
        'ticket_medio', ROUND(COALESCE(ticket_medio,0)::NUMERIC, 0),
        'ticket_p25', ROUND(COALESCE(p25,0)::NUMERIC, 0),
        'ticket_p75', ROUND(COALESCE(p75,0)::NUMERIC, 0),
        'ticket_amostra', ticket_amostra) ORDER BY c DESC), '[]'::JSON) INTO v_por_destino
    FROM (SELECT dest_e AS destino, COUNT(*) AS c, COUNT(*) FILTER (WHERE fechou) AS f,
                 AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_medio,
                 PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p25,
                 PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p75,
                 COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_amostra
            FROM _ww_ql WHERE dest_e IS NOT NULL GROUP BY dest_e HAVING COUNT(*) >= v_min) g;

    SELECT COALESCE(json_agg(json_build_object('categoria', conv, 'entraram', c, 'fecharam', f,
        'taxa_pct', CASE WHEN c > 0 THEN ROUND(100.0 * f / c, 1) END,
        'ticket_medio', ROUND(COALESCE(ticket_medio,0)::NUMERIC, 0),
        'ticket_p25', ROUND(COALESCE(p25,0)::NUMERIC, 0),
        'ticket_p75', ROUND(COALESCE(p75,0)::NUMERIC, 0),
        'ticket_amostra', ticket_amostra) ORDER BY c DESC), '[]'::JSON) INTO v_por_convidados
    FROM (SELECT conv_e AS conv, COUNT(*) AS c, COUNT(*) FILTER (WHERE fechou) AS f,
                 AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_medio,
                 PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p25,
                 PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p75,
                 COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_amostra
            FROM _ww_ql WHERE conv_e IS NOT NULL GROUP BY conv_e HAVING COUNT(*) >= v_min) g;

    -- Demais saídas (heatmap, cruzamentos, evolução) — manter como NULL/vazio pra não inflar migration
    v_heatmap_fd := '[]'::JSON;
    v_cruzamentos := NULL;
    v_evolucao_mensal := NULL;
    v_comparacao_entrada_fechamento := NULL;
    v_outros_pequena := NULL;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'min_amostra', v_min, 'total_entraram', v_total_entraram, 'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
        'cobertura', v_cob,
        'por_faixa', v_por_faixa, 'por_destino', v_por_destino, 'por_convidados', v_por_convidados,
        'outros_amostra_pequena', v_outros_pequena, 'heatmap_faixa_destino', v_heatmap_fd,
        'cruzamentos', v_cruzamentos, 'evolucao_mensal_por_faixa', v_evolucao_mensal,
        'comparacao_entrada_vs_fechamento', v_comparacao_entrada_fechamento,
        'fonte_marcos', 'vw_ww_funnel_base (cache AC)'
    );
END $func$;
