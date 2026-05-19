-- Migra fluxo de mensagens da aba Convidados de localStorage pra DB.
-- Cria duas tabelas per-org:
--   * fluxo_templates: variações de fluxo (nome + intervalos {promom, pade1m, pade2m})
--   * wedding_fluxo: vínculo 1:1 cards (WEDDING) → fluxo_template (start_index, start_date)
--
-- Antes desta migration, useFluxoConfig e useWeddingFluxo eram localStorage-only.
-- Cada usuário tinha sua cópia local — nada compartilhado, nada persistente.

BEGIN;

-- ────────────────────────────────────────────────────────────────────────
-- fluxo_templates
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fluxo_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  intervals JSONB NOT NULL DEFAULT '{"promom":5,"pade1m":15,"pade2m":20}'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fluxo_templates_intervals_format CHECK (
    intervals ? 'promom' AND intervals ? 'pade1m' AND intervals ? 'pade2m'
    AND (intervals->>'promom')::int BETWEEN 1 AND 365
    AND (intervals->>'pade1m')::int BETWEEN 1 AND 365
    AND (intervals->>'pade2m')::int BETWEEN 1 AND 365
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fluxo_templates_org_name_active
  ON public.fluxo_templates(org_id, name)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fluxo_templates_org
  ON public.fluxo_templates(org_id)
  WHERE deleted_at IS NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.fluxo_templates_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fluxo_templates_set_updated_at ON public.fluxo_templates;
CREATE TRIGGER trg_fluxo_templates_set_updated_at
  BEFORE UPDATE ON public.fluxo_templates
  FOR EACH ROW EXECUTE FUNCTION public.fluxo_templates_set_updated_at();

-- RLS
ALTER TABLE public.fluxo_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fluxo_templates_org_all ON public.fluxo_templates;
CREATE POLICY fluxo_templates_org_all ON public.fluxo_templates TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS fluxo_templates_service_all ON public.fluxo_templates;
CREATE POLICY fluxo_templates_service_all ON public.fluxo_templates TO service_role
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────
-- wedding_fluxo
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wedding_fluxo (
  card_id UUID PRIMARY KEY REFERENCES public.cards(id) ON DELETE CASCADE,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id) ON DELETE CASCADE,
  fluxo_template_id UUID NOT NULL REFERENCES public.fluxo_templates(id) ON DELETE RESTRICT,
  start_index INT NOT NULL CHECK (start_index BETWEEN 1 AND 35),
  start_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wedding_fluxo_org ON public.wedding_fluxo(org_id);
CREATE INDEX IF NOT EXISTS idx_wedding_fluxo_template ON public.wedding_fluxo(fluxo_template_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.wedding_fluxo_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wedding_fluxo_set_updated_at ON public.wedding_fluxo;
CREATE TRIGGER trg_wedding_fluxo_set_updated_at
  BEFORE UPDATE ON public.wedding_fluxo
  FOR EACH ROW EXECUTE FUNCTION public.wedding_fluxo_set_updated_at();

-- Trigger FK cross-org: força wedding_fluxo.org_id = cards.org_id
CREATE OR REPLACE FUNCTION public.wedding_fluxo_enforce_card_org()
RETURNS TRIGGER AS $$
DECLARE
  v_card_org UUID;
BEGIN
  SELECT org_id INTO v_card_org FROM public.cards WHERE id = NEW.card_id;
  IF v_card_org IS NULL THEN
    RAISE check_violation USING MESSAGE = format('card %s inexistente', NEW.card_id);
  END IF;
  NEW.org_id := v_card_org;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wedding_fluxo_enforce_card_org ON public.wedding_fluxo;
CREATE TRIGGER trg_wedding_fluxo_enforce_card_org
  BEFORE INSERT OR UPDATE ON public.wedding_fluxo
  FOR EACH ROW EXECUTE FUNCTION public.wedding_fluxo_enforce_card_org();

-- Trigger FK cross-org: força fluxo_template.org_id = wedding_fluxo.org_id
CREATE OR REPLACE FUNCTION public.wedding_fluxo_enforce_template_org()
RETURNS TRIGGER AS $$
DECLARE
  v_template_org UUID;
BEGIN
  SELECT org_id INTO v_template_org FROM public.fluxo_templates WHERE id = NEW.fluxo_template_id;
  IF v_template_org IS NULL THEN
    RAISE check_violation USING MESSAGE = format('fluxo_template %s inexistente', NEW.fluxo_template_id);
  END IF;
  IF v_template_org <> NEW.org_id THEN
    RAISE check_violation USING MESSAGE = format(
      'fluxo_template em org %s mas card em org %s', v_template_org, NEW.org_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wedding_fluxo_enforce_template_org ON public.wedding_fluxo;
CREATE TRIGGER trg_wedding_fluxo_enforce_template_org
  BEFORE INSERT OR UPDATE ON public.wedding_fluxo
  FOR EACH ROW EXECUTE FUNCTION public.wedding_fluxo_enforce_template_org();

-- RLS
ALTER TABLE public.wedding_fluxo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wedding_fluxo_org_all ON public.wedding_fluxo;
CREATE POLICY wedding_fluxo_org_all ON public.wedding_fluxo TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS wedding_fluxo_service_all ON public.wedding_fluxo;
CREATE POLICY wedding_fluxo_service_all ON public.wedding_fluxo TO service_role
  USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────────────
-- Grants
-- ────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fluxo_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wedding_fluxo TO authenticated;

COMMIT;
