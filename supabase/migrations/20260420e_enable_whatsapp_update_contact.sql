-- ============================================================================
-- Marco A — Liga toggle WHATSAPP_UPDATE_CONTACT
-- Date: 2026-04-20
--
-- Com process_whatsapp_raw_event_v2 atualizado (Marco A) para atualizar
-- nome fraco de contato, faz sentido ligar o toggle global.
--
-- A função só sobrescreve quando TODAS estas condições são verdadeiras:
--   - mensagem é inbound (não outbound)
--   - contatos.nome_locked_at IS NULL
--   - is_weak_contact_name(contatos.nome) = TRUE
--   - is_weak_contact_name(sender_name) = FALSE
-- ============================================================================

UPDATE integration_settings
   SET value = 'true',
       updated_at = NOW()
 WHERE key = 'WHATSAPP_UPDATE_CONTACT';

-- Se por algum motivo a chave não existir, garante inserção
INSERT INTO integration_settings (key, value)
SELECT 'WHATSAPP_UPDATE_CONTACT', 'true'
WHERE NOT EXISTS (
    SELECT 1 FROM integration_settings WHERE key = 'WHATSAPP_UPDATE_CONTACT'
);
