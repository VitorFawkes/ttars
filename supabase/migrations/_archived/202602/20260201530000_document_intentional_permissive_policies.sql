-- ============================================================
-- Migration: Document Intentional Permissive Policies
-- Data: 2026-02-01
-- Autor: Vitor (via Claude)
--
-- PROPOSITO: Documentar policies que sao INTENCIONALMENTE permissivas
-- e nao devem ser alteradas. Isso elimina falsos positivos no
-- Supabase Security Linter.
--
-- RISCO: NENHUM - Apenas adiciona comentarios
-- ============================================================

-- ============================================================
-- CATEGORIA 1: Tabelas de Log (PERMISSIVO INTENCIONAL)
-- Logs precisam ser escritos por qualquer contexto para nao perder dados
-- ============================================================

COMMENT ON POLICY "Service insert api_request_logs" ON api_request_logs IS
    'PERMISSIVO INTENCIONAL: Logs de API precisam ser inseridos por service_role sem restricao.';

COMMENT ON POLICY "System insert audit logs" ON audit_logs IS
    'PERMISSIVO INTENCIONAL: Logs de auditoria precisam ser inseridos pelo sistema sem restricao.';

COMMENT ON POLICY "Authenticated users can insert automation logs" ON automation_log IS
    'PERMISSIVO INTENCIONAL: Logs de automacao podem ser inseridos por qualquer usuario autenticado.';

COMMENT ON POLICY "cadence_event_log_insert" ON cadence_event_log IS
    'PERMISSIVO INTENCIONAL: Logs de cadence precisam ser inseridos pelo sistema (triggers).';

COMMENT ON POLICY "Enable insert access for all users" ON webhook_logs IS
    'PERMISSIVO INTENCIONAL: Webhooks externos precisam logar sem autenticacao.';

-- ============================================================
-- CATEGORIA 2: Tabelas de Integracao (PERMISSIVO PARA WEBHOOKS)
-- Webhooks externos precisam escrever dados
-- ============================================================

COMMENT ON POLICY "Allow trigger insert" ON integration_outbound_queue IS
    'PERMISSIVO INTENCIONAL: Triggers do banco precisam enfileirar eventos de integracao.';

-- ============================================================
-- CATEGORIA 3: Tabelas Internas (AVALIAR EM SPRINT 2)
-- Estas policies sao permissivas para authenticated e podem ser
-- restringidas no futuro, mas requerem analise de impacto.
-- ============================================================

-- cards
COMMENT ON POLICY "Cards update by authenticated" ON cards IS
    'AVALIAR SPRINT 2: Atualmente qualquer authenticated pode atualizar qualquer card. Considerar restringir por owner/admin.';

-- cards_contatos
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Usuarios autenticados podem atualizar cards_contatos' AND tablename = 'cards_contatos') THEN
        COMMENT ON POLICY "Usuarios autenticados podem atualizar cards_contatos" ON cards_contatos IS
            'AVALIAR SPRINT 2: Considerar restringir por acesso ao card.';
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Usuarios autenticados podem criar cards_contatos' AND tablename = 'cards_contatos') THEN
        COMMENT ON POLICY "Usuarios autenticados podem criar cards_contatos" ON cards_contatos IS
            'AVALIAR SPRINT 2: Considerar restringir por acesso ao card.';
    END IF;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Usuarios autenticados podem deletar cards_contatos' AND tablename = 'cards_contatos') THEN
        COMMENT ON POLICY "Usuarios autenticados podem deletar cards_contatos" ON cards_contatos IS
            'AVALIAR SPRINT 2: Considerar restringir por acesso ao card.';
    END IF;
END $$;

-- contatos
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Usuarios autenticados podem atualizar contatos' AND tablename = 'contatos') THEN
        COMMENT ON POLICY "Usuarios autenticados podem atualizar contatos" ON contatos IS
            'AVALIAR SPRINT 2: Considerar restringir por created_by ou team.';
    END IF;
END $$;

-- contato_meios
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'contato_meios_insert' AND tablename = 'contato_meios') THEN
        COMMENT ON POLICY "contato_meios_insert" ON contato_meios IS
            'AVALIAR SPRINT 2: Considerar restringir por acesso ao contato.';
    END IF;
END $$;

-- activities
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert activities' AND tablename = 'activities') THEN
        COMMENT ON POLICY "Users can insert activities" ON activities IS
            'AVALIAR SPRINT 2: Considerar restringir por acesso ao card.';
    END IF;
END $$;

-- ============================================================
-- CATEGORIA 4: Tabelas Admin (ADMIN ONLY - Restringir depois)
-- ============================================================

-- integration_inbound_triggers
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated insert' AND tablename = 'integration_inbound_triggers') THEN
        COMMENT ON POLICY "Allow authenticated insert" ON integration_inbound_triggers IS
            'AVALIAR SPRINT 2: Restringir para admin/gestor apenas.';
    END IF;
END $$;

-- whatsapp_custom_fields
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can manage whatsapp_custom_fields' AND tablename = 'whatsapp_custom_fields') THEN
        COMMENT ON POLICY "Authenticated users can manage whatsapp_custom_fields" ON whatsapp_custom_fields IS
            'AVALIAR SPRINT 2: Restringir para admin apenas.';
    END IF;
END $$;

-- ============================================================
-- RESUMO
-- ============================================================
--
-- PERMISSIVO INTENCIONAL (NAO ALTERAR):
-- - api_request_logs, audit_logs, automation_log, cadence_event_log, webhook_logs
-- - integration_outbound_queue
--
-- AVALIAR EM SPRINT 2 (POSSIVEL RESTRICAO):
-- - cards, cards_contatos, contatos, contato_meios, activities
-- - integration_inbound_triggers, whatsapp_custom_fields, whatsapp_field_mappings
--
-- JA CORRIGIDO NESTA SPRINT:
-- - proposal_events, proposal_client_selections, proposal_comments
-- ============================================================
