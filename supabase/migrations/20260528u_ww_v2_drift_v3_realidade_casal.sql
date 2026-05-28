-- ============================================================================
-- ww_v2_drift_venda v3 — Realidade do casal vem do cache novo (Contact 376/121)
--
-- Antes: lia real_orcamento_total e real_pacote_conv do cache antigo
-- (ww_v2_casamentos_cache), que tinha campos defasados / errados.
--
-- Agora: lê real_orcamento_parsed e real_convidados_parsed do cache novo
-- (ww_ac_deal_funnel_cache), populado direto da AC com:
--   - Contact 376 (orçamento total casamento) → real_orcamento_parsed
--   - Contact 121 (previsão convidados) com fallback Deal 62 → real_convidados_parsed
--
-- Entrada (faixa_e, dest_e, conv_e) continua vindo do cache antigo
-- (entrada_invest, entrada_destino, entrada_conv = Deal fields 27/28/26).
--
-- Universo = 155 ganhos (filtro JOIN com ww_ac_deal_funnel_cache).
-- ============================================================================

-- ============================================================================
-- ww_v2_drift_venda v3 — Realidade vem do cache novo (Contact 376/121)
--
-- Substitui as colunas real_orcamento_total e real_pacote_conv (do cache antigo
-- por-contato) por real_orcamento_parsed e real_convidados_parsed (do cache novo
-- por-deal, com rastreamento + parser + fallback Deal 62).
--
-- Entrada continua vindo do cache antigo (entrada_invest, entrada_destino,
-- entrada_conv = Deal fields 27, 28, 26).
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
    SELECT
      cc.contact_id AS id,
      cc.contato_nome AS titulo,
      fc.ac_deal_id,
      fc.ganho_at AS data_venda,
      TRUE AS fechou,
      -- ENTRADA (form site) — cache antigo (deal fields 27, 28, 26)
      _ww2_norm_faixa_strict(cc.entrada_invest) AS faixa_e,
      _ww2_norm_dest_strict(cc.entrada_destino) AS dest_e,
      _ww2_norm_conv_strict(cc.entrada_conv)    AS conv_e,
      -- REALIDADE DO CASAL (Welcome Form) — cache novo (contact 376/121 com rastreamento)
      -- Orçamento bucketizado em faixas
      CASE
        WHEN fc.real_orcamento_parsed IS NULL THEN NULL
        WHEN fc.real_orcamento_parsed < 50000  THEN 'Até R$50 mil'
        WHEN fc.real_orcamento_parsed < 80000  THEN 'R$50-80 mil'
        WHEN fc.real_orcamento_parsed < 100000 THEN 'R$80-100 mil'
        WHEN fc.real_orcamento_parsed < 200000 THEN 'R$100-200 mil'
        WHEN fc.real_orcamento_parsed < 500000 THEN 'R$200-500 mil'
        ELSE '+R$500 mil'
      END AS faixa_v,
      _ww2_norm_dest_strict(cc.real_destino) AS dest_v,  -- destino contratado (deal 121)
      fc.real_convidados_parsed AS num_convidados_real,
      CASE
        WHEN fc.real_convidados_parsed IS NULL THEN NULL
        WHEN fc.real_convidados_parsed <= 2   THEN 'Apenas o casal'
        WHEN fc.real_convidados_parsed <= 20  THEN 'Ate 20'
        WHEN fc.real_convidados_parsed <= 50  THEN '20-50'
        WHEN fc.real_convidados_parsed <= 80  THEN '50-80'
        WHEN fc.real_convidados_parsed <= 100 THEN '80-100'
        ELSE '+100'
      END AS conv_r,
      cc.real_valor_assess AS valor_final,
      cc.real_monde AS monde_venda,
      cc.fonte_lead AS origem,
      NULL::TEXT AS tipo_casamento,
      cc.contato_nome,
      cc.contact_id AS contato_external_id
    FROM ww_v2_casamentos_cache cc
    JOIN ww_ac_deal_funnel_cache fc
      ON fc.contact_id = cc.contact_id
     AND fc.is_ww
     AND fc.ganho_at IS NOT NULL;

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
        'fonte_v2', 'ww_v2_casamentos_cache (entrada) + ww_ac_deal_funnel_cache (realidade casal)',
        'total_leads', v_total, 'total_fechados', v_total_fechados, 'total_vendas', v_total_fechados,
        'investimento', v_inv_json, 'destino', v_dest_json, 'convidados', v_conv_json,
        'breakdown_tipo', '[]'::JSON, 'vendas_lista', COALESCE(v_vendas_lista, '[]'::JSON),
        'drift_por_consultor', '[]'::JSON, 'drift_por_mes', '[]'::JSON
    );
END $func$;
