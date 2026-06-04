-- ============================================================================
-- Cron: refresh_ww_funil_casal() a cada 30 min (em :10 e :40).
--
-- A camada limpa (ww_funil_casal) e DERIVADA do cache (ww_ac_deal_funnel_cache)
-- + a jornada (ww_deal_event). Ate agora so era recalculada NA MAO. Este cron a
-- mantem fresca sozinha, ~10 min DEPOIS do ww-ac-funnel-sync (que roda em :00 e
-- :30), pra ja pegar o cache atualizado.
--
-- refresh_ww_funil_casal() e SECURITY DEFINER e opera na org Welcome Weddings.
-- ============================================================================

SELECT cron.unschedule('ww-refresh-funil-casal')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ww-refresh-funil-casal');

SELECT cron.schedule(
  'ww-refresh-funil-casal',
  '10,40 * * * *',
  $$ SELECT public.refresh_ww_funil_casal(); $$
);
