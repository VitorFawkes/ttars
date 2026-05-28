-- ============================================================================
-- Fix de 3 RPCs que ignoravam p_date_mode / p_date_start (cohort vs throughput)
--
-- ww_v2_drift_venda v4 — agora respeita p_date_start/end via filtro ganho_at
--   (era v3 que ignorava completamente e retornava 155 sempre)
--
-- ww2_journey v5 — adicionado case throughput
--   cohort: filtra por data_entrada (created_at do card OR fallback ganho/sdr)
--   throughput: filtra por sdr_agendou_at OR closer_agendou_at OR ganho_at no período
--
-- ww_marketing_qualidade v2 — duas mudanças:
--   1) "fechou" agora vem do cache AC (vw_ww_funnel_base.ganho) — antes lia
--      cards.produto_data->>'ww_closer_data_ganho' que era campo defasado
--   2) Adiciona p_date_mode (cohort = created_at; throughput = ganho_at)
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
    SELECT cc.contact_id AS id, cc.contato_nome AS titulo,
      fc.ac_deal_id, fc.ganho_at AS data_venda, TRUE AS fechou,
      _ww2_norm_faixa_strict(cc.entrada_invest) AS faixa_e,
      _ww2_norm_dest_strict(cc.entrada_destino) AS dest_e,
      _ww2_norm_conv_strict(cc.entrada_conv) AS conv_e,
      CASE
        WHEN fc.real_orcamento_parsed IS NULL THEN NULL
        WHEN fc.real_orcamento_parsed < 50000 THEN 'Até R$50 mil'
        WHEN fc.real_orcamento_parsed < 80000 THEN 'R$50-80 mil'
        WHEN fc.real_orcamento_parsed < 100000 THEN 'R$80-100 mil'
        WHEN fc.real_orcamento_parsed < 200000 THEN 'R$100-200 mil'
        WHEN fc.real_orcamento_parsed < 500000 THEN 'R$200-500 mil'
        ELSE '+R$500 mil'
      END AS faixa_v,
      _ww2_norm_dest_strict(cc.real_destino) AS dest_v,
      fc.real_convidados_parsed AS num_convidados_real,
      CASE
        WHEN fc.real_convidados_parsed IS NULL THEN NULL
        WHEN fc.real_convidados_parsed <= 2 THEN 'Apenas o casal'
        WHEN fc.real_convidados_parsed <= 20 THEN 'Ate 20'
        WHEN fc.real_convidados_parsed <= 50 THEN '20-50'
        WHEN fc.real_convidados_parsed <= 80 THEN '50-80'
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

    -- FIX v4: respeita p_date_start/end (drift sempre por ganho_at)
    DELETE FROM _ww_v2_dv WHERE data_venda IS NULL OR data_venda < p_date_start OR data_venda > p_date_end;

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
        'fonte_v2', 'cache antigo + novo, filtrado por ganho_at no periodo',
        'total_leads', v_total, 'total_fechados', v_total_fechados, 'total_vendas', v_total_fechados,
        'investimento', v_inv_json, 'destino', v_dest_json, 'convidados', v_conv_json,
        'breakdown_tipo', '[]'::JSON, 'vendas_lista', COALESCE(v_vendas_lista, '[]'::JSON),
        'drift_por_consultor', '[]'::JSON, 'drift_por_mes', '[]'::JSON
    );
END $func$;

-- Patch ww2_journey: pool agora considera p_date_mode
-- cohort = card criado no período (created_at = data_entrada)
-- throughput = qualquer marco (sdr_agendou, closer_agendou OR ganho) no período
CREATE OR REPLACE FUNCTION public.ww2_journey(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_faixas     TEXT[] DEFAULT NULL,
    p_destinos   TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_funil_real JSON;
    v_funil_real_por_contato JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_j ON COMMIT DROP AS
    SELECT ac_deal_id, card_id, contact_id, card_titulo,
           data_entrada AS created_at, valor_final, status_comercial,
           faixa AS faixa_entrada, destino AS destino_entrada, convidados AS convidados_entrada,
           destino_final, tipo, origem,
           marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho,
           sdr_agendou_at AS sdr_data_reuniao, closer_agendou_at AS closer_data_reuniao, ganho_at
      FROM vw_ww_funnel_base
     WHERE CASE
       WHEN p_date_mode = 'throughput' THEN
         (sdr_agendou_at BETWEEN p_date_start AND p_date_end)
         OR (closer_agendou_at BETWEEN p_date_start AND p_date_end)
         OR (ganho_at BETWEEN p_date_start AND p_date_end)
       ELSE
         data_entrada >= p_date_start AND data_entrada <= p_date_end
       END;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_j WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_j WHERE faixa_entrada IS NULL OR faixa_entrada != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_j WHERE destino_entrada IS NULL OR destino_entrada != ALL(p_destinos); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_j WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;

    -- POR DEAL
    SELECT json_agg(json_build_object('passo', passo, 'ordem', ordem, 'cards', cards,
        'pct_total', pct_total, 'pct_anterior', pct_anterior) ORDER BY ordem) INTO v_funil_real
    FROM (
        WITH counts AS (
            SELECT (SELECT COUNT(*) FROM _ww2_j) AS total,
                (SELECT COUNT(*) FROM _ww2_j WHERE marcou_sdr) AS c_marcou_sdr,
                (SELECT COUNT(*) FROM _ww2_j WHERE fez_sdr) AS c_fez_sdr,
                (SELECT COUNT(*) FROM _ww2_j WHERE marcou_closer) AS c_marcou_closer,
                (SELECT COUNT(*) FROM _ww2_j WHERE fez_closer) AS c_fez_closer,
                (SELECT COUNT(*) FROM _ww2_j WHERE ganho) AS c_ganho
        )
        SELECT '1. Entrou' AS passo, 1 AS ordem, total AS cards, 100.0 AS pct_total, NULL::NUMERIC AS pct_anterior FROM counts
        UNION ALL SELECT '2. Marcou reunião SDR', 2, c_marcou_sdr, ROUND(100.0*c_marcou_sdr/NULLIF(total,0),1), ROUND(100.0*c_marcou_sdr/NULLIF(total,0),1) FROM counts
        UNION ALL SELECT '3. Fez reunião SDR', 3, c_fez_sdr, ROUND(100.0*c_fez_sdr/NULLIF(total,0),1), ROUND(100.0*c_fez_sdr/NULLIF(c_marcou_sdr,0),1) FROM counts
        UNION ALL SELECT '4. Marcou reunião Closer', 4, c_marcou_closer, ROUND(100.0*c_marcou_closer/NULLIF(total,0),1), ROUND(100.0*c_marcou_closer/NULLIF(c_fez_sdr,0),1) FROM counts
        UNION ALL SELECT '5. Fez reunião Closer', 5, c_fez_closer, ROUND(100.0*c_fez_closer/NULLIF(total,0),1), ROUND(100.0*c_fez_closer/NULLIF(c_marcou_closer,0),1) FROM counts
        UNION ALL SELECT '6. Ganho', 6, c_ganho, ROUND(100.0*c_ganho/NULLIF(total,0),1), ROUND(100.0*c_ganho/NULLIF(c_fez_closer,0),1) FROM counts
    ) x;

    -- POR CONTATO (dedup)
    SELECT json_agg(json_build_object('passo', passo, 'ordem', ordem, 'cards', cards,
        'pct_total', pct_total, 'pct_anterior', pct_anterior) ORDER BY ordem) INTO v_funil_real_por_contato
    FROM (
        WITH dedup AS (
            SELECT COALESCE(contact_id, 'no-contact-'||ac_deal_id) AS pessoa,
                   BOOL_OR(marcou_sdr) AS marcou_sdr, BOOL_OR(fez_sdr) AS fez_sdr,
                   BOOL_OR(marcou_closer) AS marcou_closer, BOOL_OR(fez_closer) AS fez_closer,
                   BOOL_OR(ganho) AS ganho
            FROM _ww2_j GROUP BY 1
        ),
        counts AS (
            SELECT (SELECT COUNT(*) FROM dedup) AS total,
                (SELECT COUNT(*) FROM dedup WHERE marcou_sdr) AS c_marcou_sdr,
                (SELECT COUNT(*) FROM dedup WHERE fez_sdr) AS c_fez_sdr,
                (SELECT COUNT(*) FROM dedup WHERE marcou_closer) AS c_marcou_closer,
                (SELECT COUNT(*) FROM dedup WHERE fez_closer) AS c_fez_closer,
                (SELECT COUNT(*) FROM dedup WHERE ganho) AS c_ganho
        )
        SELECT '1. Entrou' AS passo, 1 AS ordem, total AS cards, 100.0 AS pct_total, NULL::NUMERIC AS pct_anterior FROM counts
        UNION ALL SELECT '2. Marcou reunião SDR', 2, c_marcou_sdr, ROUND(100.0*c_marcou_sdr/NULLIF(total,0),1), ROUND(100.0*c_marcou_sdr/NULLIF(total,0),1) FROM counts
        UNION ALL SELECT '3. Fez reunião SDR', 3, c_fez_sdr, ROUND(100.0*c_fez_sdr/NULLIF(total,0),1), ROUND(100.0*c_fez_sdr/NULLIF(c_marcou_sdr,0),1) FROM counts
        UNION ALL SELECT '4. Marcou reunião Closer', 4, c_marcou_closer, ROUND(100.0*c_marcou_closer/NULLIF(total,0),1), ROUND(100.0*c_marcou_closer/NULLIF(c_fez_sdr,0),1) FROM counts
        UNION ALL SELECT '5. Fez reunião Closer', 5, c_fez_closer, ROUND(100.0*c_fez_closer/NULLIF(total,0),1), ROUND(100.0*c_fez_closer/NULLIF(c_marcou_closer,0),1) FROM counts
        UNION ALL SELECT '6. Ganho', 6, c_ganho, ROUND(100.0*c_ganho/NULLIF(total,0),1), ROUND(100.0*c_ganho/NULLIF(c_fez_closer,0),1) FROM counts
    ) x;

    DROP TABLE _ww2_j;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'date_mode', p_date_mode,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'funil_real', COALESCE(v_funil_real, '[]'::JSON),
        'funil_real_por_contato', COALESCE(v_funil_real_por_contato, '[]'::JSON),
        'fonte_marcos', 'vw_ww_funnel_base (cache AC, v5 com date_mode)'
    );
END $func$;

-- Patch ww_marketing_qualidade:
-- 1) "fechou" agora vem do cache AC (vw_ww_funnel_base.ganho) via JOIN com external_id
-- 2) Adiciona p_date_mode (cohort = card.created_at; throughput = ganho_at no período)
DROP FUNCTION IF EXISTS public.ww_marketing_qualidade(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], INT);

CREATE FUNCTION public.ww_marketing_qualidade(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_min_amostra INT DEFAULT 2,
    p_date_mode  TEXT DEFAULT 'cohort'
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total_leads INT := 0;
    v_total_fechados INT := 0;
    v_taxa_geral NUMERIC;
    v_por_origem JSON;
    v_por_campaign JSON;
    v_dropoff_por_origem JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 2));
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww_mq ON COMMIT DROP AS
    SELECT c.id, c.created_at,
           _ww2_norm_origem(c.marketing_data) AS origem,
           COALESCE(NULLIF(c.marketing_data->>'utm_medium',''), NULLIF(c.marketing_data->'card'->>'utm_medium','')) AS utm_medium,
           COALESCE(NULLIF(c.marketing_data->>'utm_campaign',''), NULLIF(c.marketing_data->'card'->>'utm_campaign','')) AS utm_campaign,
           -- FECHOU vem do cache AC (canônico)
           COALESCE(m.ganho, FALSE) AS fechou,
           m.ganho_at,
           m.fez_sdr, m.fez_closer, m.marcou_sdr, m.marcou_closer,
           cc.real_valor_assess AS valor_pac,
           ph.slug AS phase_slug,
           c.pessoa_principal_id, co.email AS contato_email, co.telefone AS contato_telefone
      FROM cards c
      LEFT JOIN vw_ww_funnel_base m ON m.card_id = c.id
      LEFT JOIN ww_v2_casamentos_cache cc ON cc.contact_id = c.external_id
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
      LEFT JOIN contatos co ON co.id = c.pessoa_principal_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND CASE
         WHEN p_date_mode = 'throughput' THEN (m.ganho_at BETWEEN p_date_start AND p_date_end)
         ELSE (c.created_at >= p_date_start AND c.created_at <= p_date_end)
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
      'pct_email_valido', CASE WHEN leads > 0 THEN ROUND(100.0 * com_email / leads, 1) END,
      'pct_tel_valido',   CASE WHEN leads > 0 THEN ROUND(100.0 * com_tel / leads, 1) END
    ) ORDER BY leads DESC), '[]'::JSON) INTO v_por_origem
    FROM (
      SELECT origem, COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE fez_sdr OR fechou) AS qualif,
             COUNT(*) FILTER (WHERE fechou) AS fechados,
             AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket,
             COUNT(*) FILTER (WHERE contato_email IS NOT NULL AND contato_email ~ '@') AS com_email,
             COUNT(*) FILTER (WHERE contato_telefone IS NOT NULL AND length(regexp_replace(contato_telefone,'[^0-9]','','g')) >= 10) AS com_tel
        FROM _ww_mq WHERE origem IS NOT NULL GROUP BY origem HAVING COUNT(*) >= v_min
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'campaign', campaign, 'medium', medium,
      'leads', leads, 'qualif', qualif, 'fechou', fechou,
      'taxa_qualif_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * qualif / leads, 1) END,
      'taxa_fech_pct',   CASE WHEN leads > 0 THEN ROUND(100.0 * fechou / leads, 1) END,
      'lift_vs_geral', CASE WHEN v_taxa_geral IS NULL OR v_taxa_geral = 0 OR leads = 0 THEN NULL
                            ELSE ROUND(((100.0 * fechou / leads) / v_taxa_geral)::numeric, 2) END,
      'ticket_medio', ROUND(ticket::NUMERIC, 0)
    ) ORDER BY leads DESC), '[]'::JSON) INTO v_por_campaign
    FROM (
      SELECT origem, COALESCE(utm_campaign, '(sem campanha)') AS campaign,
             COALESCE(utm_medium, '(sem medium)') AS medium,
             COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE fez_sdr OR fechou) AS qualif,
             COUNT(*) FILTER (WHERE fechou) AS fechou,
             AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket
        FROM _ww_mq WHERE origem IS NOT NULL AND utm_campaign IS NOT NULL
        GROUP BY origem, utm_campaign, utm_medium HAVING COUNT(*) >= v_min
    ) g;

    -- Dropoff por origem usando marcos canônicos AC
    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'entrada', entrada,
      'sdr', sdr_count, 'closer', closer_count, 'pos_venda', pos_count, 'fechado', fechado_count,
      'drop_entrada_sdr', CASE WHEN entrada > 0 THEN ROUND(100.0 * (entrada - sdr_count) / entrada, 1) END,
      'drop_sdr_closer',  CASE WHEN sdr_count > 0 THEN ROUND(100.0 * (sdr_count - closer_count) / sdr_count, 1) END,
      'drop_closer_fechado', CASE WHEN closer_count > 0 THEN ROUND(100.0 * (closer_count - fechado_count) / closer_count, 1) END
    ) ORDER BY entrada DESC), '[]'::JSON) INTO v_dropoff_por_origem
    FROM (
      SELECT origem,
             COUNT(*) AS entrada,
             COUNT(*) FILTER (WHERE marcou_sdr OR fechou) AS sdr_count,
             COUNT(*) FILTER (WHERE marcou_closer OR fechou) AS closer_count,
             COUNT(*) FILTER (WHERE fez_closer OR fechou) AS pos_count,
             COUNT(*) FILTER (WHERE fechou) AS fechado_count
        FROM _ww_mq WHERE origem IS NOT NULL GROUP BY origem HAVING COUNT(*) >= v_min
    ) g;

    DROP TABLE _ww_mq;

    RETURN json_build_object(
      'date_start', p_date_start, 'date_end', p_date_end,
      'date_mode', p_date_mode,
      'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
      'total_leads', v_total_leads, 'total_fechados', v_total_fechados,
      'taxa_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
      'por_origem', v_por_origem, 'por_campaign', v_por_campaign,
      'dropoff_por_origem', v_dropoff_por_origem,
      'fonte_marcos', 'vw_ww_funnel_base (cache AC)'
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_marketing_qualidade(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], INT, TEXT) TO authenticated;
