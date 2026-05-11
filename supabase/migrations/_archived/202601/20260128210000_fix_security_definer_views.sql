-- ============================================================
-- Migration: Fix Security Definer Views
-- Data: 2026-01-28
-- Autor: Vitor (via Claude)
--
-- PROBLEMA: 13 views sem security_invoker = true estão bypassando
-- o RLS das tabelas subjacentes. Quando um usuário consulta essas
-- views, elas executam com permissões do OWNER (postgres/superuser),
-- não do usuário logado.
--
-- CORREÇÃO: Adicionar security_invoker = true para que as views
-- respeitem as políticas RLS das tabelas que consultam.
--
-- IMPACTO: Usuários só verão dados que teriam acesso direto via RLS.
-- Isso pode REDUZIR os resultados retornados (comportamento correto).
--
-- REFERÊNCIA: https://supabase.com/docs/guides/database/database-linter
-- PostgreSQL: https://www.postgresql.org/docs/current/sql-createview.html
-- ============================================================

-- ============================================================
-- DEPENDÊNCIAS (ordem de alteração não importa para ALTER VIEW SET)
-- view_agenda (base)
--     └── view_cards_acoes (usa view_agenda)
--             └── view_dashboard_funil (usa view_cards_acoes)
-- ============================================================

-- ============================================================
-- PARTE 1: Views de Proposals/Analytics (3 views)
-- ============================================================

-- v_contact_proposals: Histórico 360° de propostas por contato
-- Tabelas: contatos, cards, proposals, proposal_versions
ALTER VIEW public.v_contact_proposals SET (security_invoker = true);

-- v_proposal_analytics: Métricas de propostas com views, scroll, tempo
-- Tabelas: proposals, profiles, cards, proposal_versions, proposal_events
ALTER VIEW public.v_proposal_analytics SET (security_invoker = true);

-- v_team_proposal_performance: Performance de propostas por consultor
-- Tabelas: profiles, proposals
ALTER VIEW public.v_team_proposal_performance SET (security_invoker = true);

-- ============================================================
-- PARTE 2: Views de Cards/Pipeline (5 views)
-- IMPORTANTE: Ordem de dependência respeitada
-- ============================================================

-- view_agenda: Tarefas pendentes (base para outras views)
-- Tabelas: tarefas
ALTER VIEW public.view_agenda SET (security_invoker = true);

-- view_cards_acoes: View principal de cards com agregações
-- Tabelas: cards, pipeline_stages, pipelines, contatos, profiles, activities
-- Dependência: view_agenda
ALTER VIEW public.view_cards_acoes SET (security_invoker = true);

-- view_cards_contatos_summary: Resumo de contatos por card
-- Tabelas: cards, cards_contatos, contatos
ALTER VIEW public.view_cards_contatos_summary SET (security_invoker = true);

-- view_dashboard_funil: Dashboard do funil de vendas
-- Dependência: view_cards_acoes (agregado)
ALTER VIEW public.view_dashboard_funil SET (security_invoker = true);

-- view_deleted_cards: Cards soft-deleted (admin/auditoria)
-- Tabelas: cards, profiles, contatos, pipeline_stages
ALTER VIEW public.view_deleted_cards SET (security_invoker = true);

-- ============================================================
-- PARTE 3: Views de Integração (4 views)
-- ============================================================

-- view_integration_classification: Classificação de eventos
-- Tabelas: integration_events
ALTER VIEW public.view_integration_classification SET (security_invoker = true);

-- view_integration_router_audit: Auditoria do router
-- Tabelas: integration_events
ALTER VIEW public.view_integration_router_audit SET (security_invoker = true);

-- view_integration_would_apply: Preview de ações de integração
-- Tabelas: integration_events, integration_router_config
ALTER VIEW public.view_integration_would_apply SET (security_invoker = true);

-- view_router_discovery_report: Relatório de discovery
-- Tabelas: integration_events, integration_router_config
ALTER VIEW public.view_router_discovery_report SET (security_invoker = true);

-- ============================================================
-- PARTE 4: Views de Profiles (1 view)
-- ============================================================

-- view_profiles_complete: Perfis com roles, teams, departments
-- Tabelas: profiles, roles, teams, departments
ALTER VIEW public.view_profiles_complete SET (security_invoker = true);

-- ============================================================
-- VERIFICAÇÃO PÓS-APLICAÇÃO
-- ============================================================
-- Execute para verificar que todas as views agora têm security_invoker:
--
-- SELECT c.relname as view_name,
--        COALESCE(c.reloptions::text, '{}') as options
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relkind = 'v'
--   AND c.relname IN (
--     'view_profiles_complete', 'v_team_proposal_performance',
--     'view_integration_would_apply', 'view_router_discovery_report',
--     'view_integration_router_audit', 'view_cards_contatos_summary',
--     'view_deleted_cards', 'view_cards_acoes',
--     'view_integration_classification', 'view_agenda',
--     'v_proposal_analytics', 'view_dashboard_funil',
--     'v_contact_proposals'
--   )
-- ORDER BY c.relname;
--
-- Todas devem mostrar: {security_invoker=true}

-- ============================================================
-- ROLLBACK (se necessário)
-- ============================================================
-- ALTER VIEW public.v_contact_proposals SET (security_invoker = false);
-- ALTER VIEW public.v_proposal_analytics SET (security_invoker = false);
-- ALTER VIEW public.v_team_proposal_performance SET (security_invoker = false);
-- ALTER VIEW public.view_agenda SET (security_invoker = false);
-- ALTER VIEW public.view_cards_acoes SET (security_invoker = false);
-- ALTER VIEW public.view_cards_contatos_summary SET (security_invoker = false);
-- ALTER VIEW public.view_dashboard_funil SET (security_invoker = false);
-- ALTER VIEW public.view_deleted_cards SET (security_invoker = false);
-- ALTER VIEW public.view_integration_classification SET (security_invoker = false);
-- ALTER VIEW public.view_integration_router_audit SET (security_invoker = false);
-- ALTER VIEW public.view_integration_would_apply SET (security_invoker = false);
-- ALTER VIEW public.view_router_discovery_report SET (security_invoker = false);
-- ALTER VIEW public.view_profiles_complete SET (security_invoker = false);

-- ============================================================
-- TOTAL: 13 views corrigidas
-- RESULTADO: Views agora respeitam RLS das tabelas subjacentes
-- ============================================================
