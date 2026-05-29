-- ============================================================================
-- ww_ac_deal_funnel_cache: extensão com campos para abas Perdas e Marketing
--
-- Motivação: pivot do Vitor (29/05) — todas as abas de Analytics-Weddings
-- devem usar o cache AC como universo único. Hoje as RPCs de Perdas e
-- Marketing dependem da tabela cards (universo CRM, que diverge da AC em
-- 1.000+ registros). Esta migration adiciona ao cache os campos da AC que
-- as 4 abas precisam — depois reescrevemos as RPCs pra consultar só o cache.
--
-- Campos adicionados:
--   - motivo_perda_closer_raw  (Deal field 47 "[WW] [Closer] Motivo de Perda")
--   - motivo_perda_sdr_raw     (Deal field 56 "SDR WT - Motivo de Perda")
--   - utm_source               (Contact field 46)
--   - utm_medium               (Contact field 47 — Contact, não Deal)
--   - utm_campaign             (Contact field 48)
--   - origem_conversao         (Contact field 137 "Origem da última conversão")
--
-- Notas operacionais:
--   - Backfill será feito invocando ww-ac-funnel-sync após este deploy,
--     com a nova versão da edge function que popula esses campos.
--   - Hooks de leitura não precisam mudar até as RPCs novas serem deployadas.
--   - Cache é GLOBAL (sem org_id), conforme decisão registrada em CLAUDE.md.
-- ============================================================================

ALTER TABLE public.ww_ac_deal_funnel_cache
  ADD COLUMN IF NOT EXISTS motivo_perda_closer_raw TEXT,
  ADD COLUMN IF NOT EXISTS motivo_perda_sdr_raw    TEXT,
  ADD COLUMN IF NOT EXISTS utm_source              TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium              TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign            TEXT,
  ADD COLUMN IF NOT EXISTS origem_conversao        TEXT;

COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.motivo_perda_closer_raw IS
  'Deal field 47 "[WW] [Closer] Motivo de Perda" (dropdown). Preenchido quando deal vai pra perdido pelo Closer.';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.motivo_perda_sdr_raw IS
  'Deal field 56 "SDR WT - Motivo de Perda" (dropdown). Preenchido quando deal vai pra perdido pelo SDR antes de avançar pro Closer.';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.utm_source IS
  'Contact field 46 "utm source" — origem do lead (ex: meta_ads, google, leadster, organic).';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.utm_medium IS
  'Contact field 47 "utm medium" — meio (ex: paid, organic, email, referral). Atenção: 47 é id do Contact, não do Deal.';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.utm_campaign IS
  'Contact field 48 "utm campaign" — nome da campanha.';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.origem_conversao IS
  'Contact field 137 "Origem da última conversão" — fonte declarada na última conversão (form, landing, etc).';

-- Índices para queries de Perdas/Marketing (cardinalidade média, ajudam GROUP BY)
CREATE INDEX IF NOT EXISTS ix_ww_ac_cache_motivo_closer ON public.ww_ac_deal_funnel_cache(motivo_perda_closer_raw)
  WHERE motivo_perda_closer_raw IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ww_ac_cache_motivo_sdr ON public.ww_ac_deal_funnel_cache(motivo_perda_sdr_raw)
  WHERE motivo_perda_sdr_raw IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ww_ac_cache_utm_source ON public.ww_ac_deal_funnel_cache(utm_source)
  WHERE utm_source IS NOT NULL;
