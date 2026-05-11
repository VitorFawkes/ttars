-- Migration: Adicionar campos de transcrição na tabela tarefas
-- Para permitir que tarefas tipo 'reuniao' tenham transcrição

-- Adicionar campo de transcrição
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS transcricao TEXT;

-- Adicionar campo para metadata da extração IA
ALTER TABLE tarefas ADD COLUMN IF NOT EXISTS transcricao_metadata JSONB;

-- Índice para busca de tarefas tipo reunião com transcrição
CREATE INDEX IF NOT EXISTS idx_tarefas_reuniao_transcricao
ON tarefas(card_id, tipo)
WHERE tipo = 'reuniao' AND transcricao IS NOT NULL;

-- Comentários
COMMENT ON COLUMN tarefas.transcricao IS 'Transcrição completa da reunião (quando tipo=reuniao e status=realizada)';
COMMENT ON COLUMN tarefas.transcricao_metadata IS 'Metadata da extração IA: {processed_at, campos_extraidos, ai_confidence}';
