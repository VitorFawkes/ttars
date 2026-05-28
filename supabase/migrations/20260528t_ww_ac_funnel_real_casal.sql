-- ============================================================================
-- Estende ww_ac_deal_funnel_cache com dados "Realidade do casal" (Welcome Form)
--
-- Fonte: ActiveCampaign, direto da API. Cache só por performance.
--
-- Regras de preenchimento:
--   real_orcamento_raw     = Contact field 376 (textarea — preenchido pelo casal)
--   real_orcamento_parsed  = parser do texto pra número estimado em R$
--   real_convidados_raw    = Contact field 121 OU fallback Deal field 62
--   real_convidados_parsed = parser do texto pra int
--   real_convidados_fonte  = 'contact_121' | 'deal_62' | NULL
--   real_dados_synced_at   = timestamp do último sync desses campos
--
-- Universo: 155 deals com field 87 (data ganho) preenchido.
-- Sync: edge function ww-ac-funnel-sync (rastreia contato primário + fallbacks).
-- ============================================================================

ALTER TABLE public.ww_ac_deal_funnel_cache
  ADD COLUMN IF NOT EXISTS real_orcamento_raw     TEXT,
  ADD COLUMN IF NOT EXISTS real_orcamento_parsed  NUMERIC,
  ADD COLUMN IF NOT EXISTS real_convidados_raw    TEXT,
  ADD COLUMN IF NOT EXISTS real_convidados_parsed INT,
  ADD COLUMN IF NOT EXISTS real_convidados_fonte  TEXT,
  ADD COLUMN IF NOT EXISTS real_dados_synced_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_ww_ac_funnel_orcamento_parsed
  ON public.ww_ac_deal_funnel_cache(real_orcamento_parsed)
  WHERE real_orcamento_parsed IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_ww_ac_funnel_convidados_parsed
  ON public.ww_ac_deal_funnel_cache(real_convidados_parsed)
  WHERE real_convidados_parsed IS NOT NULL;

COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.real_orcamento_raw IS
  'Contact field 376 cru: "DW - Qual o orçamento que possuem para todos os eventos do casamento". Buscado direto da AC com rastreamento (primário → outros deals → email → tel).';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.real_orcamento_parsed IS
  'Valor em R$ extraído de real_orcamento_raw via parser (handles "70mil", "R$80.000,00", etc).';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.real_convidados_raw IS
  'Contact field 121 cru: "DW - Previsão nº de convidados". Fallback: Deal field 62 (Pacote WW - Nº de Convidados).';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.real_convidados_parsed IS
  'Número inteiro de convidados extraído de real_convidados_raw.';
COMMENT ON COLUMN public.ww_ac_deal_funnel_cache.real_convidados_fonte IS
  'contact_121 | deal_62 | NULL. Indica de onde veio o número.';
