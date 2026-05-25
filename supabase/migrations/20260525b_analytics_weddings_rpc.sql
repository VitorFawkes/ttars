-- ============================================================================
-- Analytics Weddings — RPC única que alimenta dashboard /analytics-weddings
--
-- Retorna JSON com:
--   funnel:               leads por fase do pipeline Wedding
--   quality:              distribuição por faixa de investimento, convidados, destino
--   service:              tempo em fase, motivos de perda
--   conversao_segmento:   conversão (lead → ganho) por faixa de investimento
--   conversao_destino:    conversão por destino
--
-- Filtros:
--   p_date_start: data de criação inicial (default: -90 dias)
--   p_date_end:   data de criação final (default: agora)
--   p_org_id:     workspace (default: requesting_org_id() — Welcome Weddings)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.analytics_weddings_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_org_id UUID;
    v_pipeline_id UUID;
    v_funnel JSON;
    v_quality_faixa JSON;
    v_quality_convidados JSON;
    v_quality_destino JSON;
    v_motivos_sdr JSON;
    v_motivos_closer JSON;
    v_tempo_fase JSON;
    v_conv_faixa JSON;
    v_conv_destino JSON;
    v_kpis JSON;
    v_total_leads INT;
BEGIN
    v_org_id := COALESCE(p_org_id, requesting_org_id());

    -- Pipeline Wedding (1 por workspace)
    SELECT p.id INTO v_pipeline_id
      FROM pipelines p
     WHERE p.produto::TEXT = 'WEDDING'
       AND p.org_id = v_org_id
     LIMIT 1;

    IF v_pipeline_id IS NULL THEN
        RETURN json_build_object('error', 'Pipeline Wedding não encontrado pra org ' || v_org_id);
    END IF;

    -- Pool de leads no período (cards Wedding criados na janela)
    WITH leads_pool AS (
        SELECT c.id,
               c.created_at,
               c.pipeline_stage_id,
               c.status_comercial,
               c.valor_final,
               c.data_fechamento,
               (c.produto_data->>'ww_mkt_orcamento_form') AS faixa_raw,
               (c.produto_data->>'ww_mkt_convidados_form') AS convidados_raw,
               (c.produto_data->>'ww_mkt_destino_form') AS destino_raw,
               (c.produto_data->>'ww_motivo_perda_sdr') AS motivo_sdr,
               (c.produto_data->>'ww_motivo_perda_closer') AS motivo_closer
          FROM cards c
         WHERE c.deleted_at IS NULL
           AND c.archived_at IS NULL
           AND c.produto::TEXT = 'WEDDING'
           AND c.org_id = v_org_id
           AND c.created_at >= p_date_start
           AND c.created_at <= p_date_end
    ),
    -- Normalizar valores (remover prefixos esquisitos, lowercase)
    leads_norm AS (
        SELECT *,
               -- Faixa: normalizar capitalização e remover underscores corrompidos
               CASE
                 WHEN faixa_raw IS NULL THEN NULL
                 WHEN faixa_raw ILIKE '%menos de r$50%' OR faixa_raw ILIKE '%até%r$50%' THEN 'Até R$50 mil'
                 WHEN faixa_raw ILIKE '%r$50%80%' THEN 'R$50-80 mil'
                 WHEN faixa_raw ILIKE '%r$80%100%' THEN 'R$80-100 mil'
                 WHEN faixa_raw ILIKE '%r$50%100%' THEN 'R$50-100 mil'
                 WHEN faixa_raw ILIKE '%r$100%200%' THEN 'R$100-200 mil'
                 WHEN faixa_raw ILIKE '%r$200%500%' THEN 'R$200-500 mil'
                 WHEN faixa_raw ILIKE '%mais de r$500%' OR faixa_raw ILIKE '%acima%500%' THEN 'Mais de R$500 mil'
                 ELSE TRIM(REPLACE(faixa_raw, '_', ' '))
               END AS faixa,
               -- Convidados: buckets
               CASE
                 WHEN convidados_raw IS NULL THEN NULL
                 WHEN convidados_raw ILIKE '%apenas o casal%' OR convidados_raw ILIKE '%só o casal%' THEN 'Apenas o casal'
                 WHEN convidados_raw ILIKE '%até 20%' THEN 'Até 20'
                 WHEN convidados_raw ILIKE '%20 a 50%' OR convidados_raw ILIKE '%menos de 50%' THEN '20-50'
                 WHEN convidados_raw ILIKE '%50 a 80%' OR convidados_raw ILIKE '%50 e 100%' THEN '50-80'
                 WHEN convidados_raw ILIKE '%80 a 100%' OR convidados_raw ILIKE '%80 e 100%' THEN '80-100'
                 WHEN convidados_raw ILIKE '%acima de 100%' OR convidados_raw ILIKE '%mais de 100%' OR convidados_raw ILIKE '%+100%' THEN '+100'
                 ELSE TRIM(REPLACE(convidados_raw, '_', ' '))
               END AS convidados_bucket,
               -- Destino: limpar underscores
               CASE
                 WHEN destino_raw IS NULL THEN NULL
                 ELSE INITCAP(TRIM(REPLACE(LOWER(destino_raw), '_', ' ')))
               END AS destino,
               -- Status simplificado pra conversão
               CASE
                 WHEN status_comercial = 'ganho' THEN 'ganho'
                 WHEN status_comercial = 'perdido' THEN 'perdido'
                 ELSE 'aberto'
               END AS status_simples
          FROM leads_pool
    )

    -- 1) KPIs gerais
    SELECT json_build_object(
        'total_leads', COUNT(*),
        'leads_ganhos', COUNT(*) FILTER (WHERE status_simples = 'ganho'),
        'leads_perdidos', COUNT(*) FILTER (WHERE status_simples = 'perdido'),
        'leads_abertos', COUNT(*) FILTER (WHERE status_simples = 'aberto'),
        'taxa_conversao', CASE WHEN COUNT(*) > 0
                          THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status_simples = 'ganho') / COUNT(*), 1)
                          ELSE 0 END,
        'ticket_medio_fechado', ROUND(COALESCE(AVG(valor_final) FILTER (WHERE status_simples = 'ganho'), 0)::NUMERIC, 0),
        'receita_total_fechada', ROUND(COALESCE(SUM(valor_final) FILTER (WHERE status_simples = 'ganho'), 0)::NUMERIC, 0)
    ) INTO v_kpis
    FROM leads_norm;

    SELECT COUNT(*) INTO v_total_leads FROM leads_norm;

    -- 2) Funil: leads por fase atual
    WITH stage_counts AS (
        SELECT ph.id AS phase_id,
               ph.nome AS phase_name,
               ph.order_index AS phase_order,
               s.id AS stage_id,
               s.nome AS stage_name,
               s.ordem AS stage_order,
               COUNT(ln.id) AS leads_count
          FROM pipeline_phases ph
          JOIN pipeline_stages s ON s.phase_id = ph.id
          LEFT JOIN leads_norm ln ON ln.pipeline_stage_id = s.id
         WHERE s.pipeline_id = v_pipeline_id AND s.ativo = TRUE
         GROUP BY ph.id, ph.nome, ph.order_index, s.id, s.nome, s.ordem
    )
    SELECT json_agg(json_build_object(
        'phase_id', phase_id,
        'phase_name', phase_name,
        'phase_order', phase_order,
        'stage_id', stage_id,
        'stage_name', stage_name,
        'stage_order', stage_order,
        'leads_count', leads_count
    ) ORDER BY phase_order NULLS LAST, stage_order NULLS LAST) INTO v_funnel
    FROM stage_counts;

    -- 3) Distribuição por faixa de investimento
    WITH faixa_dist AS (
        SELECT faixa, COUNT(*) AS qtd
          FROM leads_norm
         WHERE faixa IS NOT NULL
         GROUP BY faixa
    )
    SELECT json_agg(json_build_object(
        'faixa', faixa,
        'qtd', qtd,
        'pct', ROUND(100.0 * qtd / NULLIF((SELECT SUM(qtd) FROM faixa_dist), 0), 1)
    ) ORDER BY qtd DESC) INTO v_quality_faixa
    FROM faixa_dist;

    -- 4) Distribuição por nº de convidados
    WITH conv_dist AS (
        SELECT convidados_bucket AS bucket, COUNT(*) AS qtd
          FROM leads_norm
         WHERE convidados_bucket IS NOT NULL
         GROUP BY convidados_bucket
    )
    SELECT json_agg(json_build_object(
        'bucket', bucket,
        'qtd', qtd,
        'pct', ROUND(100.0 * qtd / NULLIF((SELECT SUM(qtd) FROM conv_dist), 0), 1)
    ) ORDER BY qtd DESC) INTO v_quality_convidados
    FROM conv_dist;

    -- 5) Top destinos
    WITH dest_dist AS (
        SELECT destino, COUNT(*) AS qtd
          FROM leads_norm
         WHERE destino IS NOT NULL
         GROUP BY destino
    )
    SELECT json_agg(json_build_object(
        'destino', destino,
        'qtd', qtd,
        'pct', ROUND(100.0 * qtd / NULLIF((SELECT SUM(qtd) FROM dest_dist), 0), 1)
    ) ORDER BY qtd DESC) INTO v_quality_destino
    FROM (SELECT destino, qtd FROM dest_dist ORDER BY qtd DESC LIMIT 15) t;

    -- 6) Motivos de perda SDR
    WITH motivos AS (
        SELECT motivo_sdr AS motivo, COUNT(*) AS qtd
          FROM leads_norm
         WHERE motivo_sdr IS NOT NULL
         GROUP BY motivo_sdr
    )
    SELECT json_agg(json_build_object(
        'motivo', motivo,
        'qtd', qtd
    ) ORDER BY qtd DESC) INTO v_motivos_sdr
    FROM (SELECT motivo, qtd FROM motivos ORDER BY qtd DESC LIMIT 10) t;

    -- 7) Motivos de perda Closer
    WITH motivos AS (
        SELECT motivo_closer AS motivo, COUNT(*) AS qtd
          FROM leads_norm
         WHERE motivo_closer IS NOT NULL
         GROUP BY motivo_closer
    )
    SELECT json_agg(json_build_object(
        'motivo', motivo,
        'qtd', qtd
    ) ORDER BY qtd DESC) INTO v_motivos_closer
    FROM (SELECT motivo, qtd FROM motivos ORDER BY qtd DESC LIMIT 10) t;

    -- 8) Tempo médio em cada fase (via stage_changed activities)
    WITH stage_intervals AS (
        SELECT a.card_id,
               a.created_at,
               LEAD(a.created_at) OVER (PARTITION BY a.card_id ORDER BY a.created_at) AS next_at,
               (a.metadata->>'old_stage_id')::UUID AS old_stage_id
          FROM activities a
          JOIN leads_norm ln ON ln.id = a.card_id
         WHERE a.tipo = 'stage_changed'
    ),
    fase_durations AS (
        SELECT ph.nome AS phase_name,
               ph.order_index AS phase_order,
               ROUND(AVG(EXTRACT(EPOCH FROM (next_at - created_at))/86400)::NUMERIC, 1) AS avg_dias,
               ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (next_at - created_at))/86400))::NUMERIC, 1) AS mediana_dias,
               COUNT(*) AS amostra
          FROM stage_intervals si
          JOIN pipeline_stages s ON s.id = si.old_stage_id
          JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE next_at IS NOT NULL
           AND s.pipeline_id = v_pipeline_id
         GROUP BY ph.id, ph.nome, ph.order_index
    )
    SELECT json_agg(json_build_object(
        'phase_name', phase_name,
        'avg_dias', avg_dias,
        'mediana_dias', mediana_dias,
        'amostra', amostra
    ) ORDER BY phase_order) INTO v_tempo_fase
    FROM fase_durations;

    -- 9) Conversão por faixa de investimento
    WITH conv_faixa AS (
        SELECT faixa,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status_simples = 'ganho') AS ganhos,
               COUNT(*) FILTER (WHERE status_simples = 'perdido') AS perdidos
          FROM leads_norm
         WHERE faixa IS NOT NULL
         GROUP BY faixa
    )
    SELECT json_agg(json_build_object(
        'faixa', faixa,
        'total', total,
        'ganhos', ganhos,
        'perdidos', perdidos,
        'taxa_ganho', CASE WHEN total > 0 THEN ROUND(100.0 * ganhos / total, 1) ELSE 0 END
    ) ORDER BY total DESC) INTO v_conv_faixa
    FROM conv_faixa;

    -- 10) Conversão por destino
    WITH conv_dest AS (
        SELECT destino,
               COUNT(*) AS total,
               COUNT(*) FILTER (WHERE status_simples = 'ganho') AS ganhos
          FROM leads_norm
         WHERE destino IS NOT NULL
         GROUP BY destino
         HAVING COUNT(*) >= 5
    )
    SELECT json_agg(json_build_object(
        'destino', destino,
        'total', total,
        'ganhos', ganhos,
        'taxa_ganho', CASE WHEN total > 0 THEN ROUND(100.0 * ganhos / total, 1) ELSE 0 END
    ) ORDER BY total DESC) INTO v_conv_destino
    FROM (SELECT * FROM conv_dest ORDER BY total DESC LIMIT 10) t;

    -- Resultado final
    RETURN json_build_object(
        'date_start', p_date_start,
        'date_end', p_date_end,
        'pipeline_id', v_pipeline_id,
        'org_id', v_org_id,
        'kpis', v_kpis,
        'funnel', COALESCE(v_funnel, '[]'::JSON),
        'quality', json_build_object(
            'por_faixa', COALESCE(v_quality_faixa, '[]'::JSON),
            'por_convidados', COALESCE(v_quality_convidados, '[]'::JSON),
            'por_destino', COALESCE(v_quality_destino, '[]'::JSON)
        ),
        'service', json_build_object(
            'motivos_perda_sdr', COALESCE(v_motivos_sdr, '[]'::JSON),
            'motivos_perda_closer', COALESCE(v_motivos_closer, '[]'::JSON),
            'tempo_em_fase', COALESCE(v_tempo_fase, '[]'::JSON)
        ),
        'conversao_segmento', json_build_object(
            'por_faixa', COALESCE(v_conv_faixa, '[]'::JSON),
            'por_destino', COALESCE(v_conv_destino, '[]'::JSON)
        )
    );
END $$;

GRANT EXECUTE ON FUNCTION public.analytics_weddings_overview(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

COMMENT ON FUNCTION public.analytics_weddings_overview IS
'Retorna JSON consolidado pra dashboard /analytics-weddings: KPIs, funil, qualidade do lead (faixa/convidados/destino), qualidade do atendimento (tempo em fase, motivos perda), conversão por segmento.';
