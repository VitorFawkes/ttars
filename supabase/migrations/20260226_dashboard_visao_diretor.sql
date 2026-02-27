-- ============================================================
-- Dashboard "Visão Diretor Comercial"
-- 8 widgets: 3 novos reports + 5 reutilizados
-- ============================================================

DO $$
DECLARE
  v_owner UUID := '8387b824-1a91-4b61-bbc4-eba6040c7141';
  v_dash_id UUID := gen_random_uuid();
  v_report_evolucao UUID := gen_random_uuid();
  v_report_margem UUID := gen_random_uuid();
  v_report_perda_etapa UUID := gen_random_uuid();
BEGIN

-- Idempotência: se já existe, não duplica
IF EXISTS (SELECT 1 FROM custom_dashboards WHERE title = 'Visão Diretor Comercial') THEN
  RAISE NOTICE 'Dashboard "Visão Diretor Comercial" já existe — pulando.';
  RETURN;
END IF;

-- ── 1) Novo Relatório: Evolução Mensal — Volume e Receita (composed) ──
INSERT INTO custom_reports (id, title, description, config, visualization, is_template, visibility, created_by)
VALUES (
  v_report_evolucao,
  'Evolução Mensal — Volume e Receita',
  'Tendência mensal de negócios criados, faturamento e receita em gráfico composto',
  '{
    "source": "cards",
    "dimensions": [{"field": "c.created_at", "dateGrouping": "month"}],
    "measures": [
      {"field": "c.id", "aggregation": "count"},
      {"field": "c.valor_final", "aggregation": "sum"},
      {"field": "c.receita", "aggregation": "sum"}
    ],
    "computedMeasures": [{"key": "taxa_conversao", "type": "computed"}],
    "filters": [],
    "orderBy": [{"key": "dim_0", "dir": "asc"}],
    "limit": 24
  }'::jsonb,
  '{
    "type": "composed",
    "height": 360,
    "showGrid": true,
    "showLegend": true,
    "colorScheme": "default",
    "labelFormat": "currency"
  }'::jsonb,
  false,
  'everyone',
  v_owner
);

-- ── 2) Novo Relatório: Margem por Consultor (table) ──
INSERT INTO custom_reports (id, title, description, config, visualization, is_template, visibility, created_by)
VALUES (
  v_report_margem,
  'Margem por Consultor — Receita vs Faturamento',
  'Ranking de consultores com receita, faturamento, margem % e ticket médio',
  '{
    "source": "cards",
    "dimensions": [{"field": "pr_dono.nome"}],
    "measures": [
      {"field": "c.id", "aggregation": "count"},
      {"field": "c.valor_final", "aggregation": "sum"},
      {"field": "c.receita", "aggregation": "sum"}
    ],
    "computedMeasures": [
      {"key": "margem_pct", "type": "computed"},
      {"key": "ticket_medio", "type": "computed"}
    ],
    "filters": [],
    "orderBy": [{"key": "mea_1", "dir": "desc"}],
    "limit": 20
  }'::jsonb,
  '{
    "type": "table",
    "height": 400,
    "showGrid": true,
    "showLegend": false,
    "colorScheme": "default",
    "labelFormat": "currency"
  }'::jsonb,
  false,
  'everyone',
  v_owner
);

-- ── 3) Novo Relatório: Perda — Onde no Funil (bar_horizontal) ──
INSERT INTO custom_reports (id, title, description, config, visualization, is_template, visibility, created_by)
VALUES (
  v_report_perda_etapa,
  'Perda: Onde no Funil',
  'Em qual etapa do funil os negócios estão sendo perdidos',
  '{
    "source": "historico",
    "dimensions": [{"field": "ps_anterior.nome"}],
    "measures": [{"field": "hf.id", "aggregation": "count"}],
    "filters": [{"field": "ps.nome", "value": "Fechado - Perdido", "operator": "eq"}],
    "orderBy": [{"key": "mea_0", "dir": "desc"}],
    "limit": 15
  }'::jsonb,
  '{
    "type": "bar_horizontal",
    "height": 340,
    "showGrid": true,
    "showLegend": false,
    "colorScheme": "warm",
    "labelFormat": "number"
  }'::jsonb,
  false,
  'everyone',
  v_owner
);

-- ── 4) Dashboard ──
INSERT INTO custom_dashboards (id, title, description, pinned, created_by, visibility, global_filters)
VALUES (
  v_dash_id,
  'Visão Diretor Comercial',
  'Painel executivo para diretores de vendas e operações — KPIs, funil, tendências, margem e diagnóstico de perda',
  true,
  v_owner,
  'everyone',
  '{"datePreset": "this_year"}'::jsonb
);

-- ── 5) Widgets (8 total) ──

-- Row 0: KPIs Executivos (full-width)
INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h)
VALUES (v_dash_id, '860ab962-9100-4d3e-bc60-d91c322bb335', 0, 0, 12, 2);

-- Row 1: Pipeline Ativo (7 cols) + Status Comercial donut (5 cols)
INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h)
VALUES (v_dash_id, '04ef4e9a-afbe-4bef-ae51-4b99c35785e9', 0, 2, 7, 5);

INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h)
VALUES (v_dash_id, 'f0f22076-a52d-4f14-9b6d-b4038ec4d550', 7, 2, 5, 5);

-- Row 2: Evolução Mensal (8 cols) + Motivos de Perda (4 cols)
INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h)
VALUES (v_dash_id, v_report_evolucao, 0, 7, 8, 4);

INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h)
VALUES (v_dash_id, '6c1985f1-0c14-419f-a38a-92aee6e12f95', 8, 7, 4, 4);

-- Row 3: Margem por Consultor (full-width table)
INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h)
VALUES (v_dash_id, v_report_margem, 0, 11, 12, 5);

-- Row 4: Perda: Onde no Funil (6 cols) + Propostas Funil (6 cols)
INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h)
VALUES (v_dash_id, v_report_perda_etapa, 0, 16, 6, 4);

INSERT INTO dashboard_widgets (dashboard_id, report_id, grid_x, grid_y, grid_w, grid_h)
VALUES (v_dash_id, 'fb9d4e8e-e342-451c-8399-2dc92351dae0', 6, 16, 6, 4);

RAISE NOTICE 'Dashboard "Visão Diretor Comercial" criado com ID: %', v_dash_id;
RAISE NOTICE 'Reports criados: evolucao=%, margem=%, perda_etapa=%', v_report_evolucao, v_report_margem, v_report_perda_etapa;

END $$;
