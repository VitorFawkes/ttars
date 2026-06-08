-- ============================================================================
-- Aposenta as 2 tabelas MORTAS do Analytics Weddings (sem leitores vivos).
--
-- Verificado (grep em migrations/functions/src + checagem das defs vivas):
--   - ww_deal: espelho por-deal que NUNCA foi plugado. A camada limpa
--     (ww_funil_casal) le ww_deal_event (a jornada) + o cache, NUNCA ww_deal.
--     Nenhuma RPC/view le ww_deal. Sem FK de ww_deal_event -> ww_deal.
--   - ww_v2_casamentos_cache: cache antigo so de ganhos, congelado em 28/05.
--     As RPCs que liam (ww_v2_*) foram refatoradas pra ler cache/casal; a unica
--     referencia restante e um COMENTARIO. Nenhuma RPC viva le.
--
-- MANTIDAS (NAO dropar): ww_deal_event (a jornada — agora core, alimentada pelo
-- ww-ac-funnel-sync-incremental e lida pelo refresh_ww_funil_casal),
-- ww_ac_deal_funnel_cache, ww_funil_casal.
--
-- Obs: o edge function ww-v2-sync-casamentos (que escrevia em ww_v2) fica orfao,
-- mas nao roda em cron (congelado) — inofensivo. Sera removido a parte se util.
-- ============================================================================

DROP TABLE IF EXISTS public.ww_deal;
DROP TABLE IF EXISTS public.ww_v2_casamentos_cache;
