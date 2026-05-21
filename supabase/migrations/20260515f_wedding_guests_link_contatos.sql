-- Feature Convidados — Fase 3
-- wedding_guests vira link table entre cards (casamento) e contatos (pessoa CRM).
-- Dropa colunas denormalizadas nome/telefone/email; passam a vir do JOIN com contatos.
-- Status RSVP redefinido: ativo|confirmado|recusado|removido (default 'ativo').
-- Estende trigger cross-org para checar existência de contato.

BEGIN;

-- 1) contato_id — nullable inicialmente para tolerar refactors parciais
ALTER TABLE public.wedding_guests
  ADD COLUMN IF NOT EXISTS contato_id UUID REFERENCES public.contatos(id) ON DELETE RESTRICT;

-- 2) Backfill: 0 rows hoje. Se houver legacy de testes locais, abortar.
DO $$
DECLARE legacy_rows INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_rows FROM public.wedding_guests WHERE contato_id IS NULL;
  IF legacy_rows > 0 THEN
    RAISE EXCEPTION 'wedding_guests tem % linhas sem contato_id — backfill manual antes de prosseguir', legacy_rows;
  END IF;
END $$;

-- 3) Drop colunas denormalizadas
ALTER TABLE public.wedding_guests
  DROP COLUMN IF EXISTS nome,
  DROP COLUMN IF EXISTS telefone,
  DROP COLUMN IF EXISTS email;

-- 4) NOT NULL + UNIQUE(card_id, contato_id)
ALTER TABLE public.wedding_guests
  ALTER COLUMN contato_id SET NOT NULL;

ALTER TABLE public.wedding_guests
  DROP CONSTRAINT IF EXISTS wedding_guests_card_contato_unique;
ALTER TABLE public.wedding_guests
  ADD CONSTRAINT wedding_guests_card_contato_unique UNIQUE (card_id, contato_id);

CREATE INDEX IF NOT EXISTS idx_wedding_guests_contato_id ON public.wedding_guests(contato_id);

-- 5) Status novo: ativo|confirmado|recusado|removido. Default 'ativo'.
ALTER TABLE public.wedding_guests
  DROP CONSTRAINT IF EXISTS wedding_guests_status_rsvp_check;
ALTER TABLE public.wedding_guests
  ALTER COLUMN status_rsvp SET DEFAULT 'ativo';
ALTER TABLE public.wedding_guests
  ADD CONSTRAINT wedding_guests_status_rsvp_check
    CHECK (status_rsvp IN ('ativo','confirmado','recusado','removido'));

-- 6) Estende trigger cross-org para validar que contato existe.
-- NÃO exige contatos.org_id = cards.org_id porque com sharing ligado (Welcome Group)
-- contatos vivem na account pai enquanto cards vivem no workspace filho.
CREATE OR REPLACE FUNCTION public.auto_set_wedding_guests_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  card_org UUID;
  contato_exists BOOLEAN;
BEGIN
  SELECT org_id INTO card_org FROM public.cards WHERE id = NEW.card_id;
  IF card_org IS NULL THEN
    RAISE EXCEPTION 'wedding_guests: card_id % não encontrado em cards', NEW.card_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.contatos WHERE id = NEW.contato_id) INTO contato_exists;
  IF NOT contato_exists THEN
    RAISE EXCEPTION 'wedding_guests: contato_id % não encontrado em contatos', NEW.contato_id
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

-- Atualiza o trigger para também disparar em mudança de contato_id
DROP TRIGGER IF EXISTS trg_wedding_guests_strict_org ON public.wedding_guests;
CREATE TRIGGER trg_wedding_guests_strict_org
  BEFORE INSERT OR UPDATE OF card_id, org_id, contato_id ON public.wedding_guests
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_wedding_guests_org_id();

COMMIT;

-- Validação pós-migration
DO $$
DECLARE
  has_contato BOOLEAN;
  has_uniq BOOLEAN;
  has_check BOOLEAN;
  default_val TEXT;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wedding_guests'
      AND column_name='contato_id' AND is_nullable='NO') INTO has_contato;
  IF NOT has_contato THEN RAISE EXCEPTION 'wedding_guests.contato_id não está NOT NULL'; END IF;

  SELECT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='public.wedding_guests'::regclass
      AND conname='wedding_guests_card_contato_unique') INTO has_uniq;
  IF NOT has_uniq THEN RAISE EXCEPTION 'UNIQUE(card_id, contato_id) não criada'; END IF;

  SELECT EXISTS(SELECT 1 FROM pg_constraint
    WHERE conrelid='public.wedding_guests'::regclass
      AND conname='wedding_guests_status_rsvp_check') INTO has_check;
  IF NOT has_check THEN RAISE EXCEPTION 'CHECK do status_rsvp não criada'; END IF;

  SELECT column_default INTO default_val FROM information_schema.columns
    WHERE table_schema='public' AND table_name='wedding_guests' AND column_name='status_rsvp';
  IF default_val IS NULL OR default_val NOT LIKE '%ativo%' THEN
    RAISE EXCEPTION 'status_rsvp default não é ativo (atual: %)', default_val;
  END IF;

  RAISE NOTICE 'wedding_guests refactor: validação OK';
END $$;
