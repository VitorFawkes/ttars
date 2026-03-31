-- ============================================================
-- MIGRATION: Complete Ecko Fields
-- Date: 2026-01-20
-- Adds all missing fields for comprehensive WhatsApp tracking
-- ============================================================

-- Add new columns
ALTER TABLE whatsapp_messages
ADD COLUMN IF NOT EXISTS agent_email text,
ADD COLUMN IF NOT EXISTS organization text,
ADD COLUMN IF NOT EXISTS organization_id text,
ADD COLUMN IF NOT EXISTS whatsapp_message_id text,
ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS has_error boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS contact_tags jsonb,
ADD COLUMN IF NOT EXISTS assigned_to text;

-- Add comments for documentation
COMMENT ON COLUMN whatsapp_messages.agent_email IS 'Email do agente Welcome que atendeu/enviou';
COMMENT ON COLUMN whatsapp_messages.organization IS 'Organização no Ecko (ex: Welcome)';
COMMENT ON COLUMN whatsapp_messages.organization_id IS 'ID da organização no Ecko';
COMMENT ON COLUMN whatsapp_messages.whatsapp_message_id IS 'ID real do WhatsApp (wamid.xxx)';
COMMENT ON COLUMN whatsapp_messages.is_read IS 'Se a mensagem foi lida';
COMMENT ON COLUMN whatsapp_messages.has_error IS 'Se houve erro no envio/recebimento';
COMMENT ON COLUMN whatsapp_messages.error_message IS 'Mensagem de erro, se houver';
COMMENT ON COLUMN whatsapp_messages.contact_tags IS 'Tags do contato no Ecko';
COMMENT ON COLUMN whatsapp_messages.assigned_to IS 'ID do agente atribuído à conversa';

-- Create index for common queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_agent_email ON whatsapp_messages(agent_email);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sector ON whatsapp_messages(sector);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_organization ON whatsapp_messages(organization);
