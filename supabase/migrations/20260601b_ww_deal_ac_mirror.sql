-- ============================================================================
-- ww_deal + ww_deal_event — espelho DURÁVEL do funil Weddings no ActiveCampaign.
--
-- PRINCÍPIO: Analytics-Weddings é AC-only. Estas tabelas são alimentadas
-- EXCLUSIVAMENTE pela API do ActiveCampaign (deals + dealActivities +
-- dealCustomFieldData). NÃO usar CRM/cards/produto_data/historico_fases como
-- fonte. Ver memory/feedback_weddings_analytics_ac_only.md + plano §11.
--
-- ww_deal       = 1 linha por deal do AC (snapshot + marcos por campo E por
--                 andamento + status + classificação + flags de qualidade).
-- ww_deal_event = 1 linha por movimento (timeline crua: cada mudança de etapa
--                 ou funil, com data). Nada se perde; recomputável.
--
-- Aditivo (tabelas novas). Não altera nada existente. RLS por org_id.
-- ============================================================================

-- ---- ww_deal --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ww_deal (
    ac_deal_id              TEXT PRIMARY KEY,
    org_id                  UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
    contact_id              TEXT,
    contact_email           TEXT,
    deal_title              TEXT,
    -- estado atual no AC
    current_group_id        INT,
    current_group           TEXT,
    current_stage_id        INT,
    current_stage           TEXT,
    ac_status               INT,            -- 0 aberto / 1 ganho / 2 perdido
    ac_deleted              BOOLEAN DEFAULT FALSE,
    deal_created_at         TIMESTAMPTZ,
    deal_updated_at         TIMESTAMPTZ,
    -- marcos — pelo CAMPO
    agendou_sdr_field_at    TIMESTAMPTZ,
    realizou_sdr            BOOLEAN,
    realizou_sdr_canal      TEXT,
    qualificou_field_at     TIMESTAMPTZ,    -- guardado p/ referência (não é etapa do funil)
    agendou_closer_field_at TIMESTAMPTZ,
    realizou_closer         BOOLEAN,
    realizou_closer_canal   TEXT,
    ganho_field_at          TIMESTAMPTZ,
    -- marcos — pelo ANDAMENTO (histórico)
    passou_sdr              BOOLEAN DEFAULT FALSE,
    passou_closer           BOOLEAN DEFAULT FALSE,
    passou_planejamento     BOOLEAN DEFAULT FALSE,
    passou_elopement        BOOLEAN DEFAULT FALSE,
    entrou_planejamento_at  TIMESTAMPTZ,
    -- marcos — ATINGIU (campo OU andamento) = melhor estimativa
    atingiu_agendou_sdr     BOOLEAN DEFAULT FALSE,
    atingiu_realizou_sdr    BOOLEAN DEFAULT FALSE,
    atingiu_agendou_closer  BOOLEAN DEFAULT FALSE,
    atingiu_realizou_closer BOOLEAN DEFAULT FALSE,
    atingiu_ganho           BOOLEAN DEFAULT FALSE,
    cancelado               BOOLEAN DEFAULT FALSE,
    cancelado_at            TIMESTAMPTZ,
    -- classificação
    is_elopement_pipeline   BOOLEAN DEFAULT FALSE,
    is_elopement_field      BOOLEAN DEFAULT FALSE,
    tipo_casamento          TEXT,
    is_perdido              BOOLEAN DEFAULT FALSE,
    is_duplicado            BOOLEAN DEFAULT FALSE,
    is_fake                 BOOLEAN DEFAULT FALSE,
    motivo_perda_sdr        TEXT,
    motivo_perda_closer     TEXT,
    -- campos de contrato / validação (do AC)
    valor_fechado           NUMERIC,
    cerimonial              TEXT,
    pacote_convidados       TEXT,
    monde_venda             TEXT,
    faixa_orcamento         TEXT,
    convidados_form         TEXT,
    destino_form            TEXT,
    -- qualidade do dado
    dq_flags                JSONB DEFAULT '[]'::JSONB,  -- [{marco, tipo}] divergências campo×andamento
    confianca_score         INT,
    synced_at               TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ww_deal_org    ON public.ww_deal(org_id);
CREATE INDEX IF NOT EXISTS ix_ww_deal_group  ON public.ww_deal(current_group_id);
CREATE INDEX IF NOT EXISTS ix_ww_deal_status ON public.ww_deal(ac_status);

ALTER TABLE public.ww_deal ENABLE ROW LEVEL SECURITY;
CREATE POLICY ww_deal_org_all ON public.ww_deal TO authenticated
    USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY ww_deal_service_all ON public.ww_deal TO service_role
    USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ww_deal IS
'Espelho por-deal do funil Weddings no ActiveCampaign (AC-only). Alimentado SO pela API do AC (deals+dealActivities+dealCustomFieldData). NUNCA usar CRM/cards como fonte. Ver memory/feedback_weddings_analytics_ac_only.md';

-- ---- ww_deal_event (timeline crua) ----------------------------------------
CREATE TABLE IF NOT EXISTS public.ww_deal_event (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    org_id          UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
    ac_deal_id      TEXT NOT NULL,
    ac_activity_id  TEXT UNIQUE,        -- idempotência do sync
    event_ts        TIMESTAMPTZ,
    kind            TEXT,               -- 'funil' | 'etapa'
    from_id         TEXT,
    to_id           TEXT,
    from_label      TEXT,
    to_label        TEXT,
    by_user         TEXT,
    by_automation   BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS ix_ww_event_deal ON public.ww_deal_event(ac_deal_id);
CREATE INDEX IF NOT EXISTS ix_ww_event_org  ON public.ww_deal_event(org_id);
CREATE INDEX IF NOT EXISTS ix_ww_event_ts   ON public.ww_deal_event(event_ts);

ALTER TABLE public.ww_deal_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY ww_deal_event_org_all ON public.ww_deal_event TO authenticated
    USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
CREATE POLICY ww_deal_event_service_all ON public.ww_deal_event TO service_role
    USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ww_deal_event IS
'Timeline crua de mudancas de etapa/funil de cada deal Weddings (dealActivities do AC). AC-only.';
