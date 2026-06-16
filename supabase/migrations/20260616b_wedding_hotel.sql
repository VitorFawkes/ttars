-- Feature: Hotel unificado (Convidados ↔ Planejamento)
--
-- Substitui wedding_hospedagem (1:N, criada na mesma data, sem dados) por
-- wedding_hotel: UMA ficha de hotel por casamento (1:1, PK card_id, como
-- wedding_fluxo / wedding_convidados_state). Fonte única editável tanto em
-- Convidados quanto em Planejamento. Ocupação por quartos (total/reservados).
-- Per-org com FK-cross-org strict como wedding_checklist.

BEGIN;

-- Remove a tabela anterior (sem dados) e suas funções de trigger
DROP TABLE IF EXISTS public.wedding_hospedagem CASCADE;
DROP FUNCTION IF EXISTS public.wedding_hospedagem_set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.auto_set_wedding_hospedagem_org_id() CASCADE;

CREATE TABLE IF NOT EXISTS public.wedding_hotel (
  card_id UUID PRIMARY KEY REFERENCES public.cards(id) ON DELETE CASCADE,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  nome TEXT NOT NULL,
  categoria TEXT,
  localizacao TEXT,
  check_in DATE,
  check_out DATE,
  total_quartos INTEGER,
  quartos_reservados INTEGER NOT NULL DEFAULT 0,
  contato_nome TEXT,
  contato_email TEXT,
  contato_telefone TEXT,
  site_url TEXT,
  tarifa NUMERIC,
  status TEXT NOT NULL DEFAULT 'a_definir'
    CHECK (status IN ('a_definir','bloqueado','confirmado')),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wedding_hotel_org_id ON public.wedding_hotel(org_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.wedding_hotel_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_hotel_updated_at ON public.wedding_hotel;
CREATE TRIGGER trg_wedding_hotel_updated_at
  BEFORE UPDATE ON public.wedding_hotel
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_hotel_set_updated_at();

-- FK-cross-org strict (força org_id = cards.org_id)
CREATE OR REPLACE FUNCTION public.auto_set_wedding_hotel_org_id()
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
    RAISE EXCEPTION 'wedding_hotel: card_id % não encontrado em cards', NEW.card_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> card_org THEN
    RAISE EXCEPTION 'wedding_hotel.org_id (%) diverge de cards.org_id (%) para card %',
      NEW.org_id, card_org, NEW.card_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := card_org;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_hotel_strict_org ON public.wedding_hotel;
CREATE TRIGGER trg_wedding_hotel_strict_org
  BEFORE INSERT OR UPDATE OF card_id, org_id ON public.wedding_hotel
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_wedding_hotel_org_id();

-- RLS
ALTER TABLE public.wedding_hotel ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wedding_hotel_org_all" ON public.wedding_hotel;
CREATE POLICY "wedding_hotel_org_all" ON public.wedding_hotel
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS "wedding_hotel_service_all" ON public.wedding_hotel;
CREATE POLICY "wedding_hotel_service_all" ON public.wedding_hotel
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
    WHERE table_schema='public' AND table_name='wedding_hotel'
  ) INTO has_table;
  IF NOT has_table THEN
    RAISE EXCEPTION 'wedding_hotel: tabela não foi criada';
  END IF;

  SELECT relrowsecurity INTO has_rls FROM pg_class
    WHERE relname='wedding_hotel' AND relnamespace='public'::regnamespace;
  IF NOT has_rls THEN
    RAISE EXCEPTION 'wedding_hotel: RLS desabilitada';
  END IF;

  SELECT COUNT(*) INTO policy_count FROM pg_policies
    WHERE schemaname='public' AND tablename='wedding_hotel';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'wedding_hotel: esperado 2 policies, encontrado %', policy_count;
  END IF;

  SELECT COUNT(*) INTO trigger_count FROM pg_trigger
    WHERE tgrelid='public.wedding_hotel'::regclass AND NOT tgisinternal;
  IF trigger_count < 2 THEN
    RAISE EXCEPTION 'wedding_hotel: esperado >=2 triggers, encontrado %', trigger_count;
  END IF;

  RAISE NOTICE 'wedding_hotel: validação OK';
END $$;
