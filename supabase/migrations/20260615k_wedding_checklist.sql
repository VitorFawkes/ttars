-- Feature: Planejamento — cronograma & checklist por casamento
--
-- Lista de itens de planejamento por casamento: título + prazo (opcional) +
-- feito. Itens com data formam o cronograma; marcar feito = checklist.
-- Per-org com FK-cross-org strict como wedding_fornecedores.

BEGIN;

CREATE TABLE IF NOT EXISTS public.wedding_checklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  titulo TEXT NOT NULL,
  prazo DATE,
  feito BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wedding_checklist_card_id ON public.wedding_checklist(card_id);
CREATE INDEX IF NOT EXISTS idx_wedding_checklist_org_id ON public.wedding_checklist(org_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.wedding_checklist_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_checklist_updated_at ON public.wedding_checklist;
CREATE TRIGGER trg_wedding_checklist_updated_at
  BEFORE UPDATE ON public.wedding_checklist
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_checklist_set_updated_at();

-- FK-cross-org strict (força org_id = cards.org_id)
CREATE OR REPLACE FUNCTION public.auto_set_wedding_checklist_org_id()
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
    RAISE EXCEPTION 'wedding_checklist: card_id % não encontrado em cards', NEW.card_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> card_org THEN
    RAISE EXCEPTION 'wedding_checklist.org_id (%) diverge de cards.org_id (%) para card %',
      NEW.org_id, card_org, NEW.card_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := card_org;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_checklist_strict_org ON public.wedding_checklist;
CREATE TRIGGER trg_wedding_checklist_strict_org
  BEFORE INSERT OR UPDATE OF card_id, org_id ON public.wedding_checklist
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_wedding_checklist_org_id();

-- RLS
ALTER TABLE public.wedding_checklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wedding_checklist_org_all" ON public.wedding_checklist;
CREATE POLICY "wedding_checklist_org_all" ON public.wedding_checklist
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS "wedding_checklist_service_all" ON public.wedding_checklist;
CREATE POLICY "wedding_checklist_service_all" ON public.wedding_checklist
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
    WHERE table_schema='public' AND table_name='wedding_checklist'
  ) INTO has_table;
  IF NOT has_table THEN
    RAISE EXCEPTION 'wedding_checklist: tabela não foi criada';
  END IF;

  SELECT relrowsecurity INTO has_rls FROM pg_class
    WHERE relname='wedding_checklist' AND relnamespace='public'::regnamespace;
  IF NOT has_rls THEN
    RAISE EXCEPTION 'wedding_checklist: RLS desabilitada';
  END IF;

  SELECT COUNT(*) INTO policy_count FROM pg_policies
    WHERE schemaname='public' AND tablename='wedding_checklist';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'wedding_checklist: esperado 2 policies, encontrado %', policy_count;
  END IF;

  SELECT COUNT(*) INTO trigger_count FROM pg_trigger
    WHERE tgrelid='public.wedding_checklist'::regclass AND NOT tgisinternal;
  IF trigger_count < 2 THEN
    RAISE EXCEPTION 'wedding_checklist: esperado >=2 triggers, encontrado %', trigger_count;
  END IF;

  RAISE NOTICE 'wedding_checklist: validação OK';
END $$;
