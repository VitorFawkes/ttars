-- 20260619p_ww_drift_native.sql
-- Weddings / Analytics 2 — "Entrada x Realidade" (drift) em fonte NATIVA (somente ttars).
--
-- Cria versoes _native das RPCs ww_v2_drift_venda e ww_drift_combos que leem
-- uma base view nativa (vw_ww_funnel_base_native) em vez de vw_ww_funnel_base.
-- A base nativa NAO toca ww_ac_deal_funnel_cache / vw_ww_funnel_base / ww_funil_casal (snapshot).
-- Fonte unica: cards + ww_funil_casal_native (per-card, derivada de cards/activities).
--
-- Cobertura dos campos de REALIDADE (medida em 92 cards "ganho" nativos, org WEDDING):
--   * Investimento realizado -> cards.valor_final : MUITO ESPARSO (somente ~2/92 preenchidos).
--       Conforme spec, real_orcamento_parsed = valor_final (reais). Como valor_final quase
--       nunca esta preenchido nos ganhos, a dimensao "investimento realidade" fica praticamente
--       vazia no nativo. (O campo com boa cobertura seria produto_data->>'ww_closer_valor_pacote'
--       (~70/92) ou 'ww_investimento_refinado' (~67/92), mas a spec fixou valor_final.)
--   * Convidados realizado -> produto_data->>'ww_convidados_refinado' (~62/92), normalizado por
--       _ww2_norm_conv_strict e convertido para um inteiro representativo (midpoint da faixa),
--       para alimentar o bucketing INT existente em real_convidados_parsed. COBERTURA OK.
--   * Destino realizado -> _ww2_norm_dest_strict(produto_data->>'ww_onde_casar_refinado') (~70/92),
--       com fallback para o destino declarado (entrada). COBERTURA OK.
--
-- Resumo: "investimento" (realidade) e fino/vazio por dependencia de valor_final; "convidados" e
-- "destino" (realidade) tem boa cobertura via campos refinados do closer.

-- ============================================================================
-- 1) Base view nativa — mesma interface de colunas de vw_ww_funnel_base
-- ============================================================================
CREATE OR REPLACE VIEW public.vw_ww_funnel_base_native AS
SELECT
    -- sem AC: usamos o id do card como "deal id" para preservar a interface
    n.contact_id                                   AS ac_deal_id,
    n.contact_id                                   AS contact_id,
    NULL::uuid                                     AS pipeline_group_id,
    n.deal_title                                   AS deal_title,
    TRUE                                           AS is_ww,
    (n.sdr_agendou_at IS NOT NULL)                 AS marcou_sdr,
    n.fez_sdr                                      AS fez_sdr,
    (n.closer_agendou_at IS NOT NULL)              AS marcou_closer,
    n.fez_closer                                   AS fez_closer,
    n.ganho                                        AS ganho,
    n.sdr_agendou_at                               AS sdr_agendou_at,
    n.closer_agendou_at                            AS closer_agendou_at,
    n.ganho_at                                     AS ganho_at,
    n.sdr_canal                                    AS sdr_canal,
    n.closer_canal                                 AS closer_canal,
    -- "realidade" investimento: ww_closer_valor_pacote (~70/92; valor_final quase vazio).
    -- Parse BR "50.000" / "R$ 50.000,00": tira pontos (milhar), virgula->ponto (decimal), limpa o resto.
    c.produto_data->>'ww_closer_valor_pacote'      AS real_orcamento_raw,
    CASE WHEN c.produto_data->>'ww_closer_valor_pacote' ~ '[0-9]'
         THEN NULLIF(regexp_replace(replace(replace(c.produto_data->>'ww_closer_valor_pacote','.',''),',','.'),'[^0-9.]','','g'),'')::numeric
         ELSE NULL END                             AS real_orcamento_parsed,
    -- "realidade" convidados: campo refinado do closer (boa cobertura)
    c.produto_data->>'ww_convidados_refinado'      AS real_convidados_raw,
    CASE _ww2_norm_conv_strict(c.produto_data->>'ww_convidados_refinado')
        WHEN 'Apenas o casal' THEN 2
        WHEN 'Até 20'         THEN 15
        WHEN '20-50'          THEN 35
        WHEN '50-100'         THEN 75
        WHEN '+100'           THEN 130
        ELSE NULL
    END                                            AS real_convidados_parsed,
    CASE
        WHEN c.produto_data->>'ww_convidados_refinado' IS NOT NULL THEN 'ttars_convidados_refinado'
        ELSE NULL
    END                                            AS real_convidados_fonte,
    c.id                                           AS card_id,
    c.org_id                                       AS org_id,
    c.created_at                                   AS card_created_at,
    c.status_comercial                             AS status_comercial,
    c.valor_final                                  AS valor_final,
    c.titulo                                       AS card_titulo,
    c.sdr_owner_id                                 AS sdr_owner_id,
    c.vendas_owner_id                              AS vendas_owner_id,
    c.pos_owner_id                                 AS pos_owner_id,
    c.dono_atual_id                                AS dono_atual_id,
    -- entrada declarada (vem pronta do native)
    n.faixa                                        AS faixa,
    n.convidados                                   AS convidados,
    n.destino                                      AS destino,
    -- "realidade" destino: refinado do closer com fallback para o declarado
    COALESCE(
        _ww2_norm_dest_strict(c.produto_data->>'ww_onde_casar_refinado'),
        n.destino
    )                                              AS destino_final,
    n.origem                                       AS origem,
    n.tipo                                         AS tipo,
    COALESCE(n.lead_created_at, n.sdr_agendou_at, n.closer_agendou_at, n.ganho_at) AS data_entrada
FROM ww_funil_casal_native n
JOIN cards c ON c.id = n.contact_id::uuid;

COMMENT ON VIEW public.vw_ww_funnel_base_native IS
'Base nativa (somente ttars: cards + ww_funil_casal_native) com a MESMA interface de colunas de vw_ww_funnel_base. REALIDADE: real_orcamento_parsed=valor_final (esparso ~2/92), real_convidados_parsed=midpoint de ww_convidados_refinado (~62/92), destino_final=ww_onde_casar_refinado refinado com fallback ao declarado (~70/92). Nao le ww_ac_deal_funnel_cache.';

-- ============================================================================
-- 2) ww_v2_drift_venda_native — corpo identico, fonte trocada para a base nativa
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ww_v2_drift_venda_native(
    p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_org_id uuid DEFAULT NULL::uuid,
    p_origins text[] DEFAULT NULL::text[],
    p_date_mode text DEFAULT 'cohort'::text,
    p_tipos text[] DEFAULT NULL::text[],
    p_sdr_canal text[] DEFAULT NULL::text[],
    p_closer_canal text[] DEFAULT NULL::text[]
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           v.faixa AS faixa_e,
           v.destino AS dest_e,
           v.convidados AS conv_e,
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
           _ww_norm_canal_strict(v.sdr_canal::TEXT) AS canal_sdr,
           _ww_norm_canal_strict(v.closer_canal) AS canal_closer,
           v.card_titulo AS contato_nome,
           v.contact_id AS contato_external_id
    FROM vw_ww_funnel_base_native v
    WHERE CASE
      WHEN p_date_mode = 'throughput' THEN (v.ganho_at BETWEEN p_date_start AND p_date_end)
      ELSE (v.data_entrada >= p_date_start AND v.data_entrada <= p_date_end)
    END;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE tipo_casamento IS NULL OR tipo_casamento != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;
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
        'fonte_v2', 'vw_ww_funnel_base_native (somente ttars: cards + ww_funil_casal_native)',
        'total_leads', v_total, 'total_fechados', v_total_fechados, 'total_vendas', v_total_fechados,
        'investimento', v_inv_json, 'destino', v_dest_json, 'convidados', v_conv_json,
        'breakdown_tipo', '[]'::JSON, 'vendas_lista', COALESCE(v_vendas_lista, '[]'::JSON),
        'drift_por_consultor', '[]'::JSON, 'drift_por_mes', '[]'::JSON
    );
END $function$;

-- ============================================================================
-- 3) ww_drift_combos_native — corpo identico, fonte trocada para a base nativa
-- ============================================================================
CREATE OR REPLACE FUNCTION public.ww_drift_combos_native(
    p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_org_id uuid DEFAULT NULL::uuid,
    p_date_mode text DEFAULT 'cohort'::text,
    p_tipos text[] DEFAULT NULL::text[],
    p_origins text[] DEFAULT NULL::text[],
    p_sdr_canal text[] DEFAULT NULL::text[],
    p_closer_canal text[] DEFAULT NULL::text[]
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      FROM vw_ww_funnel_base_native v
     WHERE v.data_entrada >= p_date_start AND v.data_entrada <= p_date_end
       AND (p_tipos IS NULL        OR v.tipo = ANY(p_tipos))
       AND (p_origins IS NULL      OR v.origem = ANY(p_origins))
       AND (p_sdr_canal IS NULL    OR _ww_norm_canal_strict(v.sdr_canal::TEXT) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL OR _ww_norm_canal_strict(v.closer_canal) = ANY(p_closer_canal));

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
      'fonte_marcos', 'vw_ww_funnel_base_native (somente ttars) — conversão sempre por safra + filtros tipo/origem/canal'
    );
END $function$;
