-- ww_ac_deal_funnel_cache: data de criação do deal (cdate do AC) — pra coorte no funil.
ALTER TABLE public.ww_ac_deal_funnel_cache
  ADD COLUMN IF NOT EXISTS deal_created_at TIMESTAMPTZ;
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.deal_created_at IS 'cdate do deal no AC (entrada do lead). Usado pra coorte no funil.';
