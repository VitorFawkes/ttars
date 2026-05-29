-- ============================================================================
-- Analytics-Weddings — migra 4 RPCs (Qualidade, Perdas, Marketing) para
-- universo único = ww_ac_deal_funnel_cache (AC canônico).
--
-- Motivação: pivot do Vitor (29/05) — "quero APENAS AC, NADA de CRM".
-- Hoje as RPCs de Qualidade, Perdas e Marketing usam `cards` (universo CRM)
-- que diverge da AC em ~50% dos registros.
--
-- CORREÇÕES PRESERVADAS de migrations anteriores:
--   1) ww_qualidade_lead (20260526g/20260527u/20260528x):
--      - p_date_mode cohort/throughput → preservado (usa entrada_at vs ganho_at)
--      - "fechou" via cache AC (não cards.produto_data) → preservado (cache nativo)
--      - Aceita p_event_stage_id como NO-OP (era usado em throughput CRM, agora ganho_at)
--   2) ww2_loss_reasons (20260525e):
--      - Universo cohort por created_at → trocado por entrada_at (proxy AC)
--   3) ww2_marketing (20260525e):
--      - Cohort por created_at → trocado por entrada_at
--   4) ww_marketing_qualidade (20260527x/20260528v):
--      - p_date_mode adicionado em 0528v → preservado
--      - "fechou" via cache AC adicionado em 0528v → preservado (cache nativo)
--
-- p_destinos/p_tipos/p_consultor_ids viram NO-OP — não existem na AC.
-- p_org_id mantém compat, mas cache é GLOBAL.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Helpers
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._ww_ac_norm_origem(p_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_raw IS NULL OR p_raw = '' THEN RETURN 'Desconhecida'; END IF;
  RETURN CASE
    WHEN p_raw ILIKE '%leadster%' THEN 'Leadster'
    WHEN p_raw ILIKE '%instagram%' OR p_raw ILIKE 'ig %' OR p_raw = 'ig' THEN 'Instagram'
    WHEN p_raw ILIKE '%facebook%' OR p_raw ILIKE '%fb%' OR p_raw ILIKE '%meta%' THEN 'Facebook/Meta'
    WHEN p_raw ILIKE '%google%' OR p_raw ILIKE '%adwords%' THEN 'Google'
    WHEN p_raw ILIKE '%site%' OR p_raw ILIKE '%formul%' OR p_raw ILIKE '%direct%' THEN 'Site direto'
    WHEN p_raw ILIKE '%indicac%' OR p_raw ILIKE '%referral%' OR p_raw ILIKE '%boca%' THEN 'Indicação'
    ELSE INITCAP(p_raw)
  END;
END $$;

CREATE OR REPLACE FUNCTION public._ww_ac_faixa_from_valor(p_valor numeric)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_valor IS NULL OR p_valor <= 0 THEN RETURN NULL; END IF;
  RETURN CASE
    WHEN p_valor <= 50000  THEN 'Até R$50 mil'
    WHEN p_valor <= 80000  THEN 'R$50-80 mil'
    WHEN p_valor <= 100000 THEN 'R$80-100 mil'
    WHEN p_valor <= 200000 THEN 'R$100-200 mil'
    WHEN p_valor <= 500000 THEN 'R$200-500 mil'
    ELSE 'Mais de R$500 mil'
  END;
END $$;

CREATE OR REPLACE FUNCTION public._ww_ac_convidados_bucket(p_qtd int)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_qtd IS NULL OR p_qtd <= 0 THEN RETURN NULL; END IF;
  RETURN CASE
    WHEN p_qtd <= 50  THEN 'Até 50'
    WHEN p_qtd <= 100 THEN '50-100'
    WHEN p_qtd <= 150 THEN '100-150'
    WHEN p_qtd <= 200 THEN '150-200'
    WHEN p_qtd <= 300 THEN '200-300'
    ELSE 'Mais de 300'
  END;
END $$;

-- ── ww_qualidade_lead ─────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer);

CREATE OR REPLACE FUNCTION public.ww_qualidade_lead(
    p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_date_mode text DEFAULT 'cohort',
    p_event_stage_id uuid DEFAULT NULL,
    p_tipos text[] DEFAULT NULL,
    p_min_amostra integer DEFAULT 3
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_total_entraram INT := 0; v_total_fecharam INT := 0;
    v_taxa_geral NUMERIC;
    v_por_faixa JSON; v_por_convidados JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 3));
    v_cob JSON;
BEGIN
    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           _ww_ac_faixa_from_valor(c.real_orcamento_parsed) AS faixa,
           _ww_ac_convidados_bucket(c.real_convidados_parsed) AS conv_bucket,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           (c.ganho_at IS NOT NULL) AS fechou,
           c.real_orcamento_parsed AS valor_pac
    FROM ww_ac_deal_funnel_cache c
    WHERE c.is_ww
      AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
      AND CASE
        WHEN p_date_mode = 'throughput' THEN c.ganho_at BETWEEN p_date_start AND p_date_end
        ELSE COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end
      END;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ql WHERE origem != ALL(p_origins); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;
    v_taxa_geral := CASE WHEN v_total_entraram > 0 THEN 100.0 * v_total_fecharam / v_total_entraram END;

    SELECT json_build_object(
        'com_faixa', COUNT(*) FILTER (WHERE faixa IS NOT NULL),
        'com_destino', 0,
        'com_convidados', COUNT(*) FILTER (WHERE conv_bucket IS NOT NULL)
    ) INTO v_cob FROM _ww_ql;

    SELECT COALESCE(json_agg(json_build_object(
        'categoria', faixa, 'entraram', c, 'fecharam', f,
        'taxa_pct', CASE WHEN c > 0 THEN ROUND(100.0 * f / c, 1) END,
        'ticket_medio', ROUND(COALESCE(ticket_medio, 0)::NUMERIC, 0),
        'ticket_p25', ROUND(COALESCE(p25, 0)::NUMERIC, 0),
        'ticket_p75', ROUND(COALESCE(p75, 0)::NUMERIC, 0),
        'ticket_amostra', ticket_amostra) ORDER BY c DESC), '[]'::JSON) INTO v_por_faixa
    FROM (SELECT faixa, COUNT(*) AS c, COUNT(*) FILTER (WHERE fechou) AS f,
                 AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_medio,
                 PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p25,
                 PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p75,
                 COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_amostra
            FROM _ww_ql WHERE faixa IS NOT NULL GROUP BY faixa HAVING COUNT(*) >= v_min) g;

    SELECT COALESCE(json_agg(json_build_object(
        'categoria', conv_bucket, 'entraram', c, 'fecharam', f,
        'taxa_pct', CASE WHEN c > 0 THEN ROUND(100.0 * f / c, 1) END,
        'ticket_medio', ROUND(COALESCE(ticket_medio,0)::NUMERIC, 0),
        'ticket_p25', ROUND(COALESCE(p25,0)::NUMERIC, 0),
        'ticket_p75', ROUND(COALESCE(p75,0)::NUMERIC, 0),
        'ticket_amostra', ticket_amostra) ORDER BY c DESC), '[]'::JSON) INTO v_por_convidados
    FROM (SELECT conv_bucket, COUNT(*) AS c, COUNT(*) FILTER (WHERE fechou) AS f,
                 AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_medio,
                 PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p25,
                 PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS p75,
                 COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket_amostra
            FROM _ww_ql WHERE conv_bucket IS NOT NULL GROUP BY conv_bucket HAVING COUNT(*) >= v_min) g;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'min_amostra', v_min,
        'total_entraram', v_total_entraram, 'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
        'cobertura', v_cob,
        'por_faixa', v_por_faixa,
        'por_destino', '[]'::JSON,
        'por_convidados', v_por_convidados,
        'outros_amostra_pequena', NULL,
        'heatmap_faixa_destino', '[]'::JSON,
        'cruzamentos', NULL,
        'evolucao_mensal_por_faixa', NULL,
        'comparacao_entrada_vs_fechamento', NULL,
        'fonte_marcos', 'ww_ac_deal_funnel_cache (universo AC)'
    );
END $$;

-- ── ww2_loss_reasons ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ww2_loss_reasons(
    p_date_start timestamp with time zone DEFAULT (now() - '90 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_date_mode text DEFAULT 'cohort',
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_faixas text[] DEFAULT NULL,
    p_destinos text[] DEFAULT NULL,
    p_tipos text[] DEFAULT NULL,
    p_consultor_ids uuid[] DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_sdr JSON; v_closer JSON; v_motivo_faixa JSON; v_tendencia JSON;
BEGIN
    CREATE TEMP TABLE _ww2_l ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.motivo_perda_sdr_raw AS motivo_sdr,
           c.motivo_perda_closer_raw AS motivo_closer,
           _ww_ac_faixa_from_valor(c.real_orcamento_parsed) AS faixa,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem
      FROM ww_ac_deal_funnel_cache c
     WHERE c.is_ww
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_l WHERE origem != ALL(p_origins); END IF;
    IF p_faixas  IS NOT NULL THEN DELETE FROM _ww2_l WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;

    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_sdr
    FROM (SELECT motivo_sdr AS motivo, COUNT(*) AS qtd FROM _ww2_l WHERE motivo_sdr IS NOT NULL GROUP BY motivo_sdr ORDER BY COUNT(*) DESC LIMIT 12) x;

    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_closer
    FROM (SELECT motivo_closer AS motivo, COUNT(*) AS qtd FROM _ww2_l WHERE motivo_closer IS NOT NULL GROUP BY motivo_closer ORDER BY COUNT(*) DESC LIMIT 12) x;

    SELECT json_agg(json_build_object('motivo', motivo, 'faixa', faixa, 'qtd', qtd)) INTO v_motivo_faixa
    FROM (SELECT motivo_closer AS motivo, faixa, COUNT(*) AS qtd
          FROM _ww2_l WHERE motivo_closer IS NOT NULL AND faixa IS NOT NULL
          GROUP BY motivo_closer, faixa ORDER BY COUNT(*) DESC LIMIT 40) x;

    WITH top_motivos AS (
        SELECT motivo_closer AS motivo FROM _ww2_l WHERE motivo_closer IS NOT NULL
        GROUP BY motivo_closer ORDER BY COUNT(*) DESC LIMIT 5
    )
    SELECT json_agg(json_build_object('mes', mes, 'motivo', motivo, 'qtd', qtd) ORDER BY mes, qtd DESC) INTO v_tendencia
    FROM (SELECT TO_CHAR(DATE_TRUNC('month', l.entrada_at), 'YYYY-MM') AS mes,
                 l.motivo_closer AS motivo, COUNT(*) AS qtd
          FROM _ww2_l l
         WHERE l.motivo_closer IN (SELECT motivo FROM top_motivos)
         GROUP BY DATE_TRUNC('month', l.entrada_at), l.motivo_closer) x;

    DROP TABLE _ww2_l;
    RETURN json_build_object(
        'motivos_sdr', COALESCE(v_sdr, '[]'::JSON),
        'motivos_closer', COALESCE(v_closer, '[]'::JSON),
        'motivo_faixa', COALESCE(v_motivo_faixa, '[]'::JSON),
        'tendencia', COALESCE(v_tendencia, '[]'::JSON),
        'fonte', 'ww_ac_deal_funnel_cache (universo AC)'
    );
END $$;

-- ── ww2_marketing ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ww2_marketing(
    p_date_start timestamp with time zone DEFAULT (now() - '30 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_date_mode text DEFAULT 'cohort',
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_faixas text[] DEFAULT NULL,
    p_destinos text[] DEFAULT NULL,
    p_tipos text[] DEFAULT NULL,
    p_consultor_ids uuid[] DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_por_origem JSON; v_por_campaign JSON; v_por_medium JSON; v_funil_origem JSON;
BEGIN
    CREATE TEMP TABLE _ww2_m ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           c.sdr_agendou_at AS qualif_at,
           c.real_orcamento_parsed AS valor_pac,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           COALESCE(NULLIF(c.utm_campaign, ''), 'Desconhecida') AS campaign,
           COALESCE(NULLIF(c.utm_medium, ''), 'Desconhecido') AS medium,
           _ww_ac_faixa_from_valor(c.real_orcamento_parsed) AS faixa,
           (c.ganho_at IS NOT NULL) AS fechado
      FROM ww_ac_deal_funnel_cache c
     WHERE c.is_ww
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end;

    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_m WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;

    SELECT json_agg(json_build_object(
        'origem', origem, 'leads', leads, 'qualificados', qualif, 'fechados', fechados,
        'taxa_qualif', taxa_q, 'taxa_fechamento', taxa_f, 'ticket_medio', ticket,
        'tempo_qualif_medio_dias', tempo_q
    ) ORDER BY leads DESC) INTO v_por_origem
    FROM (SELECT origem,
                 COUNT(*) AS leads,
                 COUNT(*) FILTER (WHERE qualif_at IS NOT NULL) AS qualif,
                 COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE qualif_at IS NOT NULL)/COUNT(*),1) ELSE 0 END AS taxa_q,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa_f,
                 ROUND(COALESCE(AVG(valor_pac) FILTER (WHERE fechado AND valor_pac>0), 0)::NUMERIC, 0) AS ticket,
                 ROUND(AVG(EXTRACT(EPOCH FROM (qualif_at - entrada_at))/86400) FILTER (WHERE qualif_at IS NOT NULL AND qualif_at >= entrada_at)::NUMERIC, 1) AS tempo_q
          FROM _ww2_m
         WHERE (p_origins IS NULL OR origem = ANY(p_origins))
         GROUP BY origem) x;

    SELECT json_agg(json_build_object('campaign', campaign, 'leads', leads, 'fechados', fechados, 'taxa', taxa) ORDER BY leads DESC) INTO v_por_campaign
    FROM (SELECT campaign, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa
          FROM _ww2_m WHERE campaign != 'Desconhecida' GROUP BY campaign ORDER BY COUNT(*) DESC LIMIT 15) x;

    SELECT json_agg(json_build_object('medium', medium, 'leads', leads, 'fechados', fechados) ORDER BY leads DESC) INTO v_por_medium
    FROM (SELECT medium, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados
          FROM _ww2_m WHERE medium != 'Desconhecido' GROUP BY medium ORDER BY COUNT(*) DESC LIMIT 10) x;

    SELECT json_agg(json_build_object('origem', origem, 'novo', novo, 'qualificado', qualif, 'fechado', fechado)) INTO v_funil_origem
    FROM (SELECT origem,
                 COUNT(*) AS novo,
                 COUNT(*) FILTER (WHERE qualif_at IS NOT NULL) AS qualif,
                 COUNT(*) FILTER (WHERE fechado) AS fechado
          FROM _ww2_m GROUP BY origem ORDER BY COUNT(*) DESC LIMIT 5) x;

    DROP TABLE _ww2_m;
    RETURN json_build_object(
        'por_origem', COALESCE(v_por_origem, '[]'::JSON),
        'por_campaign', COALESCE(v_por_campaign, '[]'::JSON),
        'por_medium', COALESCE(v_por_medium, '[]'::JSON),
        'funil_origem', COALESCE(v_funil_origem, '[]'::JSON),
        'fonte', 'ww_ac_deal_funnel_cache (universo AC)'
    );
END $$;

-- ── ww_marketing_qualidade ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.ww_marketing_qualidade(timestamptz, timestamptz, uuid, text[], integer, text);

CREATE OR REPLACE FUNCTION public.ww_marketing_qualidade(
    p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_min_amostra integer DEFAULT 2,
    p_date_mode text DEFAULT 'cohort'
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_total_leads INT := 0;
    v_total_fechados INT := 0;
    v_taxa_geral NUMERIC;
    v_por_origem JSON; v_por_campaign JSON; v_dropoff_por_origem JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 2));
BEGIN
    CREATE TEMP TABLE _ww_mq ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           NULLIF(c.utm_medium, '')   AS utm_medium,
           NULLIF(c.utm_campaign, '') AS utm_campaign,
           (c.ganho_at IS NOT NULL) AS fechou,
           (c.sdr_agendou_at IS NOT NULL) AS marcou_sdr,
           (c.closer_agendou_at IS NOT NULL) AS marcou_closer,
           c.sdr_fez AS fez_sdr,
           c.closer_fez AS fez_closer,
           c.real_orcamento_parsed AS valor_pac
      FROM ww_ac_deal_funnel_cache c
     WHERE c.is_ww
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
       AND CASE
         WHEN p_date_mode = 'throughput' THEN c.ganho_at BETWEEN p_date_start AND p_date_end
         ELSE COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end
       END;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_mq WHERE origem != ALL(p_origins); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_leads, v_total_fechados FROM _ww_mq;
    v_taxa_geral := CASE WHEN v_total_leads > 0 THEN 100.0 * v_total_fechados / v_total_leads END;

    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'leads_total', leads, 'qualificados', qualif, 'fechados', fechados,
      'taxa_qualif_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * qualif / leads, 1) END,
      'taxa_fechamento_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * fechados / leads, 1) END,
      'lift_vs_geral', CASE WHEN v_taxa_geral IS NULL OR v_taxa_geral = 0 OR leads = 0 THEN NULL
                            ELSE ROUND(((100.0 * fechados / leads) / v_taxa_geral)::numeric, 2) END,
      'ticket_medio', ROUND(ticket::NUMERIC, 0),
      'pct_email_valido', NULL,
      'pct_tel_valido', NULL
    ) ORDER BY leads DESC), '[]'::JSON) INTO v_por_origem
    FROM (SELECT origem, COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE fez_sdr OR fechou) AS qualif,
             COUNT(*) FILTER (WHERE fechou) AS fechados,
             AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket
        FROM _ww_mq WHERE origem IS NOT NULL GROUP BY origem HAVING COUNT(*) >= v_min) g;

    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'campaign', campaign, 'medium', medium,
      'leads', leads, 'qualif', qualif, 'fechou', fechou,
      'taxa_qualif_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * qualif / leads, 1) END,
      'taxa_fech_pct',   CASE WHEN leads > 0 THEN ROUND(100.0 * fechou / leads, 1) END,
      'lift_vs_geral', CASE WHEN v_taxa_geral IS NULL OR v_taxa_geral = 0 OR leads = 0 THEN NULL
                            ELSE ROUND(((100.0 * fechou / leads) / v_taxa_geral)::numeric, 2) END,
      'ticket_medio', ROUND(ticket::NUMERIC, 0)
    ) ORDER BY leads DESC), '[]'::JSON) INTO v_por_campaign
    FROM (SELECT origem, COALESCE(utm_campaign, '(sem campanha)') AS campaign,
             COALESCE(utm_medium, '(sem medium)') AS medium,
             COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE fez_sdr OR fechou) AS qualif,
             COUNT(*) FILTER (WHERE fechou) AS fechou,
             AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket
        FROM _ww_mq WHERE origem IS NOT NULL AND utm_campaign IS NOT NULL
        GROUP BY origem, utm_campaign, utm_medium HAVING COUNT(*) >= v_min) g;

    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'entrada', entrada,
      'sdr', sdr_count, 'closer', closer_count, 'pos_venda', pos_count, 'fechado', fechado_count,
      'drop_entrada_sdr', CASE WHEN entrada > 0 THEN ROUND(100.0 * (entrada - sdr_count) / entrada, 1) END,
      'drop_sdr_closer',  CASE WHEN sdr_count > 0 THEN ROUND(100.0 * (sdr_count - closer_count) / sdr_count, 1) END,
      'drop_closer_fechado', CASE WHEN closer_count > 0 THEN ROUND(100.0 * (closer_count - fechado_count) / closer_count, 1) END
    ) ORDER BY entrada DESC), '[]'::JSON) INTO v_dropoff_por_origem
    FROM (SELECT origem,
             COUNT(*) AS entrada,
             COUNT(*) FILTER (WHERE marcou_sdr OR fechou) AS sdr_count,
             COUNT(*) FILTER (WHERE marcou_closer OR fechou) AS closer_count,
             COUNT(*) FILTER (WHERE fez_closer OR fechou) AS pos_count,
             COUNT(*) FILTER (WHERE fechou) AS fechado_count
        FROM _ww_mq WHERE origem IS NOT NULL GROUP BY origem HAVING COUNT(*) >= v_min) g;

    DROP TABLE _ww_mq;
    RETURN json_build_object(
      'date_start', p_date_start, 'date_end', p_date_end,
      'date_mode', p_date_mode, 'org_id', p_org_id,
      'total_leads', v_total_leads, 'total_fechados', v_total_fechados,
      'taxa_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
      'por_origem', v_por_origem, 'por_campaign', v_por_campaign,
      'dropoff_por_origem', v_dropoff_por_origem,
      'fonte_marcos', 'ww_ac_deal_funnel_cache (universo AC)'
    );
END $$;
