-- Migration: Adiciona campos para o agente de IA WhatsApp no cards
-- Esses campos são mantidos pelo agente Julia (workflow n8n) para
-- persistir contexto de conversa e controle de responsável (IA vs humano).

ALTER TABLE cards ADD COLUMN IF NOT EXISTS ai_resumo TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ai_contexto TEXT;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ai_responsavel TEXT DEFAULT 'ia';

COMMENT ON COLUMN cards.ai_resumo IS 'Resumo de informações do cliente mantido pelo agente IA';
COMMENT ON COLUMN cards.ai_contexto IS 'Contexto cronológico da conversa mantido pelo agente IA';
COMMENT ON COLUMN cards.ai_responsavel IS 'Quem responde: ia ou humano';
