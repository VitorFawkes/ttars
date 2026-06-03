-- ww_ac_deal_funnel_cache: dono do deal (AC) + consultor resolvido (CRM profile) p/ filtro do funil.
ALTER TABLE public.ww_ac_deal_funnel_cache
  ADD COLUMN IF NOT EXISTS owner_ac_id  TEXT,
  ADD COLUMN IF NOT EXISTS owner_nome   TEXT,
  ADD COLUMN IF NOT EXISTS consultor_id UUID;
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.consultor_id IS 'Profile (CRM) resolvido do dono AC por email — só p/ casar o filtro de consultor da tela. Dado do funil é 100% AC.';
