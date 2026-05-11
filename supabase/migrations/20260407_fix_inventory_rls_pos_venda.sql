-- ============================================================
-- Fix: Permitir role pos_venda gerenciar estoque
--
-- Problema: H3-019 restringiu inventory_products a admin-only.
-- Giovanna (pos_venda) não conseguia atualizar nem deletar produtos.
--
-- Também corrige role da Giovanna (estava 'vendas', deveria ser 'pos_venda')
-- ============================================================

BEGIN;

-- 1. Corrigir role da Giovanna (team = Pós-Venda, role estava desyncado)
UPDATE profiles
SET role = 'pos_venda'
WHERE id = 'ee2679c7-5cb0-4489-a3a4-671398b3de75'
  AND role != 'pos_venda';

-- 2. Substituir policy admin-only por policy que inclui pos_venda
DROP POLICY IF EXISTS "inventory_products_org_admin_all" ON inventory_products;

CREATE POLICY "inventory_products_org_write" ON inventory_products
  FOR ALL TO authenticated
  USING (
    org_id = requesting_org_id() AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND org_id = requesting_org_id()
        AND (is_admin = TRUE OR role IN ('admin', 'pos_venda'))
    )
  )
  WITH CHECK (
    org_id = requesting_org_id() AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND org_id = requesting_org_id()
        AND (is_admin = TRUE OR role IN ('admin', 'pos_venda'))
    )
  );

COMMIT;
