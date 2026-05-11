-- ============================================================
-- Fix URGENTE: Criação/edição de produto no estoque bloqueada
--
-- Sintoma (reportado pela Giovanna em 2026-04-22):
--   - Modal "Novo Produto" retorna "Erro ao salvar"
--   - Imagens sobem no bucket mas não ficam associadas ao produto
--     (porque o INSERT nunca completa)
--
-- Causa raiz:
--   Policy `inventory_products_org_write` (criada em 20260407) exige:
--     EXISTS (SELECT 1 FROM profiles
--             WHERE id = auth.uid()
--               AND profiles.org_id = requesting_org_id()  <-- AQUI
--               AND role IN ('admin', 'pos_venda'))
--
--   Pós-Org Split (Fase 5), profiles.org_id aponta para a ACCOUNT
--   (Welcome Group, a0000000), mas requesting_org_id() retorna o
--   WORKSPACE ativo (Welcome Trips, b0000000). A igualdade nunca é
--   satisfeita → INSERT bloqueado pela WITH CHECK.
--
--   Todas as outras tabelas do sistema de presentes
--   (inventory_movements, card_gift_assignments, card_gift_items)
--   usam a função helper `public.can_manage_gifts()` que checa
--   apenas role/phase e não compara org — por isso não estão
--   quebradas.
--
-- Correção:
--   Padronizar inventory_products para usar `can_manage_gifts()`,
--   mantendo o isolamento por org via `org_id = requesting_org_id()`
--   na própria linha.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS "inventory_products_org_write" ON inventory_products;

CREATE POLICY "inventory_products_org_write" ON inventory_products
  FOR ALL TO authenticated
  USING (
    org_id = requesting_org_id() AND can_manage_gifts()
  )
  WITH CHECK (
    org_id = requesting_org_id() AND can_manage_gifts()
  );

COMMIT;
