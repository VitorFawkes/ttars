-- ============================================================
-- Alerts Widget: card_id em notifications + seção no card
-- ============================================================

-- 1. Adicionar card_id à tabela notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS card_id UUID REFERENCES cards(id) ON DELETE CASCADE;

-- 2. Índice composto para queries do widget
CREATE INDEX IF NOT EXISTS idx_notifications_card_user
    ON notifications(card_id, user_id, created_at DESC)
    WHERE type = 'card_alert';

-- 3. Backfill: extrair card_id do campo url para alertas existentes
UPDATE notifications
SET card_id = (regexp_match(url, '/cards/([0-9a-f-]{36})'))[1]::uuid
WHERE type = 'card_alert'
  AND card_id IS NULL
  AND url ~ '/cards/[0-9a-f-]{36}';

-- 4. Seed da seção "Alertas" no sections
INSERT INTO sections (key, label, icon, color, position, order_index, is_system, is_governable, active, widget_component)
VALUES ('alertas', 'Alertas', 'megaphone', 'bg-amber-50 text-amber-700 border-amber-100', 'right_column', 18, true, true, true, 'alertas')
ON CONFLICT (key) DO UPDATE SET widget_component = EXCLUDED.widget_component, active = true;
