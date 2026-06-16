-- Feature: Planejamento — etapa de planejamento por casamento
--
-- Cria uma tabela 1:1 com `cards` (apenas WEDDING usa, mas a FK é genérica)
-- para guardar em qual etapa do board "Planejamento Weddings" (espelho do
-- ActiveCampaign pipeline 4) o casamento está:
--   boas_vindas | onboarding | propostas | definicao | passagem | aditivo
--
-- Default = 'boas_vindas'. Quando o card ainda não tem linha, o frontend
-- deriva a coluna a partir da etapa pos_venda atual (fallback). Mutação cria
-- via UPSERT no primeiro arrasto.
--
-- Per-org com FK-cross-org strict como em wedding_convidados_state / wedding_guests.

BEGIN;

CREATE TABLE IF NOT EXISTS public.wedding_planejamento_state (
  card_id UUID PRIMARY KEY REFERENCES public.cards(id) ON DELETE CASCADE,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  etapa TEXT NOT NULL DEFAULT 'boas_vindas'
    CHECK (etapa IN ('boas_vindas','onboarding','propostas','definicao','passagem','aditivo')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_wedding_planejamento_state_org_id ON public.wedding_planejamento_state(org_id);
CREATE INDEX IF NOT EXISTS idx_wedding_planejamento_state_etapa ON public.wedding_planejamento_state(etapa);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.wedding_planejamento_state_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_planejamento_state_updated_at ON public.wedding_planejamento_state;
CREATE TRIGGER trg_wedding_planejamento_state_updated_at
  BEFORE UPDATE ON public.wedding_planejamento_state
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_planejamento_state_set_updated_at();

-- FK-cross-org strict (mesmo padrão de wedding_convidados_state / cadence_steps)
CREATE OR REPLACE FUNCTION public.auto_set_wedding_planejamento_state_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  card_org UUID;
BEGIN
  SELECT org_id INTO card_org FROM public.cards WHERE id = NEW.card_id;

  IF card_org IS NULL THEN
    RAISE EXCEPTION 'wedding_planejamento_state: card_id % não encontrado em cards', NEW.card_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> card_org THEN
    RAISE EXCEPTION 'wedding_planejamento_state.org_id (%) diverge de cards.org_id (%) para card %',
      NEW.org_id, card_org, NEW.card_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := card_org;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_planejamento_state_strict_org ON public.wedding_planejamento_state;
CREATE TRIGGER trg_wedding_planejamento_state_strict_org
  BEFORE INSERT OR UPDATE OF card_id, org_id ON public.wedding_planejamento_state
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_wedding_planejamento_state_org_id();

-- RLS
ALTER TABLE public.wedding_planejamento_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wedding_planejamento_state_org_all" ON public.wedding_planejamento_state;
CREATE POLICY "wedding_planejamento_state_org_all" ON public.wedding_planejamento_state
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS "wedding_planejamento_state_service_all" ON public.wedding_planejamento_state;
CREATE POLICY "wedding_planejamento_state_service_all" ON public.wedding_planejamento_state
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

-- Validação pós-migration
DO $$
DECLARE
  has_table BOOLEAN;
  has_rls BOOLEAN;
  policy_count INTEGER;
  trigger_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='wedding_planejamento_state'
  ) INTO has_table;
  IF NOT has_table THEN
    RAISE EXCEPTION 'wedding_planejamento_state: tabela não foi criada';
  END IF;

  SELECT relrowsecurity INTO has_rls FROM pg_class
    WHERE relname='wedding_planejamento_state' AND relnamespace='public'::regnamespace;
  IF NOT has_rls THEN
    RAISE EXCEPTION 'wedding_planejamento_state: RLS desabilitada';
  END IF;

  SELECT COUNT(*) INTO policy_count FROM pg_policies
    WHERE schemaname='public' AND tablename='wedding_planejamento_state';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'wedding_planejamento_state: esperado 2 policies, encontrado %', policy_count;
  END IF;

  SELECT COUNT(*) INTO trigger_count FROM pg_trigger
    WHERE tgrelid='public.wedding_planejamento_state'::regclass AND NOT tgisinternal;
  IF trigger_count < 2 THEN
    RAISE EXCEPTION 'wedding_planejamento_state: esperado >=2 triggers, encontrado %', trigger_count;
  END IF;

  RAISE NOTICE 'wedding_planejamento_state: validação OK';
END $$;
