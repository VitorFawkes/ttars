-- ============================================
-- Report Templates v2 — 6 templates para diretores
-- Complementa os 10 templates da v1
-- ============================================

DO $$
DECLARE
    v_admin_id UUID;
BEGIN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at LIMIT 1;
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM profiles ORDER BY created_at LIMIT 1;
    END IF;
    IF v_admin_id IS NULL THEN
        RAISE NOTICE 'Nenhum profile encontrado — templates não serão criados';
        RETURN;
    END IF;

    -- Template 11: Leads por Origem com Conversão
    -- Responde: "De onde vêm nossos melhores leads?"
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Leads por Origem + Conversão',
        'Quantidade de leads por origem com taxa de conversão e ticket médio — identifica canais mais rentáveis',
        '{"source":"cards","dimensions":[{"field":"c.origem"}],"measures":[{"field":"c.id","aggregation":"count"},{"field":"c.valor_final","aggregation":"sum"}],"computedMeasures":[{"type":"computed","key":"taxa_conversao"},{"type":"computed","key":"ticket_medio"}],"filters":[],"limit":50}',
        '{"type":"table","showLegend":false,"showGrid":true,"colorScheme":"default","labelFormat":"number","height":400}',
        v_admin_id, 'everyone', true, 'Lead'
    ) ON CONFLICT DO NOTHING;

    -- Template 12: Performance do Time (Ranking)
    -- Responde: "Quem está performando melhor?"
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Performance do Time (Ranking)',
        'Ranking dos consultores por volume, faturamento, conversão e ticket médio',
        '{"source":"cards","dimensions":[{"field":"pr_dono.nome"}],"measures":[{"field":"c.id","aggregation":"count"},{"field":"c.valor_final","aggregation":"sum"}],"computedMeasures":[{"type":"computed","key":"taxa_conversao"},{"type":"computed","key":"ticket_medio"}],"filters":[],"limit":50}',
        '{"type":"table","showLegend":false,"showGrid":true,"colorScheme":"default","labelFormat":"number","height":400}',
        v_admin_id, 'everyone', true, 'Equipe'
    ) ON CONFLICT DO NOTHING;

    -- Template 13: Tendência Mensal Completa
    -- Responde: "Como estamos evoluindo mês a mês?"
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Tendência Mensal Completa',
        'Evolução mensal de novos leads, faturamento e taxa de conversão em um único gráfico',
        '{"source":"cards","dimensions":[{"field":"c.created_at","dateGrouping":"month"}],"measures":[{"field":"c.id","aggregation":"count"},{"field":"c.valor_final","aggregation":"sum"}],"computedMeasures":[{"type":"computed","key":"taxa_conversao"}],"filters":[],"limit":50}',
        '{"type":"composed","showLegend":true,"showGrid":true,"colorScheme":"default","height":380}',
        v_admin_id, 'everyone', true, 'Financeiro'
    ) ON CONFLICT DO NOTHING;

    -- Template 14: Perda por Etapa do Funil
    -- Responde: "Em qual etapa estamos perdendo mais gente?"
    -- Usa source=historico para ver DE ONDE saíram para "Fechado - Perdido"
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Perda por Etapa do Funil',
        'De qual etapa os negócios saíram antes de serem perdidos — identifica gargalos do pipeline',
        '{"source":"historico","dimensions":[{"field":"ps_anterior.nome"}],"measures":[{"field":"hf.id","aggregation":"count"}],"filters":[{"field":"ps.nome","operator":"eq","value":"Fechado - Perdido"}],"limit":50}',
        '{"type":"bar_horizontal","showLegend":false,"showGrid":true,"colorScheme":"warm","height":360}',
        v_admin_id, 'everyone', true, 'Pipeline'
    ) ON CONFLICT DO NOTHING;

    -- Template 15: Propostas — Funil de Aceite
    -- Responde: "Quantas propostas estão convertendo?"
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Propostas: Funil de Aceite',
        'Distribuição de propostas por status com valor total e taxa de aceitação',
        '{"source":"propostas","dimensions":[{"field":"p.status"}],"measures":[{"field":"p.id","aggregation":"count"},{"field":"p.accepted_total","aggregation":"sum"}],"computedMeasures":[{"type":"computed","key":"taxa_aceitacao"}],"filters":[],"limit":20}',
        '{"type":"funnel","showLegend":true,"showGrid":false,"colorScheme":"default","labelFormat":"number","height":340}',
        v_admin_id, 'everyone', true, 'Propostas'
    ) ON CONFLICT DO NOTHING;

    -- Template 16: Velocidade por Fase
    -- Responde: "Quanto tempo estamos demorando em cada fase?"
    -- Usa dias_etapa (tempo na etapa atual) — ciclo_dias removido pois requer data_fechamento preenchida
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Velocidade por Fase do Pipeline',
        'Tempo médio que os cards estão na etapa atual, agrupado por fase (SDR, Vendas, Pós-Venda)',
        '{"source":"cards","dimensions":[{"field":"pp.label"}],"measures":[{"field":"dias_etapa","aggregation":"avg"}],"filters":[],"limit":20}',
        '{"type":"bar_vertical","showLegend":false,"showGrid":true,"colorScheme":"cool","height":340}',
        v_admin_id, 'everyone', true, 'Velocidade'
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Templates v2 criados com sucesso para admin_id=%', v_admin_id;
END $$;
