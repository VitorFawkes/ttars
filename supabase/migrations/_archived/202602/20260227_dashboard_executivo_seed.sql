-- ============================================
-- Dashboard Executivo pré-montado
-- Grid 2x3 com 6 widgets cobrindo visão geral
-- ============================================

DO $$
DECLARE
    v_admin_id UUID;
    v_dashboard_id UUID;
    v_report_funil UUID;
    v_report_faturamento UUID;
    v_report_performance UUID;
    v_report_perda_motivo UUID;
    v_report_leads_origem UUID;
    v_report_velocidade UUID;
BEGIN
    SELECT id INTO v_admin_id FROM profiles WHERE is_admin = true ORDER BY created_at LIMIT 1;
    IF v_admin_id IS NULL THEN
        SELECT id INTO v_admin_id FROM profiles ORDER BY created_at LIMIT 1;
    END IF;
    IF v_admin_id IS NULL THEN
        RAISE NOTICE 'Nenhum profile encontrado — dashboard não será criado';
        RETURN;
    END IF;

    -- Buscar IDs dos templates existentes (da v1 + v2)
    SELECT id INTO v_report_funil FROM custom_reports WHERE title = 'Cards por Etapa do Funil' AND is_template = true LIMIT 1;
    SELECT id INTO v_report_faturamento FROM custom_reports WHERE title = 'Faturamento por Mês' AND is_template = true LIMIT 1;
    SELECT id INTO v_report_performance FROM custom_reports WHERE title = 'Performance do Time (Ranking)' AND is_template = true LIMIT 1;
    SELECT id INTO v_report_perda_motivo FROM custom_reports WHERE title = 'Motivos de Perda' AND is_template = true LIMIT 1;
    SELECT id INTO v_report_leads_origem FROM custom_reports WHERE title = 'Leads por Origem + Conversão' AND is_template = true LIMIT 1;
    SELECT id INTO v_report_velocidade FROM custom_reports WHERE title = 'Velocidade por Fase do Pipeline' AND is_template = true LIMIT 1;

    -- Verificar se todos os templates existem
    IF v_report_funil IS NULL OR v_report_faturamento IS NULL OR v_report_performance IS NULL
       OR v_report_perda_motivo IS NULL OR v_report_leads_origem IS NULL OR v_report_velocidade IS NULL THEN
        RAISE NOTICE 'Templates incompletos — dashboard executivo não será criado. Rode templates v1 e v2 primeiro.';
        RETURN;
    END IF;

    -- Evitar duplicata
    IF EXISTS (SELECT 1 FROM custom_dashboards WHERE title = 'Dashboard Executivo' AND created_by = v_admin_id) THEN
        RAISE NOTICE 'Dashboard Executivo já existe — pulando';
        RETURN;
    END IF;

    -- Criar dashboard
    v_dashboard_id := gen_random_uuid();
    INSERT INTO custom_dashboards (id, title, description, global_filters, created_by, visibility, pinned) VALUES (
        v_dashboard_id,
        'Dashboard Executivo',
        'Visão geral para diretores: funil, faturamento, performance do time, perdas, leads por origem e velocidade do pipeline',
        '{"datePreset":"last_3_months"}',
        v_admin_id,
        'everyone',
        true
    );

    -- Widget 1: Funil de Conversão (top-left)
    INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h, title_override) VALUES
        (v_dashboard_id, v_report_funil, 0, 0, 6, 4, 'Funil de Conversão');

    -- Widget 2: Faturamento Mensal (top-right)
    INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h, title_override) VALUES
        (v_dashboard_id, v_report_faturamento, 6, 0, 6, 4, 'Faturamento Mensal');

    -- Widget 3: Performance do Time (mid-left)
    INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h, title_override) VALUES
        (v_dashboard_id, v_report_performance, 0, 4, 6, 4, 'Performance do Time');

    -- Widget 4: Motivos de Perda (mid-right)
    INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h, title_override) VALUES
        (v_dashboard_id, v_report_perda_motivo, 6, 4, 6, 4, 'Motivos de Perda');

    -- Widget 5: Leads por Origem (bottom-left)
    INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h, title_override) VALUES
        (v_dashboard_id, v_report_leads_origem, 0, 8, 6, 4, 'Leads por Origem + Conversão');

    -- Widget 6: Velocidade do Pipeline (bottom-right)
    INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h, title_override) VALUES
        (v_dashboard_id, v_report_velocidade, 6, 8, 6, 4, 'Velocidade por Fase');

    RAISE NOTICE 'Dashboard Executivo criado com sucesso: id=%, 6 widgets', v_dashboard_id;
END $$;
