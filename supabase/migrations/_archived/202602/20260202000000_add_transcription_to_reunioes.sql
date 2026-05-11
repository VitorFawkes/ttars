-- ============================================================================
-- Migration: Adicionar campos de transcrição na tabela reunioes
-- Data: 2026-02-02
-- Descrição: Suporta o workflow de processamento de transcrições de reunião
-- ============================================================================

-- Adicionar campo de transcrição
ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS transcricao TEXT;

-- Adicionar campo para metadata da extração de IA
ALTER TABLE reunioes ADD COLUMN IF NOT EXISTS transcricao_metadata JSONB;

-- Comentários
COMMENT ON COLUMN reunioes.transcricao IS 'Transcrição completa da reunião (texto)';
COMMENT ON COLUMN reunioes.transcricao_metadata IS 'Metadata da extração: {processed_at, campos_extraidos, ai_confidence}';

-- Índice para buscar reuniões com transcrição por card
CREATE INDEX IF NOT EXISTS idx_reunioes_card_has_transcricao
ON reunioes(card_id)
WHERE transcricao IS NOT NULL;
