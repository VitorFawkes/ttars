-- Feature: Convidados — wedding guests management (foundation)
--
-- Cria a tabela `wedding_guests` (per-org, FK em cards) com RLS, trigger
-- FK-cross-org strict (org_id é sempre derivada do card pai) e seed do
-- casamento mock "EU E ELA TESTE LOUCURA" no pipeline WEDDING da org
-- Welcome Weddings.
--
-- Esta migration é foundation-only. Mensageria (last_contacted_at,
-- messages_sent), importação CSV e métricas avançadas ficam para fases
-- posteriores — o schema deixa espaço para extensão sem breaking changes.

BEGIN;

-- ── Tabela ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wedding_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  status_rsvp TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status_rsvp IN ('pendente','confirmado','recusado','talvez')),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_wedding_guests_card_id ON public.wedding_guests(card_id);
CREATE INDEX IF NOT EXISTS idx_wedding_guests_org_id ON public.wedding_guests(org_id);
CREATE INDEX IF NOT EXISTS idx_wedding_guests_card_status ON public.wedding_guests(card_id, status_rsvp);

-- ── updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wedding_guests_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_guests_updated_at ON public.wedding_guests;
CREATE TRIGGER trg_wedding_guests_updated_at
  BEFORE UPDATE ON public.wedding_guests
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_guests_set_updated_at();

-- ── FK-cross-org strict trigger ───────────────────────────────────────────
-- Modelo: 20260414_h3_029_cadence_steps_strict_template_org.sql
-- Sem isto, mesmo com RLS, contexto privilegiado conseguiria materializar
-- linhas onde wedding_guests.org_id ≠ cards.org_id.
CREATE OR REPLACE FUNCTION public.auto_set_wedding_guests_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  card_org UUID;
BEGIN
  SELECT org_id INTO card_org
  FROM public.cards
  WHERE id = NEW.card_id;

  IF card_org IS NULL THEN
    RAISE EXCEPTION 'wedding_guests: card_id % não encontrado em cards', NEW.card_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> card_org THEN
    RAISE EXCEPTION 'wedding_guests.org_id (%) diverge de cards.org_id (%) para card %',
      NEW.org_id, card_org, NEW.card_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := card_org;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_guests_strict_org ON public.wedding_guests;
CREATE TRIGGER trg_wedding_guests_strict_org
  BEFORE INSERT OR UPDATE OF card_id, org_id ON public.wedding_guests
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_wedding_guests_org_id();

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.wedding_guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wedding_guests_org_all" ON public.wedding_guests;
CREATE POLICY "wedding_guests_org_all" ON public.wedding_guests
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS "wedding_guests_service_all" ON public.wedding_guests;
CREATE POLICY "wedding_guests_service_all" ON public.wedding_guests
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ── Seed do casamento mock (idempotente, sem UUID hardcoded) ──────────────
DO $$
DECLARE
  v_org UUID;
  v_pipeline UUID;
  v_stage UUID;
  v_existing UUID;
  v_new_card UUID;
BEGIN
  SELECT id INTO v_org
  FROM public.organizations
  WHERE slug = 'welcome-weddings';

  IF v_org IS NULL THEN
    RAISE NOTICE 'wedding_guests seed: org welcome-weddings não encontrada — skip';
    RETURN;
  END IF;

  SELECT id INTO v_pipeline
  FROM public.pipelines
  WHERE org_id = v_org AND produto = 'WEDDING'
  LIMIT 1;

  IF v_pipeline IS NULL THEN
    RAISE NOTICE 'wedding_guests seed: pipeline WEDDING não encontrado para org % — skip', v_org;
    RETURN;
  END IF;

  SELECT id INTO v_stage
  FROM public.pipeline_stages
  WHERE pipeline_id = v_pipeline
  ORDER BY ordem
  LIMIT 1;

  IF v_stage IS NULL THEN
    RAISE NOTICE 'wedding_guests seed: nenhum stage no pipeline % — skip', v_pipeline;
    RETURN;
  END IF;

  SELECT id INTO v_existing
  FROM public.cards
  WHERE org_id = v_org AND titulo = 'EU E ELA TESTE LOUCURA'
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE NOTICE 'wedding_guests seed: card mock já existe (id=%) — skip', v_existing;
    RETURN;
  END IF;

  INSERT INTO public.cards (titulo, produto, org_id, pipeline_id, pipeline_stage_id)
  VALUES ('EU E ELA TESTE LOUCURA', 'WEDDING', v_org, v_pipeline, v_stage)
  RETURNING id INTO v_new_card;

  RAISE NOTICE 'wedding_guests seed: card mock criado id=% no stage=%', v_new_card, v_stage;
END $$;

-- ── Validação pós-migration ───────────────────────────────────────────────
DO $$
DECLARE
  has_table BOOLEAN;
  has_rls BOOLEAN;
  policy_count INTEGER;
  trigger_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'wedding_guests'
  ) INTO has_table;

  IF NOT has_table THEN
    RAISE EXCEPTION 'wedding_guests: tabela não foi criada';
  END IF;

  SELECT relrowsecurity INTO has_rls
  FROM pg_class
  WHERE relname = 'wedding_guests' AND relnamespace = 'public'::regnamespace;

  IF NOT has_rls THEN
    RAISE EXCEPTION 'wedding_guests: RLS não está habilitada';
  END IF;

  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'wedding_guests';

  IF policy_count < 2 THEN
    RAISE EXCEPTION 'wedding_guests: esperado 2 policies, encontrado %', policy_count;
  END IF;

  SELECT COUNT(*) INTO trigger_count
  FROM pg_trigger
  WHERE tgrelid = 'public.wedding_guests'::regclass
    AND NOT tgisinternal;

  IF trigger_count < 2 THEN
    RAISE EXCEPTION 'wedding_guests: esperado >=2 triggers (updated_at + strict_org), encontrado %', trigger_count;
  END IF;

  RAISE NOTICE 'wedding_guests: validação OK (RLS=%, policies=%, triggers=%)', has_rls, policy_count, trigger_count;
END $$;
