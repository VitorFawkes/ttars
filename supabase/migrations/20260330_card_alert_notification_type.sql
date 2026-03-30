-- ============================================================================
-- MIGRATION: Adicionar tipo card_alert na notification_type_config
-- Date: 2026-03-30
-- Permite que usuários enviem alertas diretos a outros membros do card.
-- ============================================================================

INSERT INTO notification_type_config (type_key, label, description, icon, color) VALUES
  ('card_alert', 'Alerta no Card', 'Quando alguém envia um alerta para você em um card', 'megaphone', 'amber')
ON CONFLICT (type_key) DO NOTHING;
