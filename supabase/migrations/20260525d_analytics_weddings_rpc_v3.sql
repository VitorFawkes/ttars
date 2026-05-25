-- ============================================================================
-- Analytics Weddings RPC — v3 (evolução incremental de b + c)
--
-- Histórico (preservado abaixo):
--   20260525b: criou analytics_weddings_overview (versão inicial)
--   20260525c: fix CTE leads_norm não persistia entre statements → TEMP TABLE
--              + COALESCE(label, name) em pipeline_phases
--              + alias event_at para evitar "created_at ambiguous"
--
-- v3 adiciona (sem reverter nada de b ou c):
--   1. Coluna phase_slug em _ww_leads
--   2. Coluna convertido_efetivo (status='ganho' OU em fase Pós-Venda)
--   3. KPIs: leads_convertidos_efetivo + taxa_conversao_efetiva
--   4. Funil: HAVING s.ativo = TRUE OR COUNT > 0 (mostra inativas com cards)
--   5. Conversão por faixa/destino usa convertido_efetivo (não só status='ganho')
--
-- Por quê: cards em Pós-Venda do legado têm status_comercial='aberto' (não foi
-- atualizado pra 'ganho' ao mover de fase). Por isso "taxa de conversão" pelo
-- status puro mostrava 0.2% quando a realidade é ~5% (113 casamentos fechados).
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
AS $func$
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
BEGIN
    v_org_id := COALESCE(p_org_id, requesting_org_id());

    SELECT p.id INTO v_pipeline_id FROM pipelines p
     WHERE p.produto::TEXT = 'WEDDING' AND p.org_id = v_org_id LIMIT 1;

    IF v_pipeline_id IS NULL THEN
        RETURN json_build_object('error', 'Pipeline Wedding não encontrado para org ' || v_org_id);
    END IF;

    CREATE TEMP TABLE _ww_leads ON COMMIT DROP AS
    SELECT c.id, c.created_at, c.pipeline_stage_id, c.status_comercial, c.valor_final, c.data_fechamento,
           (c.produto_data->>'ww_mkt_orcamento_form') AS faixa_raw,
           (c.produto_data->>'ww_mkt_convidados_form') AS convidados_raw,
           (c.produto_data->>'ww_mkt_destino_form') AS destino_raw,
           (c.produto_data->>'ww_motivo_perda_sdr') AS motivo_sdr,
           (c.produto_data->>'ww_motivo_perda_closer') AS motivo_closer,
           CASE
             WHEN (c.produto_data->>'ww_mkt_orcamento_form') IS NULL THEN NULL
             WHEN (c.produto_data->>'ww_mkt_orcamento_form') ILIKE '%menos de r$50%' OR (c.produto_data->>'ww_mkt_orcamento_form') ILIKE '%até%r$50%' THEN 'Até R$50 mil'
             WHEN (c.produto_data->>'ww_mkt_orcamento_form') ILIKE '%r$50%80%' THEN 'R$50-80 mil'
             WHEN (c.produto_data->>'ww_mkt_orcamento_form') ILIKE '%r$80%100%' THEN 'R$80-100 mil'
             WHEN (c.produto_data->>'ww_mkt_orcamento_form') ILIKE '%r$50%100%' THEN 'R$50-100 mil'
             WHEN (c.produto_data->>'ww_mkt_orcamento_form') ILIKE '%r$100%200%' THEN 'R$100-200 mil'
             WHEN (c.produto_data->>'ww_mkt_orcamento_form') ILIKE '%r$200%500%' THEN 'R$200-500 mil'
             WHEN (c.produto_data->>'ww_mkt_orcamento_form') ILIKE '%mais de r$500%' OR (c.produto_data->>'ww_mkt_orcamento_form') ILIKE '%acima%500%' THEN 'Mais de R$500 mil'
             ELSE TRIM(REPLACE((c.produto_data->>'ww_mkt_orcamento_form'), '_', ' '))
           END AS faixa,
           CASE
             WHEN (c.produto_data->>'ww_mkt_convidados_form') IS NULL THEN NULL
             WHEN (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%apenas o casal%' OR (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%só o casal%' THEN 'Apenas o casal'
             WHEN (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%até 20%' THEN 'Até 20'
             WHEN (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%20 a 50%' OR (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%menos de 50%' THEN '20-50'
             WHEN (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%50 a 80%' OR (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%50 e 100%' THEN '50-80'
             WHEN (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%80 a 100%' OR (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%80 e 100%' THEN '80-100'
             WHEN (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%acima de 100%' OR (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%mais de 100%' OR (c.produto_data->>'ww_mkt_convidados_form') ILIKE '%+100%' THEN '+100'
             ELSE TRIM(REPLACE((c.produto_data->>'ww_mkt_convidados_form'), '_', ' '))
           END AS convidados_bucket,
           CASE WHEN (c.produto_data->>'ww_mkt_destino_form') IS NULL THEN NULL
                ELSE INITCAP(TRIM(REPLACE(LOWER((c.produto_data->>'ww_mkt_destino_form')), '_', ' ')))
           END AS destino,
           CASE WHEN c.status_comercial = 'ganho' THEN 'ganho'
                WHEN c.status_comercial = 'perdido' THEN 'perdido'
                ELSE 'aberto' END AS status_simples
      FROM cards c
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT = 'WEDDING' AND c.org_id = v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    ALTER TABLE _ww_leads ADD COLUMN phase_slug TEXT;
    ALTER TABLE _ww_leads ADD COLUMN convertido_efetivo BOOLEAN DEFAULT FALSE;

    UPDATE _ww_leads ln SET phase_slug = ph.slug,
           convertido_efetivo = (ln.status_simples = 'ganho' OR ph.slug = 'pos_venda')
      FROM pipeline_stages s
      JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE s.id = ln.pipeline_stage_id;

    CREATE INDEX ON _ww_leads (pipeline_stage_id);

    SELECT json_build_object(
        'total_leads', COUNT(*),
        'leads_ganhos', COUNT(*) FILTER (WHERE status_simples = 'ganho'),
        'leads_perdidos', COUNT(*) FILTER (WHERE status_simples = 'perdido'),
        'leads_abertos', COUNT(*) FILTER (WHERE status_simples = 'aberto'),
        'leads_convertidos_efetivo', COUNT(*) FILTER (WHERE convertido_efetivo = TRUE),
        'taxa_conversao', CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status_simples = 'ganho') / COUNT(*), 1) ELSE 0 END,
        'taxa_conversao_efetiva', CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE convertido_efetivo = TRUE) / COUNT(*), 1) ELSE 0 END,
        'ticket_medio_fechado', ROUND(COALESCE(AVG(valor_final) FILTER (WHERE convertido_efetivo = TRUE AND valor_final > 0), 0)::NUMERIC, 0),
        'receita_total_fechada', ROUND(COALESCE(SUM(valor_final) FILTER (WHERE convertido_efetivo = TRUE), 0)::NUMERIC, 0)
    ) INTO v_kpis FROM _ww_leads;

    -- Funil: inclui etapas inativas com cards
    SELECT json_agg(json_build_object(
        'phase_id', phase_id, 'phase_name', phase_name, 'phase_order', phase_order,
        'stage_id', stage_id, 'stage_name', stage_name, 'stage_order', stage_order,
        'stage_active', stage_active, 'leads_count', leads_count
    ) ORDER BY phase_order NULLS LAST, stage_order NULLS LAST) INTO v_funnel
    FROM (
        SELECT ph.id AS phase_id, COALESCE(ph.label, ph.name) AS phase_name, ph.order_index AS phase_order,
               s.id AS stage_id, s.nome AS stage_name, s.ordem AS stage_order, s.ativo AS stage_active,
               COUNT(ln.id) AS leads_count
          FROM pipeline_phases ph
          JOIN pipeline_stages s ON s.phase_id = ph.id
          LEFT JOIN _ww_leads ln ON ln.pipeline_stage_id = s.id
         WHERE s.pipeline_id = v_pipeline_id
         GROUP BY ph.id, ph.label, ph.name, ph.order_index, s.id, s.nome, s.ordem, s.ativo
        HAVING s.ativo = TRUE OR COUNT(ln.id) > 0
    ) sc;

    SELECT json_agg(json_build_object('faixa', faixa, 'qtd', qtd, 'pct', pct) ORDER BY qtd DESC) INTO v_quality_faixa
    FROM (SELECT faixa, COUNT(*) AS qtd, ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct
          FROM _ww_leads WHERE faixa IS NOT NULL GROUP BY faixa) fd;

    SELECT json_agg(json_build_object('bucket', bucket, 'qtd', qtd, 'pct', pct) ORDER BY qtd DESC) INTO v_quality_convidados
    FROM (SELECT convidados_bucket AS bucket, COUNT(*) AS qtd, ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct
          FROM _ww_leads WHERE convidados_bucket IS NOT NULL GROUP BY convidados_bucket) cd;

    SELECT json_agg(json_build_object('destino', destino, 'qtd', qtd, 'pct', pct) ORDER BY qtd DESC) INTO v_quality_destino
    FROM (SELECT destino, COUNT(*) AS qtd, ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct
          FROM _ww_leads WHERE destino IS NOT NULL GROUP BY destino ORDER BY COUNT(*) DESC LIMIT 15) dd;

    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_motivos_sdr
    FROM (SELECT motivo_sdr AS motivo, COUNT(*) AS qtd FROM _ww_leads WHERE motivo_sdr IS NOT NULL GROUP BY motivo_sdr ORDER BY COUNT(*) DESC LIMIT 10) m;

    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_motivos_closer
    FROM (SELECT motivo_closer AS motivo, COUNT(*) AS qtd FROM _ww_leads WHERE motivo_closer IS NOT NULL GROUP BY motivo_closer ORDER BY COUNT(*) DESC LIMIT 10) m;

    SELECT json_agg(json_build_object('phase_name', phase_name, 'avg_dias', avg_dias, 'mediana_dias', mediana_dias, 'amostra', amostra) ORDER BY phase_order) INTO v_tempo_fase
    FROM (
        SELECT COALESCE(ph.label, ph.name) AS phase_name, ph.order_index AS phase_order,
               ROUND(AVG(EXTRACT(EPOCH FROM (si.next_at - si.event_at))/86400)::NUMERIC, 1) AS avg_dias,
               ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (si.next_at - si.event_at))/86400))::NUMERIC, 1) AS mediana_dias,
               COUNT(*) AS amostra
          FROM (SELECT a.card_id, a.created_at AS event_at, LEAD(a.created_at) OVER (PARTITION BY a.card_id ORDER BY a.created_at) AS next_at,
                       (a.metadata->>'old_stage_id')::UUID AS old_stage_id
                  FROM activities a
                 WHERE a.tipo = 'stage_changed' AND a.card_id IN (SELECT id FROM _ww_leads)) si
          JOIN pipeline_stages s ON s.id = si.old_stage_id
          JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE si.next_at IS NOT NULL AND s.pipeline_id = v_pipeline_id
         GROUP BY ph.id, ph.label, ph.name, ph.order_index
    ) fd;

    SELECT json_agg(json_build_object('faixa', faixa, 'total', total, 'ganhos', ganhos, 'perdidos', perdidos, 'taxa_ganho', taxa_ganho) ORDER BY total DESC) INTO v_conv_faixa
    FROM (SELECT faixa, COUNT(*) AS total,
                 COUNT(*) FILTER (WHERE convertido_efetivo = TRUE) AS ganhos,
                 COUNT(*) FILTER (WHERE status_simples = 'perdido') AS perdidos,
                 CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE convertido_efetivo = TRUE) / COUNT(*), 1) ELSE 0 END AS taxa_ganho
          FROM _ww_leads WHERE faixa IS NOT NULL GROUP BY faixa) cf;

    SELECT json_agg(json_build_object('destino', destino, 'total', total, 'ganhos', ganhos, 'taxa_ganho', taxa_ganho) ORDER BY total DESC) INTO v_conv_destino
    FROM (SELECT destino, COUNT(*) AS total,
                 COUNT(*) FILTER (WHERE convertido_efetivo = TRUE) AS ganhos,
                 CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE convertido_efetivo = TRUE) / COUNT(*), 1) ELSE 0 END AS taxa_ganho
          FROM _ww_leads WHERE destino IS NOT NULL GROUP BY destino HAVING COUNT(*) >= 5 ORDER BY COUNT(*) DESC LIMIT 10) cd;

    DROP TABLE _ww_leads;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'kpis', v_kpis,
        'funnel', COALESCE(v_funnel, '[]'::JSON),
        'quality', json_build_object('por_faixa', COALESCE(v_quality_faixa, '[]'::JSON),
                                     'por_convidados', COALESCE(v_quality_convidados, '[]'::JSON),
                                     'por_destino', COALESCE(v_quality_destino, '[]'::JSON)),
        'service', json_build_object('motivos_perda_sdr', COALESCE(v_motivos_sdr, '[]'::JSON),
                                     'motivos_perda_closer', COALESCE(v_motivos_closer, '[]'::JSON),
                                     'tempo_em_fase', COALESCE(v_tempo_fase, '[]'::JSON)),
        'conversao_segmento', json_build_object('por_faixa', COALESCE(v_conv_faixa, '[]'::JSON),
                                                'por_destino', COALESCE(v_conv_destino, '[]'::JSON))
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.analytics_weddings_overview(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;
