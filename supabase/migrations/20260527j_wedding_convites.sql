-- Feature: Lista de Convidados — Convites (Marco 1.2)
--
-- Cria a tabela `wedding_convites` — agrupamento de pessoas dentro de um
-- casal. Ex: "Família Tavares", "Amigos da noiva, time de futebol".
-- card_id é espelhado do casal pai via trigger (mantém integridade
-- quando casal é vinculado/desvinculado de um card).

BEGIN;

CREATE TABLE IF NOT EXISTS public.wedding_convites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  casal_id UUID NOT NULL REFERENCES public.wedding_casais(id) ON DELETE CASCADE,
  card_id UUID NULL REFERENCES public.cards(id) ON DELETE SET NULL,
  nome TEXT NOT NULL DEFAULT 'Convite sem nome',
  posicao INTEGER NOT NULL DEFAULT 0,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wedding_convites_casal_id ON public.wedding_convites(casal_id);
CREATE INDEX IF NOT EXISTS idx_wedding_convites_card_id ON public.wedding_convites(card_id) WHERE card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wedding_convites_org_id ON public.wedding_convites(org_id);
CREATE INDEX IF NOT EXISTS idx_wedding_convites_casal_posicao ON public.wedding_convites(casal_id, posicao);

-- ── updated_at + auto-derive org_id/card_id from casal ────────────────────
CREATE OR REPLACE FUNCTION public.wedding_convites_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_convites_updated_at ON public.wedding_convites;
CREATE TRIGGER trg_wedding_convites_updated_at
  BEFORE UPDATE ON public.wedding_convites
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_convites_set_updated_at();

-- Sincroniza org_id + card_id com o casal pai antes de gravar.
CREATE OR REPLACE FUNCTION public.wedding_convites_sync_from_casal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_casal_org UUID;
  v_casal_card UUID;
BEGIN
  SELECT org_id, card_id INTO v_casal_org, v_casal_card
  FROM public.wedding_casais
  WHERE id = NEW.casal_id;
  IF v_casal_org IS NULL THEN
    RAISE EXCEPTION 'wedding_convites: casal_id % não encontrado', NEW.casal_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.org_id := v_casal_org;
  NEW.card_id := v_casal_card;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_convites_sync ON public.wedding_convites;
CREATE TRIGGER trg_wedding_convites_sync
  BEFORE INSERT OR UPDATE OF casal_id ON public.wedding_convites
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_convites_sync_from_casal();

-- ── Quando casal vincula a card, propaga card_id pros convites filhos. ────
CREATE OR REPLACE FUNCTION public.wedding_casais_propagate_card_to_filhos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NEW.card_id IS DISTINCT FROM OLD.card_id THEN
    UPDATE public.wedding_convites SET card_id = NEW.card_id WHERE casal_id = NEW.id;
    UPDATE public.wedding_guests SET card_id = NEW.card_id WHERE casal_id = NEW.id;
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_casais_propagate_card ON public.wedding_casais;
CREATE TRIGGER trg_wedding_casais_propagate_card
  AFTER UPDATE OF card_id ON public.wedding_casais
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_casais_propagate_card_to_filhos();

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.wedding_convites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wedding_convites_org_all ON public.wedding_convites;
CREATE POLICY wedding_convites_org_all ON public.wedding_convites
  TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS wedding_convites_service_all ON public.wedding_convites;
CREATE POLICY wedding_convites_service_all ON public.wedding_convites
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wedding_convites') THEN
    RAISE EXCEPTION 'wedding_convites não criada';
  END IF;
  RAISE NOTICE 'wedding_convites OK';
END $$;
