-- Feature: Estoque Interno (Almoxarifado) — módulo paralelo ao estoque de presentes
--
-- A área administrativa precisa controlar o estoque INTERNO da agência (itens de
-- ações On Board / kits de boas-vindas / ações internas e da lojinha da Aplause),
-- separado dos presentes que as Travel Planners enviam aos clientes.
--
-- Decisão de arquitetura: tabelas PRÓPRIAS (não reusar inventory_products /
-- inventory_movements), para que seja IMPOSSÍVEL por construção um item interno
-- aparecer no fluxo de presente-cliente e vice-versa (o "conflito" que a área quer
-- evitar). Espelha o padrão provado (catálogo + livro-razão + trigger de saldo),
-- mas já nasce no padrão multi-tenant moderno (org_id NOT NULL DEFAULT
-- requesting_org_id(), RLS org-scoped) — sem repetir o ciclo retrofit/fix que o
-- módulo de presentes sofreu (20260406 -> 20260414 -> 20260422).
--
-- Acesso: mesmo gate de /presentes, reusando can_manage_gifts()
-- (is_admin OR role='pos_venda' OR phase IN ('pos_venda','planner')).
-- Lojinha Aplause: só registra a saída (destination='lojinha_aplause'); motor de
-- pontos fica fora deste escopo.
--
-- ARMADILHA (ver 20260422_fix_inventory_products_policy_org_split): o gate de role
-- NUNCA compara profiles.org_id (aponta para a account-mãe e quebra a igualdade).
-- O isolamento por org vem só de org_id = requesting_org_id() na própria linha.

BEGIN;

-- ============================================================
-- 1. Catálogo: internal_inventory_products
-- ============================================================
CREATE TABLE IF NOT EXISTS public.internal_inventory_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'geral',
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  current_stock INTEGER NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  image_path TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SKU único POR ORG (nasce correto — alinhado a 20260406_h3_022_fix_unique_indexes_org_scoped)
CREATE UNIQUE INDEX IF NOT EXISTS uq_internal_inventory_products_org_sku
  ON public.internal_inventory_products(org_id, sku);
CREATE INDEX IF NOT EXISTS idx_internal_inventory_products_org_id
  ON public.internal_inventory_products(org_id);
CREATE INDEX IF NOT EXISTS idx_internal_inventory_products_category
  ON public.internal_inventory_products(category);
CREATE INDEX IF NOT EXISTS idx_internal_inventory_products_active
  ON public.internal_inventory_products(active);

-- ============================================================
-- 2. Livro-razão: internal_inventory_movements
-- ============================================================
CREATE TABLE IF NOT EXISTS public.internal_inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES public.organizations(id),
  product_id UUID NOT NULL REFERENCES public.internal_inventory_products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,                          -- + entrada / - saída (sinal alimenta o trigger)
  movement_type TEXT NOT NULL
    CHECK (movement_type IN ('entrada','saida','ajuste','devolucao')),
  -- Campos operacionais do estoque interno (saída):
  destination TEXT
    CHECK (destination IS NULL OR destination IN ('on_board','acao_interna','lojinha_aplause','outro')),
  requested_by_profile UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- quem SOLICITOU (usuário do sistema)
  requested_by_name TEXT,                              -- quem solicitou (texto livre p/ colaborador sem login)
  withdrawn_by_profile UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- quem RETIROU (usuário do sistema)
  withdrawn_by_name TEXT,                              -- quem retirou (texto livre)
  reason TEXT,                                         -- observação
  reference_id UUID,                                  -- futuro: link p/ ação/evento
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,         -- quem REGISTROU (= auth.uid)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_internal_inventory_movements_org_id
  ON public.internal_inventory_movements(org_id);
CREATE INDEX IF NOT EXISTS idx_internal_inventory_movements_product_id
  ON public.internal_inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_internal_inventory_movements_type
  ON public.internal_inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_internal_inventory_movements_created_at
  ON public.internal_inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_inventory_movements_destination
  ON public.internal_inventory_movements(destination);

-- ============================================================
-- 3. Trigger updated_at (produtos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.internal_inventory_products_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_internal_inventory_products_updated_at ON public.internal_inventory_products;
CREATE TRIGGER trg_internal_inventory_products_updated_at
  BEFORE UPDATE ON public.internal_inventory_products
  FOR EACH ROW EXECUTE FUNCTION public.internal_inventory_products_set_updated_at();

-- ============================================================
-- 4. Trigger de saldo (espelha update_inventory_stock dos presentes)
--    Coração do controle de quantidade: cada movimento ajusta current_stock.
--    Saída que estouraria o estoque viola CHECK(current_stock >= 0) e a
--    transação inteira (incluindo o INSERT do movimento) faz rollback.
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_internal_inventory_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  UPDATE public.internal_inventory_products
  SET current_stock = current_stock + NEW.quantity,
      updated_at = now()
  WHERE id = NEW.product_id;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_update_internal_inventory_stock ON public.internal_inventory_movements;
CREATE TRIGGER trg_update_internal_inventory_stock
  AFTER INSERT ON public.internal_inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_internal_inventory_stock();

-- ============================================================
-- 5. Trigger defensivo de org_id no movimento (deriva do produto pai)
--    Protege inserts via service_role/Edge sem JWT e força consistência
--    com o produto (espelha auto_set_wedding_hospedagem_org_id).
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_set_internal_inventory_movement_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  prod_org UUID;
BEGIN
  SELECT org_id INTO prod_org FROM public.internal_inventory_products WHERE id = NEW.product_id;

  IF prod_org IS NULL THEN
    RAISE EXCEPTION 'internal_inventory_movements: product_id % não encontrado', NEW.product_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> prod_org THEN
    RAISE EXCEPTION 'internal_inventory_movements.org_id (%) diverge do produto (%) para product %',
      NEW.org_id, prod_org, NEW.product_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.org_id := prod_org;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_internal_inventory_movement_org_id ON public.internal_inventory_movements;
CREATE TRIGGER trg_internal_inventory_movement_org_id
  BEFORE INSERT OR UPDATE OF product_id, org_id ON public.internal_inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_internal_inventory_movement_org_id();

-- ============================================================
-- 6. RLS — org-scoped + mesmo gate de /presentes (can_manage_gifts)
--    Padrão moderno: _org_all (authenticated) + _service_all (service_role).
--    NUNCA USING(true) para authenticated.
-- ============================================================
ALTER TABLE public.internal_inventory_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal_inventory_products_org_all" ON public.internal_inventory_products;
CREATE POLICY "internal_inventory_products_org_all" ON public.internal_inventory_products
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND can_manage_gifts())
  WITH CHECK (org_id = requesting_org_id() AND can_manage_gifts());

DROP POLICY IF EXISTS "internal_inventory_products_service_all" ON public.internal_inventory_products;
CREATE POLICY "internal_inventory_products_service_all" ON public.internal_inventory_products
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE public.internal_inventory_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal_inventory_movements_org_all" ON public.internal_inventory_movements;
CREATE POLICY "internal_inventory_movements_org_all" ON public.internal_inventory_movements
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND can_manage_gifts())
  WITH CHECK (org_id = requesting_org_id() AND can_manage_gifts());

DROP POLICY IF EXISTS "internal_inventory_movements_service_all" ON public.internal_inventory_movements;
CREATE POLICY "internal_inventory_movements_service_all" ON public.internal_inventory_movements
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- Validação pós-migration
-- ============================================================
DO $$
DECLARE
  t TEXT;
  has_table BOOLEAN;
  has_rls BOOLEAN;
  policy_count INTEGER;
BEGIN
  FOREACH t IN ARRAY ARRAY['internal_inventory_products','internal_inventory_movements'] LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=t
    ) INTO has_table;
    IF NOT has_table THEN
      RAISE EXCEPTION '%: tabela não foi criada', t;
    END IF;

    SELECT relrowsecurity INTO has_rls FROM pg_class
      WHERE relname=t AND relnamespace='public'::regnamespace;
    IF NOT has_rls THEN
      RAISE EXCEPTION '%: RLS desabilitada', t;
    END IF;

    SELECT COUNT(*) INTO policy_count FROM pg_policies
      WHERE schemaname='public' AND tablename=t;
    IF policy_count < 2 THEN
      RAISE EXCEPTION '%: esperado 2 policies, encontrado %', t, policy_count;
    END IF;
  END LOOP;

  RAISE NOTICE 'internal_inventory_system: validação OK';
END $$;
