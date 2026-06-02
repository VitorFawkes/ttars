-- ============================================================================
-- ww_deal_event — ANDAMENTO CRU do funil Weddings (espelho do ActiveCampaign).
-- A tabela JÁ EXISTE (criada antes): id, ac_deal_id, kind, from_id/from_label,
-- to_id/to_label, event_ts, by_user, by_automation, ac_activity_id, org_id.
-- Ajuste ADITIVO: adiciona contact_id (pra rollup por casal) + índice.
-- Recarga completa/corrigida (de-truncada + esteiras migradas) é feita por upsert
-- via REST (ac_activity_id é UNIQUE → idempotente). Fonte de verdade dos marcos.
-- ============================================================================

ALTER TABLE public.ww_deal_event
  ADD COLUMN IF NOT EXISTS contact_id TEXT;

CREATE INDEX IF NOT EXISTS ix_ww_deal_event_contact ON public.ww_deal_event (contact_id);
CREATE INDEX IF NOT EXISTS ix_ww_deal_event_deal2   ON public.ww_deal_event (ac_deal_id);

COMMENT ON TABLE public.ww_deal_event IS
'Andamento cru do funil Weddings (espelho do ActiveCampaign). 1 linha por movimentacao (etapa/esteira/status) de cada deal, com data (event_ts) e id unico (ac_activity_id). Fonte de verdade para derivar os marcos do funil por casal. AC-only.';
