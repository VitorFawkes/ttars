-- Feature: Planejamento — hospedagem por casamento
--
-- Blocos de hotel por casamento: hotel + contato + localização + datas de
-- check-in/check-out + quantidade de quartos + hóspedes alocados + tarifa +
-- status. Ocupação fica agregada (contador hospedes_alocados); alocação
-- nominal convidado↔quarto fica para Fase 2.
-- Per-org com FK-cross-org strict como wedding_checklist / wedding_fornecedores.

BEGIN;

CREATE TABLE IF NOT EXISTS public.wedding_hospedagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  hotel TEXT NOT NULL,
  contato TEXT,
  localizacao TEXT,
  check_in DATE,
  check_out DATE,
  quartos INTEGER,
  hospedes_alocados INTEGER NOT NULL DEFAULT 0,
  tarifa NUMERIC,
  status TEXT NOT NULL DEFAULT 'a_definir'
    CHECK (status IN ('a_definir','bloqueado','confirmado')),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wedding_hospedagem_card_id ON public.wedding_hospedagem(card_id);
CREATE INDEX IF NOT EXISTS idx_wedding_hospedagem_org_id ON public.wedding_hospedagem(org_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.wedding_hospedagem_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_hospedagem_updated_at ON public.wedding_hospedagem;
CREATE TRIGGER trg_wedding_hospedagem_updated_at
  BEFORE UPDATE ON public.wedding_hospedagem
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_hospedagem_set_updated_at();

-- FK-cross-org strict (força org_id = cards.org_id)
CREATE OR REPLACE FUNCTION public.auto_set_wedding_hospedagem_org_id()
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
    RAISE EXCEPTION 'wedding_hospedagem: card_id % não encontrado em cards', NEW.card_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> card_org THEN
    RAISE EXCEPTION 'wedding_hospedagem.org_id (%) diverge de cards.org_id (%) para card %',
      NEW.org_id, card_org, NEW.card_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := card_org;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_hospedagem_strict_org ON public.wedding_hospedagem;
CREATE TRIGGER trg_wedding_hospedagem_strict_org
  BEFORE INSERT OR UPDATE OF card_id, org_id ON public.wedding_hospedagem
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_wedding_hospedagem_org_id();

-- RLS
ALTER TABLE public.wedding_hospedagem ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wedding_hospedagem_org_all" ON public.wedding_hospedagem;
CREATE POLICY "wedding_hospedagem_org_all" ON public.wedding_hospedagem
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS "wedding_hospedagem_service_all" ON public.wedding_hospedagem;
CREATE POLICY "wedding_hospedagem_service_all" ON public.wedding_hospedagem
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
    WHERE table_schema='public' AND table_name='wedding_hospedagem'
  ) INTO has_table;
  IF NOT has_table THEN
    RAISE EXCEPTION 'wedding_hospedagem: tabela não foi criada';
  END IF;

  SELECT relrowsecurity INTO has_rls FROM pg_class
    WHERE relname='wedding_hospedagem' AND relnamespace='public'::regnamespace;
  IF NOT has_rls THEN
    RAISE EXCEPTION 'wedding_hospedagem: RLS desabilitada';
  END IF;

  SELECT COUNT(*) INTO policy_count FROM pg_policies
    WHERE schemaname='public' AND tablename='wedding_hospedagem';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'wedding_hospedagem: esperado 2 policies, encontrado %', policy_count;
  END IF;

  SELECT COUNT(*) INTO trigger_count FROM pg_trigger
    WHERE tgrelid='public.wedding_hospedagem'::regclass AND NOT tgisinternal;
  IF trigger_count < 2 THEN
    RAISE EXCEPTION 'wedding_hospedagem: esperado >=2 triggers, encontrado %', trigger_count;
  END IF;

  RAISE NOTICE 'wedding_hospedagem: validação OK';
END $$;
