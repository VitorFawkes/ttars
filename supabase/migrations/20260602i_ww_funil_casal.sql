-- ============================================================================
-- ww_funil_casal — tabela de ANALYTICS do funil Weddings, 1 linha por CASAL (contato).
-- É a CAMADA DERIVADA: cada marco/data é CALCULADO a partir do andamento cru
-- (ww_deal_event) + campos do Active (ww_ac_deal_funnel_cache). Nunca o contrário.
-- O painel lê daqui. As datas de etapa ficam guardadas (alimentam os marcos e a auditoria).
-- AC-only. Per-org (RLS). Recalculada por refresh_ww_funil_casal() — pode rodar
-- quantas vezes quiser sem re-buscar no AC, pois o andamento já está no banco.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ww_funil_casal (
    org_id          UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
    contact_id      TEXT PRIMARY KEY,
    deal_title      TEXT,
    tipo            TEXT,                       -- 'DW' | 'Elopement'
    is_elopement    BOOLEAN DEFAULT FALSE,

    lead_created_at TIMESTAMPTZ,                -- pra cohort

    -- DATAS DE ETAPA (derivadas do andamento — dado próprio, alimentam os marcos)
    entrou_closer_at            TIMESTAMPTZ,
    entrou_1a_reuniao_at        TIMESTAMPTZ,
    entrou_contrato_enviado_at  TIMESTAMPTZ,
    entrou_negociacao_at        TIMESTAMPTZ,
    entrou_op_futura_at         TIMESTAMPTZ,
    entrou_planejamento_at      TIMESTAMPTZ,
    entrou_producao_at          TIMESTAMPTZ,
    entrou_controle_at          TIMESTAMPTZ,
    elopement_assinatura_at     TIMESTAMPTZ,    -- etapa Assinatura/Ganho do Elopement

    -- CAMPOS DO ACTIVE (espelho)
    sdr_agendou_at    TIMESTAMPTZ,
    sdr_canal         TEXT,
    closer_agendou_at TIMESTAMPTZ,
    closer_canal      TEXT,

    -- MARCOS (derivados) — bool + data + fonte ('campo' | 'andamento')
    agendou_sdr     BOOLEAN DEFAULT FALSE, agendou_sdr_at    TIMESTAMPTZ,
    fez_sdr         BOOLEAN DEFAULT FALSE, fez_sdr_at        TIMESTAMPTZ, fez_sdr_fonte    TEXT,
    agendou_closer  BOOLEAN DEFAULT FALSE, agendou_closer_at TIMESTAMPTZ, agendou_closer_fonte TEXT,
    fez_closer      BOOLEAN DEFAULT FALSE, fez_closer_at     TIMESTAMPTZ, fez_closer_fonte TEXT,
    ganho           BOOLEAN DEFAULT FALSE, ganho_at          TIMESTAMPTZ, ganho_fonte      TEXT,

    is_perdido      BOOLEAN DEFAULT FALSE,
    refreshed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ww_funil_casal IS
'Analytics do funil Weddings, 1 linha por casal (contato). Camada DERIVADA do andamento cru (ww_deal_event) + campos do Active. O painel le daqui. Recalculavel por refresh_ww_funil_casal() sem re-buscar no AC.';

CREATE INDEX IF NOT EXISTS ix_ww_funil_casal_org    ON public.ww_funil_casal (org_id);
CREATE INDEX IF NOT EXISTS ix_ww_funil_casal_ganho  ON public.ww_funil_casal (org_id, ganho_at);
CREATE INDEX IF NOT EXISTS ix_ww_funil_casal_lead   ON public.ww_funil_casal (org_id, lead_created_at);

ALTER TABLE public.ww_funil_casal ENABLE ROW LEVEL SECURITY;

CREATE POLICY ww_funil_casal_org_all ON public.ww_funil_casal TO authenticated
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

CREATE POLICY ww_funil_casal_service_all ON public.ww_funil_casal TO service_role
    USING (true) WITH CHECK (true);
