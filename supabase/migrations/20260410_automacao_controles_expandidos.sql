-- Novos campos de controle na automacao_regras
ALTER TABLE automacao_regras
  ADD COLUMN IF NOT EXISTS agent_aware BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS business_hours BOOLEAN DEFAULT true;

COMMENT ON COLUMN automacao_regras.agent_aware IS 'Não envia se agente mandou msg manual nas últimas 4h';
COMMENT ON COLUMN automacao_regras.business_hours IS 'Só enviar em horário comercial (9-18h SP, seg-sex)';
