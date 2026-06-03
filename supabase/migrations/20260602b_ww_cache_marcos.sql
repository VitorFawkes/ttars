-- ============================================================================
-- ww_ac_deal_funnel_cache — adiciona os 6 MARCOS do funil já calculados pelas
-- regras finais (campo 299 pro closer + andamento por etapa/funil), pra a RPC
-- do funil ficar trivial e a regra morar num lugar só. + flags de classificação.
--
-- Marcos (booleanos brutos; a RPC faz o acumulado/monotônico):
--   marco_marcou_sdr     marco_fez_sdr     marco_marcou_closer
--   marco_fez_closer     marco_ganho
-- Classificação: is_duplicado (motivo SDR='Lead duplicado'), is_fake,
--   is_elopement_pipeline (passou/está no funil Elopment 12).
--
-- Preenchidos pelo backfill (mesma lógica entra na edge function do cron).
-- Aditivo.
-- ============================================================================

ALTER TABLE public.ww_ac_deal_funnel_cache
  ADD COLUMN IF NOT EXISTS marco_marcou_sdr      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marco_fez_sdr         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marco_marcou_closer   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marco_fez_closer      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marco_ganho           BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_duplicado          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_fake               BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_elopement_pipeline BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.marco_fez_closer IS
'Realizou reunião closer = campo 299 (Vídeo/Presencial) OU avançou além de Reagendamento/1ª Reunião no Closer OU pos-venda/ganho. Calculado no sync.';
