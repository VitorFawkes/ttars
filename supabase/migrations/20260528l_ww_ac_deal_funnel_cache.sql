-- ============================================================================
-- ww_ac_deal_funnel_cache — Espelho dos marcos do funil Weddings direto da AC
--
-- Fonte: ActiveCampaign /api/3/dealCustomFieldData (paginação completa)
--
-- Regras de marco (espelhando AC literalmente):
--   sdr_agendou  = field 6 (datetime) preenchido
--   sdr_fez      = field 17 (multiselect) preenchido COM valor real e NÃO contém "Não teve reunião"
--   closer_agen  = field 18 (datetime) preenchido
--   closer_fez   = field 299 (dropdown) preenchido E ≠ "Não teve reunião"
--   ganho        = field 87 (datetime, "WW Closer Data-Hora Ganho") preenchido
--
-- Escopo Weddings = pipeline group ∈ {1,3,4,5,9,10,11,12,14,17,18,19,21,22,23}
--   (exclui Trips puros: 6 Consultoras TRIPS, 8 SDR Trips, 16 Weex Pass,
--    20 Extras Viagem, 24 Concierge +50k)
--
-- Sync: edge function `ww-ac-funnel-sync` (bootstrap + incremental a cada 30min).
-- Tabela é GLOBAL (sem org_id), igual ao padrão de ww_v2_casamentos_cache.
-- Leitura restrita por policy ao workspace Welcome Weddings.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ww_ac_deal_funnel_cache (
  ac_deal_id        TEXT PRIMARY KEY,
  contact_id        TEXT,
  pipeline_group_id INT,
  is_ww             BOOLEAN NOT NULL DEFAULT FALSE,
  deal_title        TEXT,
  -- SDR
  sdr_agendou_at    TIMESTAMPTZ,
  sdr_fez           BOOLEAN NOT NULL DEFAULT FALSE,
  sdr_canal         TEXT[],
  -- Closer
  closer_agendou_at TIMESTAMPTZ,
  closer_fez        BOOLEAN NOT NULL DEFAULT FALSE,
  closer_canal      TEXT,
  -- Ganho
  ganho_at          TIMESTAMPTZ,
  -- Meta
  synced_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_ww_ac_funnel_contact     ON public.ww_ac_deal_funnel_cache(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ww_ac_funnel_is_ww       ON public.ww_ac_deal_funnel_cache(is_ww) WHERE is_ww;
CREATE INDEX IF NOT EXISTS ix_ww_ac_funnel_ganho_at    ON public.ww_ac_deal_funnel_cache(ganho_at) WHERE ganho_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_ww_ac_funnel_sdr_agendou ON public.ww_ac_deal_funnel_cache(sdr_agendou_at) WHERE sdr_agendou_at IS NOT NULL;

COMMENT ON TABLE public.ww_ac_deal_funnel_cache IS
  'Espelho dos marcos do funil Weddings direto da AC. Populado pela edge function ww-ac-funnel-sync. Tabela GLOBAL (sem org_id) — leitura restrita por policy ao workspace Welcome Weddings (mesmo padrão de ww_v2_casamentos_cache).';

ALTER TABLE public.ww_ac_deal_funnel_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ww_ac_funnel_service_all ON public.ww_ac_deal_funnel_cache;
CREATE POLICY ww_ac_funnel_service_all ON public.ww_ac_deal_funnel_cache
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ww_ac_funnel_authenticated_read ON public.ww_ac_deal_funnel_cache;
CREATE POLICY ww_ac_funnel_authenticated_read ON public.ww_ac_deal_funnel_cache
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organizations o
      WHERE o.id = requesting_org_id()
        AND (o.slug = 'welcome-weddings'
             OR o.parent_org_id IN (SELECT id FROM organizations WHERE slug = 'welcome-group'))
    )
  );

-- ============================================================================
-- View: vw_ww_card_marcos — JOIN cards + ww_ac_deal_funnel_cache via external_id
--
-- Materializa por card_id os 5 marcos canônicos. Usada pelas RPCs do funil.
-- Cards sem external_id (criados manualmente) ficam com marcos=FALSE
-- (não estão na AC, logo não estão no funil AC).
-- ============================================================================

DROP VIEW IF EXISTS public.vw_ww_card_marcos CASCADE;
CREATE VIEW public.vw_ww_card_marcos AS
SELECT
  c.id                        AS card_id,
  c.org_id,
  c.external_id               AS ac_deal_id,
  COALESCE(fc.sdr_agendou_at IS NOT NULL, FALSE)    AS marcou_sdr,
  COALESCE(fc.sdr_fez, FALSE)                       AS fez_sdr,
  COALESCE(fc.closer_agendou_at IS NOT NULL, FALSE) AS marcou_closer,
  COALESCE(fc.closer_fez, FALSE)                    AS fez_closer,
  COALESCE(fc.ganho_at IS NOT NULL, FALSE)          AS ganho,
  fc.sdr_agendou_at,
  fc.closer_agendou_at,
  fc.ganho_at,
  fc.sdr_canal,
  fc.closer_canal
FROM cards c
LEFT JOIN ww_ac_deal_funnel_cache fc
  ON fc.ac_deal_id = c.external_id
 AND c.external_source = 'active_campaign'
WHERE c.deleted_at IS NULL
  AND c.archived_at IS NULL
  AND c.produto::TEXT = 'WEDDING';

COMMENT ON VIEW public.vw_ww_card_marcos IS
  'Marcos canônicos do funil Weddings por card_id, espelhados da AC via ww_ac_deal_funnel_cache. Fonte de verdade para todas as RPCs de Analytics-Weddings.';

GRANT SELECT ON public.vw_ww_card_marcos TO authenticated, anon;
