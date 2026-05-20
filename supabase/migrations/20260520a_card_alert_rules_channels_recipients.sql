-- ============================================================================
-- MIGRATION: Card Alert Rules — canais e destinatários configuráveis
-- Date: 2026-05-20
--
-- Marco A.1 — Alertas Viscerais: Adiciona colunas para controlar entrega por:
--   1. Canal: modal (boas-vindas), faixa no Kanban, sino (bell), email
--   2. Destinatário: dono, admins, papéis específicos, usuários específicos
--
-- Backfill: show_in_bell=TRUE preserva comportamento histórico de notificações.
-- Demais canais ficam FALSE até admin ativar explicitamente no painel.
-- ============================================================================

BEGIN;

ALTER TABLE public.card_alert_rules
    ADD COLUMN IF NOT EXISTS show_in_modal BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_in_kanban_banner BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS show_in_bell BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS recipient_mode TEXT NOT NULL DEFAULT 'card_owner'
        CHECK (recipient_mode IN ('card_owner','team_managers','specific_roles','specific_users')),
    ADD COLUMN IF NOT EXISTS recipient_target JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.card_alert_rules.show_in_modal IS
'Se TRUE, alerta aparece no modal de boas-vindas do 1º acesso do dia.';

COMMENT ON COLUMN public.card_alert_rules.show_in_kanban_banner IS
'Se TRUE, alerta aparece como faixa colorida no topo do KanbanCard.';

COMMENT ON COLUMN public.card_alert_rules.show_in_bell IS
'Se TRUE, alerta aparece no sininho de notificações (NotificationCenter). Default true para preservar comportamento histórico.';

COMMENT ON COLUMN public.card_alert_rules.recipient_mode IS
'card_owner=dono atual (default), team_managers=admins do workspace, specific_roles=lista de papéis em recipient_target, specific_users=lista de profile_id em recipient_target.';

COMMENT ON COLUMN public.card_alert_rules.recipient_target IS
'Array JSONB. Para specific_roles: ["sdr","vendas","pos","concierge"]. Para specific_users: ["uuid1","uuid2"]. Vazio para card_owner/team_managers.';

COMMIT;
