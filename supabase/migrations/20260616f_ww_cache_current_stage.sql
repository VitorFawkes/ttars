-- 20260616f_ww_cache_current_stage.sql
--
-- Parte B (etapa atual confiável): a "etapa atual do casal" hoje é derivada da timeline
-- ww_deal_event (last_stage), que está INCOMPLETA — não captura todas as transições de etapa
-- do Active. Resultado: "Onde estão agora" (StandBy etc) diverge do Active (25 vs ~64).
--
-- Fonte confiável = deal.stage do Active (etapa atual do deal), que o sync já recebe mas não
-- grava. Esta migration adiciona a coluna; o sync (edge functions) passa a gravá-la e as RPCs
-- passam a lê-la. Backfill via re-sync (bootstrap).

ALTER TABLE public.ww_ac_deal_funnel_cache
  ADD COLUMN IF NOT EXISTS ac_current_stage_id TEXT;

COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.ac_current_stage_id IS
  'Etapa atual do deal no Active (deal.stage), gravada pelo sync. Fonte confiável da "posição '
  'atual" do casal — substitui o last_stage derivado da timeline ww_deal_event (incompleta).';

-- Índice parcial p/ as consultas do Analytics WW (posição atual por esteira/etapa).
CREATE INDEX IF NOT EXISTS idx_ww_cache_current_stage
  ON public.ww_ac_deal_funnel_cache (pipeline_group_id, ac_current_stage_id)
  WHERE is_ww;
