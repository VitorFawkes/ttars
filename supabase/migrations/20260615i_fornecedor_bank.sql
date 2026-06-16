-- Feature: Planejamento — banco de fornecedores (catálogo per-workspace)
--
-- Sai do interim (localStorage) para tabela própria. Catálogo reutilizável
-- entre casamentos, organizado por localização e setor. Per-org simples
-- (não tem FK para outra tabela per-org, então não precisa de strict-org FK).

BEGIN;

CREATE TABLE IF NOT EXISTS public.fornecedor_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  nome TEXT NOT NULL,
  setor TEXT NOT NULL,
  localizacao TEXT NOT NULL DEFAULT '',
  contato TEXT,
  valor NUMERIC,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fornecedor_bank_org_id ON public.fornecedor_bank(org_id);
CREATE INDEX IF NOT EXISTS idx_fornecedor_bank_org_setor ON public.fornecedor_bank(org_id, setor);
CREATE INDEX IF NOT EXISTS idx_fornecedor_bank_org_local ON public.fornecedor_bank(org_id, localizacao);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.fornecedor_bank_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_fornecedor_bank_updated_at ON public.fornecedor_bank;
CREATE TRIGGER trg_fornecedor_bank_updated_at
  BEFORE UPDATE ON public.fornecedor_bank
  FOR EACH ROW
  EXECUTE FUNCTION public.fornecedor_bank_set_updated_at();

-- RLS
ALTER TABLE public.fornecedor_bank ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fornecedor_bank_org_all" ON public.fornecedor_bank;
CREATE POLICY "fornecedor_bank_org_all" ON public.fornecedor_bank
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS "fornecedor_bank_service_all" ON public.fornecedor_bank;
CREATE POLICY "fornecedor_bank_service_all" ON public.fornecedor_bank
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
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='fornecedor_bank'
  ) INTO has_table;
  IF NOT has_table THEN
    RAISE EXCEPTION 'fornecedor_bank: tabela não foi criada';
  END IF;

  SELECT relrowsecurity INTO has_rls FROM pg_class
    WHERE relname='fornecedor_bank' AND relnamespace='public'::regnamespace;
  IF NOT has_rls THEN
    RAISE EXCEPTION 'fornecedor_bank: RLS desabilitada';
  END IF;

  SELECT COUNT(*) INTO policy_count FROM pg_policies
    WHERE schemaname='public' AND tablename='fornecedor_bank';
  IF policy_count < 2 THEN
    RAISE EXCEPTION 'fornecedor_bank: esperado 2 policies, encontrado %', policy_count;
  END IF;

  RAISE NOTICE 'fornecedor_bank: validação OK';
END $$;
