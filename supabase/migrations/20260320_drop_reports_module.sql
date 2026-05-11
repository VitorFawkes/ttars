-- =============================================
-- Drop Reports Module (frontend removido)
-- Tabelas: dashboard_widgets, custom_dashboards, custom_reports
-- RPCs: report_query_engine, report_drill_down
-- =============================================

-- 1. Drop RPCs first (depend on tables)
DROP FUNCTION IF EXISTS report_query_engine(JSONB);
DROP FUNCTION IF EXISTS report_drill_down(JSONB);

-- 2. Drop tables in dependency order (widgets → dashboards → reports)
DROP TABLE IF EXISTS dashboard_widgets CASCADE;
DROP TABLE IF EXISTS custom_dashboards CASCADE;
DROP TABLE IF EXISTS custom_reports CASCADE;
