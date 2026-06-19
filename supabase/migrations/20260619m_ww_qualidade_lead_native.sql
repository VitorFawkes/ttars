-- 20260619m_ww_qualidade_lead_native.sql
-- ============================================================================
-- ww_qualidade_lead_native — versão NATIVA (ttars-only) de ww_qualidade_lead
-- ----------------------------------------------------------------------------
-- Dashboard "Analytics 2" (Weddings) — Qualidade de Lead.
--
-- Mesma assinatura e MESMO shape de JSON que public.ww_qualidade_lead, porém
-- 100% alimentada por ttars via a view por-card ww_funil_casal_native
-- (1 linha por card WEDDING). NÃO lê ww_ac_deal_funnel_cache, ww_funil_casal
-- (snapshot) nem vw_ww_funnel_base.
--
-- Mapeamento de origem (cache → nativo):
--   * universo / "entrou"   = entrou_valido (na janela)
--   * âncora de coorte      = lead_created_at  (sempre presente)
--   * âncora de throughput  = ganho_at
--   * "fechou"              = ganho
--   * ticket (valor_pac)    = valor_final
--   * faixa/destino/conv.   = colunas faixa / destino / convidados (JÁ normalizadas
--                             na view — sem reaplicar _ww2_norm_* )
--   * origem / tipo         = colunas origem / tipo (já normalizadas)
--   * canal_sdr/closer      = sdr_canal / closer_canal (substituem os campos do cache)
--   * status do lead        = ganho / is_perdido direto na view (sem join em snapshot)
--
-- Nenhum campo precisou ser degradado: todos os sub-campos do cache têm
-- equivalente nativo na view ww_funil_casal_native.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww_qualidade_lead_native(
    p_date_start    timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end      timestamp with time zone DEFAULT now(),
    p_org_id        uuid    DEFAULT NULL::uuid,
    p_origins       text[]  DEFAULT NULL::text[],
    p_date_mode     text    DEFAULT 'cohort'::text,
    p_event_stage_id uuid   DEFAULT NULL::uuid,
    p_tipos         text[]  DEFAULT NULL::text[],
    p_min_amostra   integer DEFAULT 3,
    p_sdr_canal     text[]  DEFAULT NULL::text[],
    p_closer_canal  text[]  DEFAULT NULL::text[],
    p_status_lead   text    DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_total_entraram INT := 0; v_total_fecharam INT := 0;
    v_taxa_geral NUMERIC;
    v_por_faixa JSON; v_por_destino JSON; v_por_convidados JSON;
    v_of JSON; v_od JSON; v_oc JSON;
    v_por_canal_sdr JSON; v_por_canal_closer JSON;
    v_heatmap JSON; v_cruz JSON; v_evolucao JSON; v_comparacao JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 3));
    v_cob JSON;
BEGIN
    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT n.contact_id,
           n.lead_created_at AS entrada_at,
           n.ganho_at,
           n.faixa,
           n.convidados AS conv_bucket,
           n.destino,
           n.origem,
           n.tipo,
           n.sdr_canal    AS canal_sdr,
           n.closer_canal AS canal_closer,
           n.ganho        AS fechou,
           n.valor_final  AS valor_pac
    FROM ww_funil_casal_native n
    WHERE n.entrou_valido
      AND (p_org_id IS NULL OR n.org_id = p_org_id)
      AND CASE
        WHEN p_date_mode = 'throughput' THEN n.ganho_at BETWEEN p_date_start AND p_date_end
        ELSE n.lead_created_at BETWEEN p_date_start AND p_date_end
      END
      -- status do CASAL (uma definição de perdido pra tudo — nativo: ganho/is_perdido na view)
      AND (p_status_lead IS NULL
           OR (p_status_lead = 'perdido' AND COALESCE(n.is_perdido, FALSE))
           OR (p_status_lead = 'aberto'  AND NOT COALESCE(n.ganho, FALSE) AND NOT COALESCE(n.is_perdido, FALSE)));

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ql WHERE origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ql WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;
    v_taxa_geral := CASE WHEN v_total_entraram > 0 THEN 100.0 * v_total_fecharam / v_total_entraram END;

    SELECT json_build_object(
        'com_faixa', COUNT(*) FILTER (WHERE faixa IS NOT NULL),
        'com_destino', COUNT(*) FILTER (WHERE destino IS NOT NULL),
        'com_convidados', COUNT(*) FILTER (WHERE conv_bucket IS NOT NULL)
    ) INTO v_cob FROM _ww_ql;

    -- ── por_faixa (ordem canônica; pequenos → outros) ──
    WITH g AS (
        SELECT faixa AS cat,
               CASE faixa WHEN 'Até R$50 mil' THEN 1 WHEN 'R$50-80 mil' THEN 2 WHEN 'R$50-100 mil' THEN 2
                          WHEN 'R$80-100 mil' THEN 3 WHEN 'R$100-200 mil' THEN 4 WHEN 'R$200-500 mil' THEN 5
                          WHEN '+R$500 mil' THEN 6 WHEN 'Mais de R$500 mil' THEN 6 ELSE 99 END AS ordem,
               COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE faixa IS NOT NULL GROUP BY faixa
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY ordem, e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_faixa, v_of FROM g;

    -- ── por_destino ──
    WITH g AS (
        SELECT destino AS cat, COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE destino IS NOT NULL GROUP BY destino
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_destino, v_od FROM g;

    -- ── por_convidados (ordem canônica) ──
    WITH g AS (
        SELECT conv_bucket AS cat,
               CASE conv_bucket WHEN 'Apenas o casal' THEN 1 WHEN 'Até 20' THEN 2 WHEN '20-50' THEN 3
                                WHEN '50-80' THEN 4 WHEN '50-100' THEN 4 WHEN '80-100' THEN 5 WHEN '+100' THEN 6 ELSE 99 END AS ordem,
               COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE conv_bucket IS NOT NULL GROUP BY conv_bucket
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY ordem, e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_convidados, v_oc FROM g;

    -- ── conversão por tipo de reunião (universo = quem FEZ a reunião) ──
    SELECT COALESCE(json_agg(json_build_object(
        'categoria', canal, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY e DESC), '[]'::json) INTO v_por_canal_sdr
    FROM (SELECT canal_sdr AS canal, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE canal_sdr IS NOT NULL GROUP BY canal_sdr) g;

    SELECT COALESCE(json_agg(json_build_object(
        'categoria', canal, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY e DESC), '[]'::json) INTO v_por_canal_closer
    FROM (SELECT canal_closer AS canal, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE canal_closer IS NOT NULL GROUP BY canal_closer) g;

    -- ── heatmap faixa × destino ──
    SELECT COALESCE(json_agg(json_build_object(
        'faixa', faixa, 'destino', destino, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
        'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0)
    )), '[]'::json) INTO v_heatmap
    FROM (SELECT faixa, destino, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f,
                 AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm
            FROM _ww_ql WHERE faixa IS NOT NULL AND destino IS NOT NULL
           GROUP BY faixa, destino HAVING COUNT(*) >= v_min) g;

    -- ── cruzamentos — {linha, coluna, entraram, fecharam, taxa_pct} ──
    SELECT json_build_object(
      'faixa_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', faixa, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT faixa, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE faixa IS NOT NULL AND origem IS NOT NULL
               GROUP BY faixa, origem HAVING COUNT(*) >= v_min) a),
      'destino_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', destino, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT destino, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE destino IS NOT NULL AND origem IS NOT NULL
               GROUP BY destino, origem HAVING COUNT(*) >= v_min) a),
      'faixa_x_tipo', (
        SELECT COALESCE(json_agg(json_build_object('linha', faixa, 'coluna', tipo, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT faixa, tipo, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE faixa IS NOT NULL AND tipo IS NOT NULL
               GROUP BY faixa, tipo HAVING COUNT(*) >= v_min) a),
      'convidados_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', conv_bucket, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT conv_bucket, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE conv_bucket IS NOT NULL AND origem IS NOT NULL
               GROUP BY conv_bucket, origem HAVING COUNT(*) >= v_min) a)
    ) INTO v_cruz;

    -- ── evolução mensal por faixa ──
    SELECT COALESCE(json_agg(json_build_object(
        'mes', mes, 'categoria', faixa, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY mes), '[]'::json) INTO v_evolucao
    FROM (SELECT TO_CHAR(DATE_TRUNC('month', entrada_at), 'YYYY-MM') AS mes, faixa,
                 COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE faixa IS NOT NULL
           GROUP BY DATE_TRUNC('month', entrada_at), faixa) g;

    -- ── quem ENTRA × quem FECHA — % de entrada vs % dos fechamentos + lift ──
    WITH dims AS (
        SELECT 'faixa'::TEXT AS dim, faixa AS cat, fechou FROM _ww_ql WHERE faixa IS NOT NULL
        UNION ALL SELECT 'destino', destino, fechou FROM _ww_ql WHERE destino IS NOT NULL
        UNION ALL SELECT 'convidados', conv_bucket, fechou FROM _ww_ql WHERE conv_bucket IS NOT NULL
        UNION ALL SELECT 'origem', origem, fechou FROM _ww_ql WHERE origem IS NOT NULL
        UNION ALL SELECT 'tipo', tipo, fechou FROM _ww_ql WHERE tipo IS NOT NULL
    ),
    tot AS (SELECT dim, COUNT(*) AS t_e, COUNT(*) FILTER (WHERE fechou) AS t_f FROM dims GROUP BY dim),
    cat AS (SELECT dim, cat, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f FROM dims GROUP BY dim, cat),
    linhas AS (
        SELECT c.dim, c.cat, c.e, c.f,
               CASE WHEN t.t_e > 0 THEN ROUND(100.0 * c.e / t.t_e, 1) END AS e_pct,
               CASE WHEN t.t_f > 0 THEN ROUND(100.0 * c.f / t.t_f, 1) END AS f_pct
          FROM cat c JOIN tot t ON t.dim = c.dim
         WHERE c.e >= v_min
    )
    SELECT COALESCE(json_agg(json_build_object('dimensao', dim, 'dados', dados)), '[]'::json) INTO v_comparacao
    FROM (
        SELECT dim, json_agg(json_build_object(
            'categoria', cat,
            'entrada_qtd', e, 'entrada_pct', e_pct,
            'fechou_qtd', f, 'fechou_pct', f_pct,
            'lift', CASE WHEN e_pct IS NULL OR e_pct = 0 OR f_pct IS NULL THEN NULL
                         ELSE ROUND((f_pct / e_pct)::numeric, 2) END
        ) ORDER BY e DESC) AS dados
          FROM linhas GROUP BY dim
    ) g;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'min_amostra', v_min,
        'total_entraram', v_total_entraram, 'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
        'cobertura', v_cob,
        'por_faixa', v_por_faixa, 'por_destino', v_por_destino, 'por_convidados', v_por_convidados,
        'outros_amostra_pequena', json_build_object('faixa', v_of, 'destino', v_od, 'convidados', v_oc),
        'por_canal_sdr', v_por_canal_sdr, 'por_canal_closer', v_por_canal_closer,
        'heatmap_faixa_destino', v_heatmap,
        'cruzamentos', v_cruz,
        'evolucao_mensal_por_faixa', v_evolucao,
        'comparacao_entrada_vs_fechamento', v_comparacao,
        'fonte_marcos', 'ww_funil_casal_native (universo ttars: entrou_valido; dimensoes ja normalizadas na view; tickets do valor_final dos fechados)'
    );
END $function$;
