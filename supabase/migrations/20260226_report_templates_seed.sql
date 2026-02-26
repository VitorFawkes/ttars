-- ============================================
-- Report Templates — Seed de templates pré-prontos
-- Usa um created_by fixo = primeiro admin do sistema
-- ============================================

DO $$
DECLARE
    v_admin_id UUID;
BEGIN
    -- Pegar primeiro admin para ser dono dos templates
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at LIMIT 1;
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM profiles ORDER BY created_at LIMIT 1;
    END IF;
    IF v_admin_id IS NULL THEN
        RAISE NOTICE 'Nenhum profile encontrado — templates não serão criados';
        RETURN;
    END IF;

    -- Template 1: Cards por Etapa do Funil
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Cards por Etapa do Funil',
        'Distribuição de negócios por cada etapa do pipeline',
        '{"source":"cards","dimensions":[{"field":"ps.nome"}],"measures":[{"field":"c.id","aggregation":"count"}],"filters":[],"limit":50}',
        '{"type":"bar_horizontal","showLegend":false,"showGrid":true,"colorScheme":"default","height":320}',
        v_admin_id, 'everyone', true, 'Pipeline'
    ) ON CONFLICT DO NOTHING;

    -- Template 2: Faturamento por Mês
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Faturamento por Mês',
        'Evolução mensal do faturamento (valor final)',
        '{"source":"cards","dimensions":[{"field":"c.data_fechamento","dateGrouping":"month"}],"measures":[{"field":"c.valor_final","aggregation":"sum"}],"filters":[],"limit":50}',
        '{"type":"line","showLegend":false,"showGrid":true,"colorScheme":"default","labelFormat":"currency","height":320}',
        v_admin_id, 'everyone', true, 'Financeiro'
    ) ON CONFLICT DO NOTHING;

    -- Template 3: Receita por Consultor
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Receita por Consultor',
        'Receita (margem) gerada por cada consultor de vendas',
        '{"source":"cards","dimensions":[{"field":"pr_vendas.nome"}],"measures":[{"field":"c.receita","aggregation":"sum"}],"filters":[],"limit":50}',
        '{"type":"bar_horizontal","showLegend":false,"showGrid":true,"colorScheme":"default","labelFormat":"currency","height":320}',
        v_admin_id, 'everyone', true, 'Equipe'
    ) ON CONFLICT DO NOTHING;

    -- Template 4: Leads por Origem
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Leads por Origem',
        'De onde vêm seus leads',
        '{"source":"cards","dimensions":[{"field":"c.origem"}],"measures":[{"field":"c.id","aggregation":"count"}],"filters":[],"limit":20}',
        '{"type":"donut","showLegend":true,"showGrid":false,"colorScheme":"default","height":300}',
        v_admin_id, 'everyone', true, 'Lead'
    ) ON CONFLICT DO NOTHING;

    -- Template 5: Taxa de Conversão por Produto
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Taxa de Conversão por Produto',
        'Percentual de conversão (ganhos/total) por tipo de produto',
        '{"source":"cards","dimensions":[{"field":"c.produto"}],"measures":[],"computedMeasures":[{"type":"computed","key":"taxa_conversao"}],"filters":[],"limit":50}',
        '{"type":"bar_vertical","showLegend":false,"showGrid":true,"colorScheme":"default","labelFormat":"percent","height":320}',
        v_admin_id, 'everyone', true, 'Pipeline'
    ) ON CONFLICT DO NOTHING;

    -- Template 6: Propostas por Status
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Propostas por Status',
        'Distribuição de propostas por status (draft, enviada, aceita, etc.)',
        '{"source":"propostas","dimensions":[{"field":"p.status"}],"measures":[{"field":"p.id","aggregation":"count"}],"filters":[],"limit":20}',
        '{"type":"pie","showLegend":true,"showGrid":false,"colorScheme":"default","height":300}',
        v_admin_id, 'everyone', true, 'Propostas'
    ) ON CONFLICT DO NOTHING;

    -- Template 7: Tarefas Atrasadas por Tipo
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Tarefas Atrasadas por Tipo',
        'Quantidade de tarefas atrasadas agrupadas por tipo',
        '{"source":"tarefas","dimensions":[{"field":"t.tipo"}],"measures":[{"field":"atrasadas","aggregation":"count"}],"filters":[],"limit":50}',
        '{"type":"bar_vertical","showLegend":false,"showGrid":true,"colorScheme":"warm","height":320}',
        v_admin_id, 'everyone', true, 'Operações'
    ) ON CONFLICT DO NOTHING;

    -- Template 8: Ticket Médio por Mês
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Ticket Médio por Mês',
        'Evolução mensal do ticket médio de vendas ganhas',
        '{"source":"cards","dimensions":[{"field":"c.data_fechamento","dateGrouping":"month"}],"measures":[],"computedMeasures":[{"type":"computed","key":"ticket_medio"}],"filters":[],"limit":50}',
        '{"type":"composed","showLegend":false,"showGrid":true,"colorScheme":"default","labelFormat":"currency","height":320}',
        v_admin_id, 'everyone', true, 'Financeiro'
    ) ON CONFLICT DO NOTHING;

    -- Template 9: Ciclo de Venda por Etapa
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Ciclo de Venda por Etapa',
        'Média de dias no ciclo de venda por etapa do funil',
        '{"source":"cards","dimensions":[{"field":"ps.nome"}],"measures":[{"field":"ciclo_dias","aggregation":"avg"}],"filters":[],"limit":50}',
        '{"type":"bar_horizontal","showLegend":false,"showGrid":true,"colorScheme":"cool","height":320}',
        v_admin_id, 'everyone', true, 'Velocidade'
    ) ON CONFLICT DO NOTHING;

    -- Template 10: Motivos de Perda
    INSERT INTO custom_reports (title, description, config, visualization, created_by, visibility, is_template, category) VALUES (
        'Motivos de Perda',
        'Principais motivos de perda de negócios',
        '{"source":"cards","dimensions":[{"field":"mp.nome"}],"measures":[{"field":"c.id","aggregation":"count"}],"filters":[{"field":"c.status_comercial","operator":"eq","value":"perdido"}],"limit":20}',
        '{"type":"donut","showLegend":true,"showGrid":false,"colorScheme":"warm","height":300}',
        v_admin_id, 'everyone', true, 'Pipeline'
    ) ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Templates de relatórios criados com sucesso para admin_id=%', v_admin_id;
END $$;
