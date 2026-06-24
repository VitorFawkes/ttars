-- Fase 6 (Planejamento Weddings) — Linha do tempo de DECISÕES (D-P7).
--
-- As 4 decisões (destino, data, local, orçamento) JÁ são dados em
-- cards.produto_data (chaves ww_*/ww_planej_*) e a HISTÓRIA de cada mudança já
-- vive na tabela nativa `activities` (tipo='field_changed'). O ÚNICO dado que
-- falta é o ESTADO DE ACEITE do casal (proposto/aceito) por decisão.
--
-- Esta tabela guarda SÓ esse estado de aceite. O VALOR da decisão continua
-- vindo de produto_data (single source) — valor_label é só cache de exibição.
-- Gancho do portal do casal (Edme): aceito_por='casal' deixa o portal escrever
-- o aceite no futuro sem mudança de schema (wedding_casais já é o anchor).

BEGIN;

CREATE TABLE IF NOT EXISTS public.wedding_decisoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('destino','data','local','orcamento')),
  status      TEXT NOT NULL DEFAULT 'proposto' CHECK (status IN ('proposto','aceito')),
  valor_label TEXT,                 -- cache de exibição do valor (produto_data manda)
  proposto_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  aceito_em   TIMESTAMPTZ,
  aceito_por  TEXT,                 -- 'planejadora' | 'casal' (gancho do portal)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (card_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_wedding_decisoes_card ON public.wedding_decisoes(card_id);
CREATE INDEX IF NOT EXISTS idx_wedding_decisoes_org ON public.wedding_decisoes(org_id);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.wedding_decisoes_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at := now(); RETURN NEW; END
$fn$;
DROP TRIGGER IF EXISTS trg_wedding_decisoes_updated_at ON public.wedding_decisoes;
CREATE TRIGGER trg_wedding_decisoes_updated_at
  BEFORE UPDATE ON public.wedding_decisoes
  FOR EACH ROW EXECUTE FUNCTION public.wedding_decisoes_set_updated_at();

-- FK-cross-org strict: força org_id = cards.org_id (modelo wedding_checklist).
CREATE OR REPLACE FUNCTION public.auto_set_wedding_decisoes_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE card_org UUID;
BEGIN
  SELECT org_id INTO card_org FROM public.cards WHERE id = NEW.card_id;
  IF card_org IS NULL THEN
    RAISE EXCEPTION 'wedding_decisoes: card_id % não encontrado em cards', NEW.card_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.org_id IS NOT NULL AND NEW.org_id <> card_org THEN
    RAISE EXCEPTION 'wedding_decisoes.org_id (%) diverge de cards.org_id (%) para card %',
      NEW.org_id, card_org, NEW.card_id USING ERRCODE = 'check_violation';
  END IF;
  NEW.org_id := card_org;
  RETURN NEW;
END
$fn$;
DROP TRIGGER IF EXISTS trg_wedding_decisoes_strict_org ON public.wedding_decisoes;
CREATE TRIGGER trg_wedding_decisoes_strict_org
  BEFORE INSERT OR UPDATE OF card_id, org_id ON public.wedding_decisoes
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_wedding_decisoes_org_id();

-- RLS por org (nunca USING(true) para authenticated)
ALTER TABLE public.wedding_decisoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wedding_decisoes_org_all ON public.wedding_decisoes;
CREATE POLICY wedding_decisoes_org_all ON public.wedding_decisoes
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS wedding_decisoes_service_all ON public.wedding_decisoes;
CREATE POLICY wedding_decisoes_service_all ON public.wedding_decisoes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.wedding_decisoes IS
  'Estado de ACEITE (proposto/aceito) das decisões do casamento (destino/data/local/orcamento). O VALOR vive em cards.produto_data (single source); aqui só o aceite. aceito_por=casal é o gancho do portal Edme. Per-org WEDDING.';

COMMIT;

-- ─── Validação ──────────────────────────────────────────────────────────────
DO $$
DECLARE v_tbl INT; v_pol INT; v_trg INT;
BEGIN
  SELECT count(*) INTO v_tbl FROM information_schema.tables
   WHERE table_schema='public' AND table_name='wedding_decisoes';
  IF v_tbl = 0 THEN RAISE EXCEPTION 'wedding_decisoes não criada'; END IF;

  SELECT count(*) INTO v_pol FROM pg_policies
   WHERE schemaname='public' AND tablename='wedding_decisoes';
  IF v_pol < 2 THEN RAISE EXCEPTION 'wedding_decisoes: esperava 2 policies, achei %', v_pol; END IF;

  SELECT count(*) INTO v_trg FROM pg_trigger
   WHERE tgrelid='public.wedding_decisoes'::regclass AND NOT tgisinternal;
  IF v_trg < 2 THEN RAISE EXCEPTION 'wedding_decisoes: triggers faltando (achei %)', v_trg; END IF;

  RAISE NOTICE 'wedding_decisoes: OK';
END $$;
