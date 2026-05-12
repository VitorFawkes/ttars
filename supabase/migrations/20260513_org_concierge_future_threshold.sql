-- =====================================================================
-- 20260513: Adiciona organizations.concierge_future_threshold_days
--
-- Atendimentos concierge com data_vencimento > NOW() + N dias ficam na
-- aba "Agendados para o futuro" do kanban Concierge (segregados das
-- colunas ativas até estarem mais próximos da data).
--
-- Default 30 dias. A segregação é client-side em useKanbanTarefas.
-- =====================================================================

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS concierge_future_threshold_days INT NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.organizations.concierge_future_threshold_days IS
  'Atendimentos concierge com data_vencimento > NOW() + N dias ficam na aba "Agendados para o futuro" do kanban Concierge (segregados das colunas ativas).';

COMMIT;
