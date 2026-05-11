-- H3-027: Torna whatsapp_raw_events.org_id NULLABLE
--
-- CONTEXTO
-- whatsapp_raw_events é a "mailbox" (stage raw) antes da resolução de org.
-- Provedores (Echo, ChatPro) chamam o endpoint público whatsapp-webhook
-- sem JWT. Como org_id tinha DEFAULT requesting_org_id() + NOT NULL, e
-- requesting_org_id() retorna NULL sem JWT, todo INSERT público falhava
-- com "null value in column org_id violates not-null constraint".
--
-- Sintoma observado em produção (2026-04-13):
--   Canal WhatsApp parou em 2026-04-12 19:32 (último whatsapp_messages)
--   e 19:53 (último whatsapp_raw_events). Desde então Echo tentou entregar
--   events mas todos falhavam no INSERT raw. whatsapp_platforms.last_event_at
--   continuou atualizando (SELECT da platform funciona) mas nada persistia.
--
-- CAUSA RAIZ
-- Commit 3e59d25 (H3-025, "hardening org_id via triggers BEFORE INSERT em
-- 11 tabelas") e migration H3-026 (whatsapp_messages strict) cobriram as
-- tabelas downstream mas deixaram whatsapp_raw_events fora — porque raw
-- events SÃO pré-resolução por natureza. Não há como derivar org no momento
-- do INSERT (whatsapp_platforms é cross-org, payload ainda não foi parseado).
--
-- DECISÃO
-- Raw events ficam com org_id NULL até process_whatsapp_raw_event_v2 resolver
-- telefone → contato → org_id e gravar em whatsapp_messages (que mantém
-- NOT NULL + trigger strict auto_set_whatsapp_messages_org_id_trigger, H3-026).
--
-- IMPACTO DE SEGURANÇA
-- - RLS whatsapp_raw_events_org_all usa (org_id = requesting_org_id()).
--   Rows com org_id NULL ficam invisíveis para non-service-role (correto —
--   raw events não pertencem a nenhuma org até serem processados).
-- - service_role (edge function + processador) continua com bypass via
--   policy whatsapp_raw_events_service_all.
-- - Rows existentes: todos já têm org_id preenchido (era NOT NULL).
--   NULLABLE é forward-looking.
-- - DEFAULT mantido: INSERTs autenticados ainda pegam requesting_org_id().

ALTER TABLE whatsapp_raw_events ALTER COLUMN org_id DROP NOT NULL;

COMMENT ON COLUMN whatsapp_raw_events.org_id IS
    'NULLABLE: edge function whatsapp-webhook chega sem JWT, org_id fica '
    'NULL até process_whatsapp_raw_event_v2 resolver via telefone→contato '
    'e criar whatsapp_messages (que tem NOT NULL + trigger strict H3-026). '
    'Rows NULL são invisíveis via RLS exceto service_role.';
