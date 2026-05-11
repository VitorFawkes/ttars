-- ============================================================================
-- MIGRATION: view_cards_acoes — reaplicar security_invoker = true
-- Date: 2026-05-11
--
-- Bug reproduzível: usuario em Welcome Weddings clica em card no kanban e
-- cai em pagina branca "Viagem nao encontrada". O kanban (que le de
-- view_cards_acoes) mostra cards de OUTROS workspaces, mas CardDetail (que
-- le de cards direto) aplica RLS e bloqueia → retorna null.
--
-- Causa raiz: views em Postgres rodam por padrao com privilegios do owner
-- (postgres/superuser) e ignoram RLS das tabelas abaixo. A view foi criada
-- originalmente com WITH (security_invoker = true) em migrations anteriores
-- (ver _archived/202601/20260128210000_fix_security_definer_views.sql), mas
-- recriacoes subsequentes via CREATE OR REPLACE VIEW resetam essa opcao.
-- O ultimo CREATE OR REPLACE foi 20260506d, deixando a view sem o setting.
--
-- Fix: reaplicar security_invoker = true. A view passa a respeitar a RLS
-- policy "cards_org_select" (org_id = requesting_org_id()) e demais policies
-- das tabelas JOINadas (pipelines, pipeline_stages, contatos, profiles).
--
-- Defense in depth: ao recriar essa view no futuro, sempre reaplicar
-- ALTER VIEW ... SET (security_invoker = true) no fim do bloco.
-- ============================================================================

BEGIN;

ALTER VIEW public.view_cards_acoes SET (security_invoker = true);

COMMIT;
