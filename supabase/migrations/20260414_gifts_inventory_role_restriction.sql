-- ============================================================
-- Restringir visibilidade de estoque/presentes a admin + pos_venda
--
-- Até agora SELECT era org-scoped (qualquer user da org via).
-- Passa a ser role-scoped: só quem é admin ou tem role='pos_venda'
-- enxerga produtos, movements, assignments e items.
--
-- Defense-in-depth do route guard e do Sidebar filter.
-- ============================================================

BEGIN;

-- Helper: usuário atual pode gerenciar presentes?
-- NOTE: isolamento por org é feito pela policy principal (org_id = requesting_org_id()).
-- profiles.org_id é a "home org" (sempre Welcome Group post-Org-Split) e NÃO reflete
-- a org ativa no JWT — por isso não comparamos aqui. Só validamos role/admin.
CREATE OR REPLACE FUNCTION public.can_manage_gifts()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND (is_admin = TRUE OR role = 'pos_venda')
  );
$$;

-- ────────────────────────────────────────────────────────────
-- inventory_products
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS inventory_products_org_select ON inventory_products;

CREATE POLICY inventory_products_org_select ON inventory_products
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id() AND can_manage_gifts());

-- ────────────────────────────────────────────────────────────
-- inventory_movements
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS inventory_movements_org_select ON inventory_movements;
DROP POLICY IF EXISTS inventory_movements_org_all ON inventory_movements;

CREATE POLICY inventory_movements_org_select ON inventory_movements
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id() AND can_manage_gifts());

CREATE POLICY inventory_movements_org_all ON inventory_movements
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND can_manage_gifts())
  WITH CHECK (org_id = requesting_org_id() AND can_manage_gifts());

-- ────────────────────────────────────────────────────────────
-- card_gift_assignments
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS card_gift_assignments_org_select ON card_gift_assignments;
DROP POLICY IF EXISTS card_gift_assignments_org_all ON card_gift_assignments;

CREATE POLICY card_gift_assignments_org_select ON card_gift_assignments
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id() AND can_manage_gifts());

CREATE POLICY card_gift_assignments_org_all ON card_gift_assignments
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND can_manage_gifts())
  WITH CHECK (org_id = requesting_org_id() AND can_manage_gifts());

-- ────────────────────────────────────────────────────────────
-- card_gift_items
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS card_gift_items_org_select ON card_gift_items;
DROP POLICY IF EXISTS card_gift_items_org_all ON card_gift_items;

CREATE POLICY card_gift_items_org_select ON card_gift_items
  FOR SELECT TO authenticated
  USING (org_id = requesting_org_id() AND can_manage_gifts());

CREATE POLICY card_gift_items_org_all ON card_gift_items
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id() AND can_manage_gifts())
  WITH CHECK (org_id = requesting_org_id() AND can_manage_gifts());

COMMIT;
