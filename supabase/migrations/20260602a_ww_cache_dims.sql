-- ============================================================================
-- ww_ac_deal_funnel_cache — adiciona as DIMENSÕES DECLARADAS (do formulário no
-- deal) que o funil precisa pra ranquear/segmentar, mantendo tudo AC-only.
--
-- faixa_raw       = Deal field 27 "Quanto você pensa em investir?*" (= ww_mkt_orcamento_form)
-- convidados_raw  = Deal field 26 "Quantas pessoas vão no seu casamento?" (= ww_mkt_convidados_form)
-- destino_raw     = Deal field 28 "Onde você quer casar?*" (= ww_mkt_destino_form)
-- tipo_casamento  = Deal field 30 "DW ou Elopment?"
--
-- (O orçamento REAL — contact 376 — é raro/inútil; a faixa do funil usa o
--  declarado do formulário, que é bem preenchido.) Aditivo.
-- ============================================================================

ALTER TABLE public.ww_ac_deal_funnel_cache
  ADD COLUMN IF NOT EXISTS faixa_raw      TEXT,
  ADD COLUMN IF NOT EXISTS convidados_raw TEXT,
  ADD COLUMN IF NOT EXISTS destino_raw    TEXT,
  ADD COLUMN IF NOT EXISTS tipo_casamento TEXT;

COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.faixa_raw IS 'Deal field 27 (orçamento declarado no form). Normalizar com _ww2_norm_faixa_strict.';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.convidados_raw IS 'Deal field 26 (convidados declarado no form). Normalizar com _ww2_norm_conv_strict.';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.destino_raw IS 'Deal field 28 (destino declarado no form). Normalizar com _ww2_norm_dest_strict.';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.tipo_casamento IS 'Deal field 30 "DW ou Elopment?".';
