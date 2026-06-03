-- 20260603g — Tornar p_tipos REAL nas RPCs cache-direto (Qualidade, Perdas, Marketing)
--
-- POR QUÊ: ww_qualidade_lead, ww2_loss_reasons, ww2_marketing e ww_marketing_qualidade lêem
-- ww_ac_deal_funnel_cache direto e ACEITAVAM p_tipos como NO-OP (o filtro DW×Elopement aparecia
-- na UI e não filtrava nada). O cache já tem is_elopement_pipeline + tipo_casamento, então dá pra
-- classificar e filtrar de verdade.
--
-- O QUE FAZ:
--   1) Helper _ww_tipo_combinado(is_elo, raw) — regra canônica única (esteira 12 OU campo 'elop')
--      → token 'Elopement'/'DW'. Mesma regra da vw_ww_funnel_base (20260603f).
--   2) Cada RPC ganha `tipo` no pool + `DELETE ... WHERE tipo != ALL(p_tipos)`.
--   3) ww_marketing_qualidade ganha o parâmetro p_tipos (não existia).
--
-- REBASE (TOP 5 #5): corpos reproduzidos das versões VIVAS — qualidade=20260530f (consolidada),
-- loss/marketing=20260530c. Essas já documentam "CORREÇÕES PRESERVADAS" das anteriores
-- (20260525e/20260526g/20260527u/20260527x/20260528x). Mudança é PURAMENTE ADITIVA (coluna tipo +
-- filtro p_tipos); nada das versões vivas foi removido. Uso DROP+CREATE (não OR REPLACE), igual à
-- 20260603e, por ser recriação revisada.

-- ───────────────────────── helper canônico ─────────────────────────
CREATE OR REPLACE FUNCTION public._ww_tipo_combinado(p_is_elo BOOLEAN, p_tipo_raw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE(p_is_elo, FALSE) OR p_tipo_raw ILIKE '%elop%' THEN 'Elopement'
    ELSE 'DW'
  END
$$;
COMMENT ON FUNCTION public._ww_tipo_combinado(BOOLEAN, TEXT) IS
  'Classificacao canonica DW x Elopement (regra combinada: esteira 12 OU campo declarado). Aplicar so em linhas is_ww. Token Elopement/DW.';

-- ═══════════════════════ 1) ww_qualidade_lead (base 20260530f) ═══════════════════════
DROP FUNCTION IF EXISTS public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer);

CREATE FUNCTION public.ww_qualidade_lead(
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
    v_acc_labels TEXT[]; v_acc_e INT; v_acc_f INT; v_acc_v NUMERIC[];
    v_out JSONB[]; r RECORD;
BEGIN
    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           _ww_ac_faixa_from_valor(c.real_orcamento_parsed) AS faixa,
           _ww_ac_convidados_bucket(c.real_convidados_parsed) AS conv_bucket,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo,
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
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ql WHERE tipo != ALL(p_tipos); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;
    v_taxa_geral := CASE WHEN v_total_entraram > 0 THEN 100.0 * v_total_fecharam / v_total_entraram END;

    SELECT json_build_object(
        'com_faixa', COUNT(*) FILTER (WHERE faixa IS NOT NULL),
        'com_destino', 0,
        'com_convidados', COUNT(*) FILTER (WHERE conv_bucket IS NOT NULL)
    ) INTO v_cob FROM _ww_ql;

    -- ── por_faixa: merge dinâmico ──
    v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
    v_out := ARRAY[]::JSONB[];
    FOR r IN
        SELECT faixa,
            CASE faixa
                WHEN 'Até R$50 mil' THEN 1 WHEN 'R$50-80 mil' THEN 2 WHEN 'R$80-100 mil' THEN 3
                WHEN 'R$100-200 mil' THEN 4 WHEN 'R$200-500 mil' THEN 5 WHEN 'Mais de R$500 mil' THEN 6 ELSE 99
            END AS ordem,
            COUNT(*)::INT AS entraram, COUNT(*) FILTER (WHERE fechou)::INT AS fecharam,
            COALESCE(array_remove(array_agg(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000), NULL), ARRAY[]::NUMERIC[]) AS valores
        FROM _ww_ql WHERE faixa IS NOT NULL GROUP BY faixa ORDER BY ordem
    LOOP
        v_acc_labels := v_acc_labels || r.faixa; v_acc_e := v_acc_e + r.entraram; v_acc_f := v_acc_f + r.fecharam; v_acc_v := v_acc_v || r.valores;
        IF v_acc_e >= v_min THEN
            v_out := v_out || jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v));
            v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
        END IF;
    END LOOP;
    IF v_acc_e > 0 THEN
        IF array_length(v_out, 1) IS NULL THEN
            v_out := ARRAY[jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v))];
        ELSE
            v_out[array_length(v_out, 1)] := jsonb_build_object(
                'labels', (v_out[array_length(v_out, 1)]->'labels') || to_jsonb(v_acc_labels),
                'entraram', (v_out[array_length(v_out, 1)]->>'entraram')::int + v_acc_e,
                'fecharam', (v_out[array_length(v_out, 1)]->>'fecharam')::int + v_acc_f,
                'valores',  (v_out[array_length(v_out, 1)]->'valores') || to_jsonb(v_acc_v));
        END IF;
    END IF;
    SELECT COALESCE(json_agg(json_build_object(
        'categoria', _ww_ac_join_faixa_labels(ARRAY(SELECT jsonb_array_elements_text(m->'labels'))),
        'entraram', (m->>'entraram')::int, 'fecharam', (m->>'fecharam')::int,
        'taxa_pct', CASE WHEN (m->>'entraram')::int > 0 THEN ROUND(100.0 * (m->>'fecharam')::numeric / (m->>'entraram')::numeric, 1) END,
        'ticket_medio', ROUND(COALESCE(_ww_ac_arr_avg(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x)), 0)::numeric, 0),
        'ticket_p25', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.25), 0)::numeric, 0),
        'ticket_p75', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.75), 0)::numeric, 0),
        'ticket_amostra', jsonb_array_length(m->'valores')
    ) ORDER BY (m->>'entraram')::int DESC), '[]'::json) INTO v_por_faixa FROM unnest(v_out) m;

    -- ── por_convidados: mesma lógica ──
    v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
    v_out := ARRAY[]::JSONB[];
    FOR r IN
        SELECT conv_bucket AS faixa,
            CASE conv_bucket
                WHEN 'Até 50' THEN 1 WHEN '50-100' THEN 2 WHEN '100-150' THEN 3
                WHEN '150-200' THEN 4 WHEN '200-300' THEN 5 WHEN 'Mais de 300' THEN 6 ELSE 99
            END AS ordem,
            COUNT(*)::INT AS entraram, COUNT(*) FILTER (WHERE fechou)::INT AS fecharam,
            COALESCE(array_remove(array_agg(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000), NULL), ARRAY[]::NUMERIC[]) AS valores
        FROM _ww_ql WHERE conv_bucket IS NOT NULL GROUP BY conv_bucket ORDER BY ordem
    LOOP
        v_acc_labels := v_acc_labels || r.faixa; v_acc_e := v_acc_e + r.entraram; v_acc_f := v_acc_f + r.fecharam; v_acc_v := v_acc_v || r.valores;
        IF v_acc_e >= v_min THEN
            v_out := v_out || jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v));
            v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
        END IF;
    END LOOP;
    IF v_acc_e > 0 THEN
        IF array_length(v_out, 1) IS NULL THEN
            v_out := ARRAY[jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v))];
        ELSE
            v_out[array_length(v_out, 1)] := jsonb_build_object(
                'labels', (v_out[array_length(v_out, 1)]->'labels') || to_jsonb(v_acc_labels),
                'entraram', (v_out[array_length(v_out, 1)]->>'entraram')::int + v_acc_e,
                'fecharam', (v_out[array_length(v_out, 1)]->>'fecharam')::int + v_acc_f,
                'valores',  (v_out[array_length(v_out, 1)]->'valores') || to_jsonb(v_acc_v));
        END IF;
    END IF;
    SELECT COALESCE(json_agg(json_build_object(
        'categoria', _ww_ac_join_conv_labels(ARRAY(SELECT jsonb_array_elements_text(m->'labels'))),
        'entraram', (m->>'entraram')::int, 'fecharam', (m->>'fecharam')::int,
        'taxa_pct', CASE WHEN (m->>'entraram')::int > 0 THEN ROUND(100.0 * (m->>'fecharam')::numeric / (m->>'entraram')::numeric, 1) END,
        'ticket_medio', ROUND(COALESCE(_ww_ac_arr_avg(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x)), 0)::numeric, 0),
        'ticket_p25', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.25), 0)::numeric, 0),
        'ticket_p75', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.75), 0)::numeric, 0),
        'ticket_amostra', jsonb_array_length(m->'valores')
    ) ORDER BY (m->>'entraram')::int DESC), '[]'::json) INTO v_por_convidados FROM unnest(v_out) m;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'min_amostra', v_min,
        'total_entraram', v_total_entraram, 'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
        'cobertura', v_cob, 'por_faixa', v_por_faixa, 'por_destino', '[]'::JSON,
        'por_convidados', v_por_convidados, 'outros_amostra_pequena', NULL,
        'heatmap_faixa_destino', '[]'::JSON, 'cruzamentos', NULL,
        'evolucao_mensal_por_faixa', NULL, 'comparacao_entrada_vs_fechamento', NULL,
        'fonte_marcos', 'ww_ac_deal_funnel_cache (universo AC + consolidação dinâmica + filtro tipo)'
    );
END $$;
GRANT EXECUTE ON FUNCTION public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer) TO authenticated;

-- ═══════════════════════ 2) ww2_loss_reasons (base 20260530c) ═══════════════════════
DROP FUNCTION IF EXISTS public.ww2_loss_reasons(timestamptz, timestamptz, text, uuid, text[], text[], text[], text[], uuid[]);

CREATE FUNCTION public.ww2_loss_reasons(
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
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo
      FROM ww_ac_deal_funnel_cache c
     WHERE c.is_ww
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_l WHERE origem != ALL(p_origins); END IF;
    IF p_faixas  IS NOT NULL THEN DELETE FROM _ww2_l WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_tipos   IS NOT NULL THEN DELETE FROM _ww2_l WHERE tipo != ALL(p_tipos); END IF;

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
        'fonte', 'ww_ac_deal_funnel_cache (universo AC + filtro tipo)'
    );
END $$;
GRANT EXECUTE ON FUNCTION public.ww2_loss_reasons(timestamptz, timestamptz, text, uuid, text[], text[], text[], text[], uuid[]) TO authenticated;

-- ═══════════════════════ 3) ww2_marketing (base 20260530c) ═══════════════════════
DROP FUNCTION IF EXISTS public.ww2_marketing(timestamptz, timestamptz, text, uuid, text[], text[], text[], text[], uuid[]);

CREATE FUNCTION public.ww2_marketing(
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
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo,
           (c.ganho_at IS NOT NULL) AS fechado
      FROM ww_ac_deal_funnel_cache c
     WHERE c.is_ww
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end;

    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_m WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_tipos  IS NOT NULL THEN DELETE FROM _ww2_m WHERE tipo != ALL(p_tipos); END IF;

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
        'fonte', 'ww_ac_deal_funnel_cache (universo AC + filtro tipo)'
    );
END $$;
GRANT EXECUTE ON FUNCTION public.ww2_marketing(timestamptz, timestamptz, text, uuid, text[], text[], text[], text[], uuid[]) TO authenticated;

-- ═══════════════════════ 4) ww_marketing_qualidade (base 20260530c, + p_tipos) ═══════════════════════
DROP FUNCTION IF EXISTS public.ww_marketing_qualidade(timestamptz, timestamptz, uuid, text[], integer, text);

CREATE FUNCTION public.ww_marketing_qualidade(
    p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_min_amostra integer DEFAULT 2,
    p_date_mode text DEFAULT 'cohort',
    p_tipos text[] DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_total_leads INT := 0; v_total_fechados INT := 0; v_taxa_geral NUMERIC;
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
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo,
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
    IF p_tipos   IS NOT NULL THEN DELETE FROM _ww_mq WHERE tipo != ALL(p_tipos); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_leads, v_total_fechados FROM _ww_mq;
    v_taxa_geral := CASE WHEN v_total_leads > 0 THEN 100.0 * v_total_fechados / v_total_leads END;

    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'leads_total', leads, 'qualificados', qualif, 'fechados', fechados,
      'taxa_qualif_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * qualif / leads, 1) END,
      'taxa_fechamento_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * fechados / leads, 1) END,
      'lift_vs_geral', CASE WHEN v_taxa_geral IS NULL OR v_taxa_geral = 0 OR leads = 0 THEN NULL
                            ELSE ROUND(((100.0 * fechados / leads) / v_taxa_geral)::numeric, 2) END,
      'ticket_medio', ROUND(ticket::NUMERIC, 0),
      'pct_email_valido', NULL, 'pct_tel_valido', NULL
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
      'fonte_marcos', 'ww_ac_deal_funnel_cache (universo AC + filtro tipo)'
    );
END $$;
GRANT EXECUTE ON FUNCTION public.ww_marketing_qualidade(timestamptz, timestamptz, uuid, text[], integer, text, text[]) TO authenticated;
