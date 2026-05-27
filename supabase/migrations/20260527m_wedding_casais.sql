-- Feature: Lista de Convidados — Casais (Marco 1.1)
--
-- NOTA: este arquivo foi originalmente 20260527i_wedding_casais.sql, aplicado
-- em produção em 2026-05-27. Foi renomeado para 20260527m por conflito de
-- slot com outra migration (planner_profile_briefing_jsonb) escrita pelo
-- mesmo timestamp por agente paralelo. A tabela JÁ está em produção; este
-- arquivo é idempotente (CREATE TABLE IF NOT EXISTS) e pode ser reaplicado.
--
-- Cria a tabela `wedding_casais` que representa a entidade "casal" da
-- ferramenta pública de lista de convidados. Cada casal tem um código
-- de 6 chars (URL-safe, sem ambíguos) que é a chave do link público
-- enviado por WhatsApp.
--
-- Casais podem nascer ÓRFÃOS (card_id NULL). A equipe vincula depois ao
-- card WEDDING correspondente — os filhos (convites + guests) seguem.
--
-- Multi-tenant per-org. RLS isola por workspace.

BEGIN;

-- ── Tabela ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.wedding_casais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL,
  nome_casal TEXT NOT NULL,
  whatsapp_digits TEXT NOT NULL,
  card_id UUID NULL REFERENCES public.cards(id) ON DELETE SET NULL,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por UUID REFERENCES public.profiles(id),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_edicao_casal_em TIMESTAMPTZ NULL,
  encerrado_em TIMESTAMPTZ NULL,
  CONSTRAINT wedding_casais_codigo_format CHECK (codigo ~ '^[A-Z0-9-]{4,16}$'),
  CONSTRAINT wedding_casais_whatsapp_digits_format CHECK (whatsapp_digits ~ '^[0-9]{10,15}$'),
  CONSTRAINT wedding_casais_codigo_unique UNIQUE (codigo)
);

CREATE INDEX IF NOT EXISTS idx_wedding_casais_org_id ON public.wedding_casais(org_id);
CREATE INDEX IF NOT EXISTS idx_wedding_casais_card_id ON public.wedding_casais(card_id) WHERE card_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wedding_casais_codigo ON public.wedding_casais(codigo);

-- ── updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wedding_casais_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_casais_updated_at ON public.wedding_casais;
CREATE TRIGGER trg_wedding_casais_updated_at
  BEFORE UPDATE ON public.wedding_casais
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_casais_set_updated_at();

-- ── Card cross-org guard ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wedding_casais_validate_card_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  card_org UUID;
BEGIN
  IF NEW.card_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT org_id INTO card_org FROM public.cards WHERE id = NEW.card_id;
  IF card_org IS NULL THEN
    RAISE EXCEPTION 'wedding_casais: card_id % não encontrado em cards', NEW.card_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.org_id IS NOT NULL AND NEW.org_id <> card_org THEN
    RAISE EXCEPTION 'wedding_casais.org_id (%) diverge de cards.org_id (%) para card %',
      NEW.org_id, card_org, NEW.card_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_casais_card_org ON public.wedding_casais;
CREATE TRIGGER trg_wedding_casais_card_org
  BEFORE INSERT OR UPDATE OF card_id ON public.wedding_casais
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_casais_validate_card_org();

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.wedding_casais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wedding_casais_org_all ON public.wedding_casais;
CREATE POLICY wedding_casais_org_all ON public.wedding_casais
  TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS wedding_casais_service_all ON public.wedding_casais;
CREATE POLICY wedding_casais_service_all ON public.wedding_casais
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
