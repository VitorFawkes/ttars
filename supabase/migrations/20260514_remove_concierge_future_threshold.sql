-- Reverte feature "Agendados para o futuro" do kanban /concierge.
-- A UI e a logica de threshold foram removidas; agora retiramos do banco
-- a coluna e a RPC que sustentavam o controle por workspace.
--
-- Migrations revertidas:
--   20260513_org_concierge_future_threshold.sql
--   20260513b_rpc_update_concierge_future_threshold.sql

DROP FUNCTION IF EXISTS public.rpc_update_concierge_future_threshold(INT);

ALTER TABLE public.organizations
  DROP COLUMN IF EXISTS concierge_future_threshold_days;
