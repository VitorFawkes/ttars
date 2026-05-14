-- ============================================================================
-- MIGRATION: nps_surveys + nps_responses — feature de NPS per-card per-org
-- Date: 2026-05-14
--
-- Cria duas tabelas para suportar a nova aba "NPS" na sidebar:
--  - nps_surveys: registra cada pesquisa enviada (1 por card, idealmente)
--  - nps_responses: registra a resposta recebida (via webhook futuro)
--
-- Ambas seguem o padrão multi-tenant do projeto:
--   • org_id NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id)
--   • RLS habilitada com policy per-org (USING (org_id = requesting_org_id()))
--   • Trigger BEFORE INSERT/UPDATE força org_id = card.org_id (regra
--     "FK cross-org = bomba" do CLAUDE.md). Sem isso, uma resposta criada
--     em uma org poderia apontar para um card de outra org via FK direta.
--
-- Webhook de ingestão será adicionado depois — esta migration cria só o
-- modelo de dados + isolamento. Inserts manuais via service_role já
-- funcionam para popular dados de teste.
-- ============================================================================

BEGIN;

-- ------------------------------------------------------------------
-- Tabela 1: nps_surveys (pesquisa enviada)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nps_surveys (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  card_id              UUID REFERENCES public.cards(id) ON DELETE CASCADE,
  contact_id           UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
  channel              TEXT NOT NULL DEFAULT 'unknown',
  token                UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  sent_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID REFERENCES auth.users(id),
  source_external_id   TEXT,
  CONSTRAINT nps_surveys_channel_chk CHECK (channel IN ('email','whatsapp','sms','form','unknown'))
);

CREATE INDEX IF NOT EXISTS idx_nps_surveys_org  ON public.nps_surveys(org_id);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_card ON public.nps_surveys(card_id);
CREATE INDEX IF NOT EXISTS idx_nps_surveys_sent ON public.nps_surveys(org_id, sent_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_nps_surveys_source_external
  ON public.nps_surveys(source_external_id)
  WHERE source_external_id IS NOT NULL;

-- ------------------------------------------------------------------
-- Tabela 2: nps_responses (resposta recebida)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nps_responses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    UUID NOT NULL REFERENCES public.nps_surveys(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  card_id      UUID REFERENCES public.cards(id) ON DELETE CASCADE,
  score        INT  NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment      TEXT,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload  JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_nps_response_per_survey ON public.nps_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_nps_responses_org       ON public.nps_responses(org_id);
CREATE INDEX IF NOT EXISTS idx_nps_responses_card      ON public.nps_responses(card_id);
CREATE INDEX IF NOT EXISTS idx_nps_responses_responded ON public.nps_responses(org_id, responded_at DESC);

-- ------------------------------------------------------------------
-- Triggers de isolamento cross-org
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.nps_surveys_enforce_card_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_card_org UUID;
BEGIN
  -- Sem card vinculado: org_id deve ter sido fornecido explicitamente
  -- (typically pelo backfill ou por webhook anônimo)
  IF NEW.card_id IS NULL THEN
    IF NEW.org_id IS NULL THEN
      RAISE EXCEPTION 'nps_surveys: org_id obrigatorio quando card_id e NULL';
    END IF;
    RETURN NEW;
  END IF;

  SELECT org_id INTO v_card_org FROM public.cards WHERE id = NEW.card_id;
  IF v_card_org IS NULL THEN
    RAISE EXCEPTION 'nps_surveys: card_id % nao encontrado', NEW.card_id;
  END IF;
  NEW.org_id := v_card_org;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nps_surveys_enforce_card_org ON public.nps_surveys;
CREATE TRIGGER trg_nps_surveys_enforce_card_org
  BEFORE INSERT OR UPDATE ON public.nps_surveys
  FOR EACH ROW EXECUTE FUNCTION public.nps_surveys_enforce_card_org();

CREATE OR REPLACE FUNCTION public.nps_responses_enforce_survey_org()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE v_survey RECORD;
BEGIN
  SELECT org_id, card_id INTO v_survey FROM public.nps_surveys WHERE id = NEW.survey_id;
  IF v_survey IS NULL THEN
    RAISE EXCEPTION 'nps_responses: survey_id % nao encontrado', NEW.survey_id;
  END IF;
  NEW.org_id  := v_survey.org_id;
  NEW.card_id := v_survey.card_id;  -- pode ser NULL (resposta sem card vinculado)
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nps_responses_enforce_survey_org ON public.nps_responses;
CREATE TRIGGER trg_nps_responses_enforce_survey_org
  BEFORE INSERT OR UPDATE ON public.nps_responses
  FOR EACH ROW EXECUTE FUNCTION public.nps_responses_enforce_survey_org();

-- ------------------------------------------------------------------
-- RLS policies (nunca USING (true) para authenticated)
-- ------------------------------------------------------------------
ALTER TABLE public.nps_surveys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nps_surveys_org_all     ON public.nps_surveys;
DROP POLICY IF EXISTS nps_surveys_service_all ON public.nps_surveys;
CREATE POLICY nps_surveys_org_all ON public.nps_surveys
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY nps_surveys_service_all ON public.nps_surveys
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS nps_responses_org_all     ON public.nps_responses;
DROP POLICY IF EXISTS nps_responses_service_all ON public.nps_responses;
CREATE POLICY nps_responses_org_all ON public.nps_responses
  AS PERMISSIVE FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());
CREATE POLICY nps_responses_service_all ON public.nps_responses
  AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------
-- Grants (REST/PostgREST precisa para detectar tabela)
-- ------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nps_surveys   TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nps_responses TO authenticated;
GRANT ALL ON public.nps_surveys   TO service_role;
GRANT ALL ON public.nps_responses TO service_role;

COMMIT;
