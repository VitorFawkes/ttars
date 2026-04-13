-- ============================================================
-- Fix: Estoque de presentes invisível após Org Split (Fase 4/5)
--
-- Problema:
--   1. inventory_products e inventory_movements foram atribuídos a
--      Welcome Group (a0000000...) em H3-019, mas após o Org Split
--      os usuários operam em Welcome Trips (b0000000...-0001).
--      RLS `org_id = requesting_org_id()` escondia TUDO.
--
--   2. card_gift_assignments e card_gift_items ainda estavam com
--      RLS `USING (true)` — vazamento cross-org. Precisam de
--      org_id + policies org-scoped.
--
-- Contexto:
--   - Todos os produtos de estoque são travel-related (SmartTag,
--     Tag Bagagem, Porta Doc, etc.). Destino natural: Welcome Trips.
--   - 100% dos assignments com card_id apontam para cards TRIPS.
--   - Os 94 assignments órfãos (sem card_id) são premium/trip gifts
--     dos clientes TRIPS (via contato). Destino: Welcome Trips.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. Mover inventory_products de Welcome Group → Welcome Trips
-- ────────────────────────────────────────────────────────────
UPDATE inventory_products
SET org_id = 'b0000000-0000-0000-0000-000000000001'::UUID
WHERE org_id = 'a0000000-0000-0000-0000-000000000001'::UUID;

-- ────────────────────────────────────────────────────────────
-- 2. Mover inventory_movements de Welcome Group → Welcome Trips
-- ────────────────────────────────────────────────────────────
UPDATE inventory_movements
SET org_id = 'b0000000-0000-0000-0000-000000000001'::UUID
WHERE org_id = 'a0000000-0000-0000-0000-000000000001'::UUID;

-- ────────────────────────────────────────────────────────────
-- 3. card_gift_assignments: adicionar org_id
-- ────────────────────────────────────────────────────────────
ALTER TABLE card_gift_assignments
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- Backfill via card (somente se cards.org_id já existe neste ambiente)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cards' AND column_name='org_id'
  ) THEN
    EXECUTE $sql$
      UPDATE card_gift_assignments cga
      SET org_id = c.org_id
      FROM cards c
      WHERE cga.card_id = c.id AND cga.org_id IS NULL
    $sql$;
  END IF;
END $$;

-- Backfill via contato (somente se contatos.org_id existe)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contatos' AND column_name='org_id'
  ) THEN
    EXECUTE $sql$
      UPDATE card_gift_assignments cga
      SET org_id = ct.org_id
      FROM contatos ct
      WHERE cga.contato_id = ct.id AND cga.org_id IS NULL
    $sql$;
  END IF;
END $$;

-- Fallback para registros ainda NULL OU em Welcome Group → Welcome Trips
UPDATE card_gift_assignments
SET org_id = 'b0000000-0000-0000-0000-000000000001'::UUID
WHERE org_id IS NULL OR org_id = 'a0000000-0000-0000-0000-000000000001'::UUID;

ALTER TABLE card_gift_assignments ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE card_gift_assignments ALTER COLUMN org_id SET DEFAULT requesting_org_id();

CREATE INDEX IF NOT EXISTS idx_card_gift_assignments_org_id
  ON card_gift_assignments(org_id);

-- ────────────────────────────────────────────────────────────
-- 4. card_gift_items: adicionar org_id
-- ────────────────────────────────────────────────────────────
ALTER TABLE card_gift_items
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- Backfill via assignment
UPDATE card_gift_items cgi
SET org_id = cga.org_id
FROM card_gift_assignments cga
WHERE cgi.assignment_id = cga.id AND cgi.org_id IS NULL;

-- Fallback (não deveria acontecer pois assignment_id é NOT NULL)
UPDATE card_gift_items
SET org_id = 'b0000000-0000-0000-0000-000000000001'::UUID
WHERE org_id IS NULL;

ALTER TABLE card_gift_items ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE card_gift_items ALTER COLUMN org_id SET DEFAULT requesting_org_id();

CREATE INDEX IF NOT EXISTS idx_card_gift_items_org_id
  ON card_gift_items(org_id);

-- ────────────────────────────────────────────────────────────
-- 5. RLS — substituir policies permissivas por org-scoped
-- ────────────────────────────────────────────────────────────

-- card_gift_assignments
DROP POLICY IF EXISTS cga_select ON card_gift_assignments;
DROP POLICY IF EXISTS cga_insert ON card_gift_assignments;
DROP POLICY IF EXISTS cga_update ON card_gift_assignments;
DROP POLICY IF EXISTS cga_delete ON card_gift_assignments;
DROP POLICY IF EXISTS card_gift_assignments_org_select ON card_gift_assignments;
DROP POLICY IF EXISTS card_gift_assignments_org_all ON card_gift_assignments;
DROP POLICY IF EXISTS card_gift_assignments_service_all ON card_gift_assignments;

CREATE POLICY card_gift_assignments_org_select ON card_gift_assignments
  FOR SELECT TO authenticated USING (org_id = requesting_org_id());

CREATE POLICY card_gift_assignments_org_all ON card_gift_assignments
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY card_gift_assignments_service_all ON card_gift_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- card_gift_items
DROP POLICY IF EXISTS cgi_select ON card_gift_items;
DROP POLICY IF EXISTS cgi_insert ON card_gift_items;
DROP POLICY IF EXISTS cgi_update ON card_gift_items;
DROP POLICY IF EXISTS cgi_delete ON card_gift_items;
DROP POLICY IF EXISTS card_gift_items_org_select ON card_gift_items;
DROP POLICY IF EXISTS card_gift_items_org_all ON card_gift_items;
DROP POLICY IF EXISTS card_gift_items_service_all ON card_gift_items;

CREATE POLICY card_gift_items_org_select ON card_gift_items
  FOR SELECT TO authenticated USING (org_id = requesting_org_id());

CREATE POLICY card_gift_items_org_all ON card_gift_items
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY card_gift_items_service_all ON card_gift_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 6. Trigger: auto-setar org_id em card_gift_items via assignment
--    (defesa contra INSERT sem JWT, ex: service_role/Edge Function)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_set_org_id_from_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.assignment_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM card_gift_assignments WHERE id = NEW.assignment_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_card_gift_items_set_org ON card_gift_items;
CREATE TRIGGER trg_card_gift_items_set_org
  BEFORE INSERT ON card_gift_items
  FOR EACH ROW EXECUTE FUNCTION auto_set_org_id_from_assignment();

-- ────────────────────────────────────────────────────────────
-- 7. Trigger: auto-setar org_id em card_gift_assignments via card/contato
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_set_org_id_gift_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_cards_has_org BOOLEAN;
  v_contatos_has_org BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cards' AND column_name='org_id'
  ) INTO v_cards_has_org;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='contatos' AND column_name='org_id'
  ) INTO v_contatos_has_org;

  IF NEW.org_id IS NULL AND NEW.card_id IS NOT NULL AND v_cards_has_org THEN
    EXECUTE 'SELECT org_id FROM cards WHERE id = $1' INTO NEW.org_id USING NEW.card_id;
  END IF;

  IF NEW.org_id IS NULL AND NEW.contato_id IS NOT NULL AND v_contatos_has_org THEN
    EXECUTE 'SELECT org_id FROM contatos WHERE id = $1' INTO NEW.org_id USING NEW.contato_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_card_gift_assignments_set_org ON card_gift_assignments;
CREATE TRIGGER trg_card_gift_assignments_set_org
  BEFORE INSERT ON card_gift_assignments
  FOR EACH ROW EXECUTE FUNCTION auto_set_org_id_gift_assignment();

COMMIT;
