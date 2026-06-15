-- Feature: Planejamento — fornecedores por casamento
--
-- Sai do interim (cards.produto_data.ww_fornecedores) para tabela própria.
-- Cada linha é um fornecedor contratado/previsto de um casamento, ligado ao
-- card. Per-org com FK-cross-org strict como wedding_planejamento_state.

BEGIN;

CREATE TABLE IF NOT EXISTS public.wedding_fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.cards(id) ON DELETE CASCADE,
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  categoria TEXT NOT NULL,
  nome TEXT NOT NULL,
  contato TEXT,
  valor NUMERIC,
  status TEXT NOT NULL DEFAULT 'a_contratar'
    CHECK (status IN ('a_contratar','contratado','pago')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wedding_fornecedores_card_id ON public.wedding_fornecedores(card_id);
CREATE INDEX IF NOT EXISTS idx_wedding_fornecedores_org_id ON public.wedding_fornecedores(org_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.wedding_fornecedores_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_fornecedores_updated_at ON public.wedding_fornecedores;
CREATE TRIGGER trg_wedding_fornecedores_updated_at
  BEFORE UPDATE ON public.wedding_fornecedores
  FOR EACH ROW
  EXECUTE FUNCTION public.wedding_fornecedores_set_updated_at();

-- FK-cross-org strict (força org_id = cards.org_id)
CREATE OR REPLACE FUNCTION public.auto_set_wedding_fornecedores_org_id()
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
    RAISE EXCEPTION 'wedding_fornecedores: card_id % não encontrado em cards', NEW.card_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> card_org THEN
    RAISE EXCEPTION 'wedding_fornecedores.org_id (%) diverge de cards.org_id (%) para card %',
      NEW.org_id, card_org, NEW.card_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := card_org;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_wedding_fornecedores_strict_org ON public.wedding_fornecedores;
CREATE TRIGGER trg_wedding_fornecedores_strict_org
  BEFORE INSERT OR UPDATE OF card_id, org_id ON public.wedding_fornecedores
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_wedding_fornecedores_org_id();

-- RLS
ALTER TABLE public.wedding_fornecedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wedding_fornecedores_org_all" ON public.wedding_fornecedores;
CREATE POLICY "wedding_fornecedores_org_all" ON public.wedding_fornecedores
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS "wedding_fornecedores_service_all" ON public.wedding_fornecedores;
CREATE POLICY "wedding_fornecedores_service_all" ON public.wedding_fornecedores
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Backfill: migra o interim cards.produto_data.ww_fornecedores -> tabela.
-- (Só roda em cards WEDDING que têm o array; idempotente o suficiente para
--  uma migration de corte.)
INSERT INTO public.wedding_fornecedores (card_id, org_id, categoria, nome, contato, valor, status)
SELECT
  c.id,
  c.org_id,
  COALESCE(f->>'categoria', ''),
  COALESCE(f->>'nome', ''),
  NULLIF(f->>'contato', ''),
  CASE WHEN (f->>'valor') ~ '^[0-9]+(\.[0-9]+)?$' THEN (f->>'valor')::numeric ELSE NULL END,
  COALESCE(NULLIF(f->>'status', ''), 'a_contratar')
FROM public.cards c
CROSS JOIN LATERAL jsonb_array_elements(c.produto_data->'ww_fornecedores') AS f
WHERE c.produto = 'WEDDING'
  AND jsonb_typeof(c.produto_data->'ww_fornecedores') = 'array'
  AND COALESCE(f->>'nome', '') <> ''
  AND COALESCE(f->>'status', 'a_contratar') IN ('a_contratar','contratado','pago');

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
    WHERE table_schema='public' AND table_name='wedding_fornecedores'
  ) INTO has_table;
  IF NOT has_table THEN
    RAISE EXCEPTION 'wedding_fornecedores: tabela não foi criada';
  END IF;

  SELECT relrowsecurity INTO has_rls FROM pg_class
    WHERE relname='wedding_fornecedores' AND relnamespace='public'::regnamespace;
  IF NOT has_rls THEN
    RAISE EXCEPTION 'wedding_fornecedores: RLS desabilitada';
  END IF;

  SELECT COUNT(*) INTO policy_count FROM pg_policies
    WHERE schemaname='public' AND tablename='wedding_fornecedores';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'wedding_fornecedores: esperado 2 policies, encontrado %', policy_count;
  END IF;

  SELECT COUNT(*) INTO trigger_count FROM pg_trigger
    WHERE tgrelid='public.wedding_fornecedores'::regclass AND NOT tgisinternal;
  IF trigger_count < 2 THEN
    RAISE EXCEPTION 'wedding_fornecedores: esperado >=2 triggers, encontrado %', trigger_count;
  END IF;

  RAISE NOTICE 'wedding_fornecedores: validação OK';
END $$;
