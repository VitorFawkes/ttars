-- Adiciona campo phone_number_id na automacao_regras
-- Permite escolher de qual linha WhatsApp a automação envia
ALTER TABLE automacao_regras
  ADD COLUMN IF NOT EXISTS phone_number_id TEXT;

COMMENT ON COLUMN automacao_regras.phone_number_id IS 'Echo phone_number_id: qual linha WhatsApp usar para envio. NULL = resolver automaticamente pela fase do card.';
