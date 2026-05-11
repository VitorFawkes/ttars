-- ============================================================================
-- Fix: monde_sales RLS — admin/gestor can see/manage all sales
-- ============================================================================
-- Problem: monde_sales SELECT policy only checked card ownership fields.
-- Admin/Gestor users who weren't card owners couldn't see sales in MondeWidget.
-- Fix: Add is_gestor() to SELECT/UPDATE/INSERT policies.
-- Also: sale creator can now view their own sales (was missing).
-- monde_sale_items SELECT chains through monde_sales, so this fix cascades.
-- ============================================================================

-- SELECT: is_gestor() OR created_by OR card ownership
DROP POLICY IF EXISTS "Users can view monde_sales" ON monde_sales;
CREATE POLICY "Users can view monde_sales" ON monde_sales FOR SELECT
USING (
    is_gestor()
    OR created_by = auth.uid()
    OR EXISTS (
        SELECT 1 FROM cards c
        WHERE c.id = monde_sales.card_id
        AND (
            c.dono_atual_id = auth.uid()
            OR c.created_by = auth.uid()
            OR c.sdr_owner_id = auth.uid()
            OR c.vendas_owner_id = auth.uid()
            OR c.pos_owner_id = auth.uid()
        )
    )
);

-- UPDATE: is_gestor() OR created_by
DROP POLICY IF EXISTS "Users can update monde_sales" ON monde_sales;
CREATE POLICY "Users can update monde_sales" ON monde_sales FOR UPDATE
USING (
    is_gestor()
    OR created_by = auth.uid()
);

-- INSERT: created_by OR is_gestor()
DROP POLICY IF EXISTS "Users can insert monde_sales" ON monde_sales;
CREATE POLICY "Users can insert monde_sales" ON monde_sales FOR INSERT
WITH CHECK (
    auth.uid() = created_by
    OR is_gestor()
);
