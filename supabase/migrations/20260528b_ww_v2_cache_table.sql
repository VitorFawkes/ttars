-- ============================================================================
-- Analytics-Weddings v2 — Cache de Casamentos Fechados (fonte AC direto)
--
-- Por quê:
-- A fonte atual (cards.produto_data->>'ww_closer_data_ganho') só tem 69 cards.
-- O critério usado pelo site weddings-kpi.vercel.app (validado via reverse-eng
-- do bundle JS) retorna 152 deals fechados:
--   `data_fechamento IS NOT NULL OR ww_closer_data_hora_ganho IS NOT NULL`
--   excluindo motivos_qualificacao_sdr = 'Para closer ter mais reuniões'
--
-- Esta tabela armazena, por CONTATO ganho:
--   - Entrada (form site): faixa orçamento + convidados + destino declarado
--   - Realidade (vendido): pacote convidados, destino refinado, valor assess, Monde
--   - Realidade complementar (só AC API):
--     * contact field 376 — "DW - Qual o orçamento total do casamento" (26 dos 152)
--     * contact field 121 — "DW - Previsão nº de convidados" (66 dos 152)
--   - Fonte do lead, deal_ids relacionados, raw payload
--
-- Sync: edge function `ww-v2-sync-casamentos` (bootstrap + incremental).
-- ============================================================================

-- Tabela é GLOBAL por design (catálogo de ganhos AC, não por-org).
-- Welcome Weddings é a única org que consome — RLS isola por org via RPC SECURITY DEFINER.
CREATE TABLE IF NOT EXISTS public.ww_v2_casamentos_cache (
  contact_id              TEXT PRIMARY KEY,
  deal_ganho_id           TEXT NOT NULL,
  data_ganho              TIMESTAMPTZ,
  pipeline_ganho          TEXT,
  contato_nome            TEXT,
  contato_email           TEXT,
  -- ENTRADA (form site, vem do deal SDR/Closer original do contato)
  entrada_invest          TEXT,
  entrada_conv            TEXT,
  entrada_destino         TEXT,
  -- REALIDADE (deal-level)
  real_pacote_conv        INT,
  real_destino            TEXT,
  real_num_conv           INT,
  real_valor_assess       NUMERIC,
  real_monde              TEXT,
  -- REALIDADE (contact-level — só AC API, não vem no espelho)
  real_orcamento_total    TEXT,
  real_previsao_conv      TEXT,
  -- Origem / atribuição
  fonte_lead              TEXT,
  -- Auditoria + payload bruto pra debug
  deal_ids                TEXT[],
  raw_data                JSONB,
  synced_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ww_v2_cache_data_ganho
  ON public.ww_v2_casamentos_cache (data_ganho DESC);

CREATE INDEX IF NOT EXISTS idx_ww_v2_cache_synced_at
  ON public.ww_v2_casamentos_cache (synced_at DESC);

COMMENT ON TABLE public.ww_v2_casamentos_cache IS
  'GLOBAL — cache de casamentos fechados do AC (universo definido pelo critério weddings-kpi.vercel.app). '
  'Populado pela edge function ww-v2-sync-casamentos. Não tem org_id pois é catálogo derivado do AC. '
  'Acesso via RPCs SECURITY DEFINER que validam org_id.';

-- RLS: bloquear acesso direto, exigir RPC
ALTER TABLE public.ww_v2_casamentos_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ww_v2_cache_service_all ON public.ww_v2_casamentos_cache;
CREATE POLICY ww_v2_cache_service_all ON public.ww_v2_casamentos_cache
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ww_v2_cache_authenticated_read ON public.ww_v2_casamentos_cache;
CREATE POLICY ww_v2_cache_authenticated_read ON public.ww_v2_casamentos_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = requesting_org_id()
        AND (o.slug = 'welcome-weddings'
             OR o.parent_org_id IN (SELECT id FROM organizations WHERE slug = 'welcome-group'))
    )
  );
