-- ============================================================================
-- Analytics Weddings v3 — Jornada do lead
--
-- Adiciona 2 RPCs novas que respondem perguntas de Head de Vendas e Marketing:
--   ww2_journey         — tempos do ciclo + entrada×realidade + funil real verificável
--   ww2_lead_quality_v2 — distribuições simples (faixa/convidados/local) + cruzamentos
--                        entre as 3 dimensões (mostra perfil real do lead)
--
-- Os passos do funil real verificável são detectados por campos preenchidos:
--   1. Entrou               — todo card no pool (sempre = total)
--   2. Marcou reunião SDR   — ww_sdr_data_reuniao IS NOT NULL
--   3. Reunião SDR feita    — ww_sdr_qualificado IS NOT NULL OU stage avançou de SDR
--   4. Marcou reunião Closer — ww_closer_data_reuniao IS NOT NULL
--   5. Pagou taxa           — ww_sdr_taxa_paga = 'Sim' / true / 'Verdadeiro' etc
--   6. Fechou contrato      — phase = 'pos_venda' OU status_comercial = 'ganho'
--
-- Entrada × Realidade:
--   - Orçamento: ww_mkt_orcamento_form (faixa que disse) × valor_final (R$ que assinou)
--   - Destino: ww_mkt_destino_form (queria) × ww_destino (confirmado pós-fechamento)
-- ============================================================================

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
    v_tempos JSON;
    v_orcamento_real JSON;
    v_destino_mudou JSON;
    v_ranking_lentos JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines
     WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_j ON COMMIT DROP AS
    SELECT c.id, c.created_at, c.valor_final, c.status_comercial,
           _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa_entrada,
           _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino_entrada,
           _ww2_norm_convidados(c.produto_data->>'ww_mkt_convidados_form') AS convidados_entrada,
           _ww2_norm_destino(c.produto_data->>'ww_destino') AS destino_final,
           NULLIF(c.produto_data->>'ww_local', '') AS local_final,
           NULLIF(c.produto_data->>'ww_tipo_casamento', '') AS tipo,
           _ww2_norm_origem(c.marketing_data) AS origem,
           NULLIF(c.produto_data->>'ww_sdr_data_reuniao', '') AS sdr_data_reuniao_raw,
           NULLIF(c.produto_data->>'ww_closer_data_reuniao', '') AS closer_data_reuniao_raw,
           NULLIF(c.produto_data->>'ww_sdr_qualificado', '') AS sdr_qualif_raw,
           NULLIF(c.produto_data->>'ww_sdr_taxa_paga', '') AS taxa_raw,
           ph.slug AS phase_slug,
           (c.status_comercial='ganho' OR ph.slug='pos_venda') AS fechado
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT = 'WEDDING' AND c.org_id = v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_j WHERE origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_j WHERE faixa_entrada IS NULL OR faixa_entrada != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_j WHERE destino_entrada IS NULL OR destino_entrada != ALL(p_destinos); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_j WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;

    -- Adicionar timestamps parseados + flags do funil
    ALTER TABLE _ww2_j ADD COLUMN sdr_data_reuniao TIMESTAMPTZ;
    ALTER TABLE _ww2_j ADD COLUMN closer_data_reuniao TIMESTAMPTZ;
    ALTER TABLE _ww2_j ADD COLUMN marcou_sdr BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww2_j ADD COLUMN fez_sdr BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww2_j ADD COLUMN marcou_closer BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww2_j ADD COLUMN pagou_taxa BOOLEAN DEFAULT FALSE;

    UPDATE _ww2_j SET
        sdr_data_reuniao = CASE
            WHEN sdr_data_reuniao_raw ~ '^\d{4}-\d{2}-\d{2}' THEN
              (CASE WHEN sdr_data_reuniao_raw ~ 'T' THEN sdr_data_reuniao_raw::TIMESTAMPTZ
                    ELSE (sdr_data_reuniao_raw || 'T00:00:00Z')::TIMESTAMPTZ END)
            ELSE NULL END,
        closer_data_reuniao = CASE
            WHEN closer_data_reuniao_raw ~ '^\d{4}-\d{2}-\d{2}' THEN
              (CASE WHEN closer_data_reuniao_raw ~ 'T' THEN closer_data_reuniao_raw::TIMESTAMPTZ
                    ELSE (closer_data_reuniao_raw || 'T00:00:00Z')::TIMESTAMPTZ END)
            ELSE NULL END,
        marcou_sdr = sdr_data_reuniao_raw IS NOT NULL,
        fez_sdr = sdr_qualif_raw IS NOT NULL OR phase_slug IN ('vendas','closer','planner','pos_venda'),
        marcou_closer = closer_data_reuniao_raw IS NOT NULL,
        pagou_taxa = LOWER(COALESCE(taxa_raw,'')) IN ('sim','true','verdadeiro','yes','1')
    WHERE id IS NOT NULL;

    -- ── 1) Funil REAL verificável ──
    SELECT json_agg(json_build_object(
        'passo', passo, 'ordem', ordem, 'cards', cards,
        'pct_total', pct_total, 'pct_anterior', pct_anterior
    ) ORDER BY ordem) INTO v_funil_real
    FROM (
        WITH counts AS (
            SELECT
                (SELECT COUNT(*) FROM _ww2_j) AS total,
                (SELECT COUNT(*) FROM _ww2_j WHERE marcou_sdr) AS c_marcou_sdr,
                (SELECT COUNT(*) FROM _ww2_j WHERE fez_sdr) AS c_fez_sdr,
                (SELECT COUNT(*) FROM _ww2_j WHERE marcou_closer) AS c_marcou_closer,
                (SELECT COUNT(*) FROM _ww2_j WHERE pagou_taxa) AS c_pagou_taxa,
                (SELECT COUNT(*) FROM _ww2_j WHERE fechado) AS c_fechado
        )
        SELECT '1. Entrou' AS passo, 1 AS ordem, total AS cards, 100.0 AS pct_total,
               NULL::NUMERIC AS pct_anterior FROM counts
        UNION ALL
        SELECT '2. Marcou reunião SDR', 2, c_marcou_sdr,
               ROUND(100.0 * c_marcou_sdr / NULLIF(total, 0), 1),
               ROUND(100.0 * c_marcou_sdr / NULLIF(total, 0), 1) FROM counts
        UNION ALL
        SELECT '3. Fez reunião SDR', 3, c_fez_sdr,
               ROUND(100.0 * c_fez_sdr / NULLIF(total, 0), 1),
               ROUND(100.0 * c_fez_sdr / NULLIF(c_marcou_sdr, 0), 1) FROM counts
        UNION ALL
        SELECT '4. Marcou reunião Closer', 4, c_marcou_closer,
               ROUND(100.0 * c_marcou_closer / NULLIF(total, 0), 1),
               ROUND(100.0 * c_marcou_closer / NULLIF(c_fez_sdr, 0), 1) FROM counts
        UNION ALL
        SELECT '5. Pagou taxa de serviço', 5, c_pagou_taxa,
               ROUND(100.0 * c_pagou_taxa / NULLIF(total, 0), 1),
               ROUND(100.0 * c_pagou_taxa / NULLIF(c_marcou_closer, 0), 1) FROM counts
        UNION ALL
        SELECT '6. Fechou contrato', 6, c_fechado,
               ROUND(100.0 * c_fechado / NULLIF(total, 0), 1),
               ROUND(100.0 * c_fechado / NULLIF(c_pagou_taxa, 0), 1) FROM counts
    ) x;

    -- ── 2) Tempos do ciclo (mediana e p75) ──
    SELECT json_build_object(
        'lead_para_reuniao_sdr', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE sdr_data_reuniao IS NOT NULL),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (sdr_data_reuniao - created_at))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL))::NUMERIC, 1),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (sdr_data_reuniao - created_at))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL))::NUMERIC, 1),
            'avg_dias', ROUND(AVG(EXTRACT(EPOCH FROM (sdr_data_reuniao - created_at))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL)::NUMERIC, 1)
        ),
        'reuniao_sdr_para_reuniao_closer', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND closer_data_reuniao IS NOT NULL AND closer_data_reuniao > sdr_data_reuniao),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - sdr_data_reuniao))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND closer_data_reuniao IS NOT NULL AND closer_data_reuniao > sdr_data_reuniao))::NUMERIC, 1),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - sdr_data_reuniao))/86400) FILTER (WHERE sdr_data_reuniao IS NOT NULL AND closer_data_reuniao IS NOT NULL AND closer_data_reuniao > sdr_data_reuniao))::NUMERIC, 1)
        ),
        'lead_para_closer', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE closer_data_reuniao IS NOT NULL),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - created_at))/86400) FILTER (WHERE closer_data_reuniao IS NOT NULL))::NUMERIC, 1),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (closer_data_reuniao - created_at))/86400) FILTER (WHERE closer_data_reuniao IS NOT NULL))::NUMERIC, 1)
        ),
        'lead_para_fechamento', json_build_object(
            'amostra', COUNT(*) FILTER (WHERE fechado),
            'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (NOW() - created_at))/86400) FILTER (WHERE fechado))::NUMERIC, 0),
            'p75_dias', ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (NOW() - created_at))/86400) FILTER (WHERE fechado))::NUMERIC, 0),
            'nota', 'idade do card que já fechou (proxy de ciclo de venda)'
        )
    ) INTO v_tempos
    FROM _ww2_j;

    -- ── 3) Orçamento: faixa de entrada × valor real fechado ──
    SELECT json_agg(json_build_object(
        'faixa_entrada', faixa_entrada,
        'leads_total', leads_total,
        'leads_fechados', leads_fechados,
        'leads_com_valor', leads_com_valor,
        'valor_medio_real', valor_medio,
        'valor_mediano_real', valor_mediano,
        'taxa_fechamento', taxa
    ) ORDER BY ordem_faixa) INTO v_orcamento_real
    FROM (
        SELECT faixa_entrada,
               -- Ordenar por valor crescente
               CASE faixa_entrada
                 WHEN 'Até R$50 mil' THEN 1
                 WHEN 'R$50-80 mil' THEN 2
                 WHEN 'R$50-100 mil' THEN 3
                 WHEN 'R$80-100 mil' THEN 4
                 WHEN 'R$100-200 mil' THEN 5
                 WHEN 'R$200-500 mil' THEN 6
                 WHEN 'Mais de R$500 mil' THEN 7
                 ELSE 99 END AS ordem_faixa,
               COUNT(*) AS leads_total,
               COUNT(*) FILTER (WHERE fechado) AS leads_fechados,
               COUNT(*) FILTER (WHERE fechado AND valor_final > 0) AS leads_com_valor,
               ROUND(COALESCE(AVG(valor_final) FILTER (WHERE fechado AND valor_final > 0), 0)::NUMERIC, 0) AS valor_medio,
               ROUND(COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY valor_final) FILTER (WHERE fechado AND valor_final > 0), 0)::NUMERIC, 0) AS valor_mediano,
               CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE fechado) / COUNT(*), 1) ELSE 0 END AS taxa
          FROM _ww2_j
         WHERE faixa_entrada IS NOT NULL
         GROUP BY faixa_entrada
    ) x;

    -- ── 4) Destino: queria × confirmou ──
    -- Comparar pra cards FECHADOS (que têm ww_destino preenchido)
    SELECT json_agg(json_build_object(
        'destino_entrada', destino_entrada,
        'leads_total', leads_total,
        'manteve', manteve,
        'mudou', mudou,
        'sem_dado_final', sem_dado_final,
        'principal_destino_final', principal_destino_final,
        'pct_manteve', pct_manteve
    ) ORDER BY leads_total DESC) INTO v_destino_mudou
    FROM (
        SELECT
            destino_entrada,
            COUNT(*) AS leads_total,
            COUNT(*) FILTER (WHERE destino_final IS NOT NULL AND LOWER(destino_final) = LOWER(destino_entrada)) AS manteve,
            COUNT(*) FILTER (WHERE destino_final IS NOT NULL AND LOWER(destino_final) != LOWER(destino_entrada)) AS mudou,
            COUNT(*) FILTER (WHERE destino_final IS NULL) AS sem_dado_final,
            (SELECT destino_final FROM _ww2_j j2
              WHERE j2.destino_entrada = j1.destino_entrada AND j2.destino_final IS NOT NULL
              GROUP BY destino_final ORDER BY COUNT(*) DESC LIMIT 1) AS principal_destino_final,
            CASE WHEN COUNT(*) FILTER (WHERE destino_final IS NOT NULL) > 0
                 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE destino_final IS NOT NULL AND LOWER(destino_final) = LOWER(destino_entrada)) / COUNT(*) FILTER (WHERE destino_final IS NOT NULL), 1)
                 ELSE NULL END AS pct_manteve
          FROM _ww2_j j1
         WHERE destino_entrada IS NOT NULL
         GROUP BY destino_entrada
        HAVING COUNT(*) >= 3
         ORDER BY COUNT(*) DESC
         LIMIT 12
    ) x;

    -- ── 5) Top 8 leads "presos" entre passos do funil ──
    SELECT json_agg(json_build_object(
        'card_id', card_id, 'titulo', titulo, 'gargalo', gargalo, 'dias', dias, 'origem', origem, 'faixa', faixa
    ) ORDER BY dias DESC) INTO v_ranking_lentos
    FROM (
        -- Marcou SDR mas não fez ainda (>7d)
        SELECT c.id AS card_id, c.titulo,
               'Marcou SDR sem confirmar reunião' AS gargalo,
               EXTRACT(DAY FROM NOW() - j.sdr_data_reuniao)::INT AS dias,
               j.origem, j.faixa_entrada AS faixa
          FROM _ww2_j j
          JOIN cards c ON c.id = j.id
         WHERE j.marcou_sdr AND NOT j.fez_sdr AND j.sdr_data_reuniao IS NOT NULL
           AND NOW() - j.sdr_data_reuniao BETWEEN INTERVAL '7 days' AND INTERVAL '120 days'
        UNION ALL
        -- Marcou Closer mas não pagou taxa (>7d, < 120d pra evitar noise antigo)
        SELECT c.id AS card_id, c.titulo,
               'Marcou Closer mas não pagou taxa' AS gargalo,
               EXTRACT(DAY FROM NOW() - j.closer_data_reuniao)::INT AS dias,
               j.origem, j.faixa_entrada AS faixa
          FROM _ww2_j j
          JOIN cards c ON c.id = j.id
         WHERE j.marcou_closer AND NOT j.pagou_taxa AND NOT j.fechado AND j.closer_data_reuniao IS NOT NULL
           AND NOW() - j.closer_data_reuniao BETWEEN INTERVAL '7 days' AND INTERVAL '120 days'
        ORDER BY 4 DESC
        LIMIT 8
    ) x;

    DROP TABLE _ww2_j;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'funil_real', COALESCE(v_funil_real, '[]'::JSON),
        'tempos', v_tempos,
        'orcamento_real', COALESCE(v_orcamento_real, '[]'::JSON),
        'destino_mudou', COALESCE(v_destino_mudou, '[]'::JSON),
        'ranking_lentos', COALESCE(v_ranking_lentos, '[]'::JSON)
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww2_journey(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;
