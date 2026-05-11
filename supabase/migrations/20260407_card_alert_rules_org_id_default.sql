-- ============================================================================
-- MIGRATION: Default de org_id em card_alert_rules
-- Date: 2026-04-07
--
-- A migration original criou card_alert_rules.org_id como NOT NULL sem
-- default. Isso quebra INSERTs do frontend que não enviam org_id
-- explicitamente (useCardAlertRules.createMutation). Adiciona default
-- usando requesting_org_id() como nas outras tabelas multi-tenant.
-- ============================================================================

ALTER TABLE public.card_alert_rules
    ALTER COLUMN org_id SET DEFAULT public.requesting_org_id();
