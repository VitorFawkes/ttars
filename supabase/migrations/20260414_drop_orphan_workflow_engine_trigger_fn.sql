-- Drop DB function órfã trigger_workflow_engine_webhook
--
-- CONTEXTO
-- Auditoria 2026-04-13: função tem 0 triggers vinculados (tgfoid count=0),
-- chamava a edge function workflow-engine que foi deletada hoje (sem source
-- no git, sem callers reais no frontend/cron/n8n).
--
-- Além de órfã, tinha anon key hardcoded no corpo SQL — security debt.
--
-- Safe: sem dependências, drop direto.

DROP FUNCTION IF EXISTS public.trigger_workflow_engine_webhook() CASCADE;
