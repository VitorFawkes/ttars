-- ============================================================================
-- Cadence Blocks + Natural Due Offset
-- ============================================================================
-- Adiciona suporte ao novo modelo de "Automação" unificada:
--   - block_index: agrupa cadence_steps em blocos paralelos. Bloco N só inicia
--     quando todas as tasks do bloco N-1 estão concluídas.
--   - due_offset: prazo em linguagem natural (unit + value + anchor). É a
--     fonte de verdade no UI novo, traduzido para day_offset/wait_config no
--     save para manter retrocompat com cadence-engine atual.
--
-- Retrocompat: ambos campos são NULLABLE/DEFAULT seguro. Steps existentes
-- continuam funcionando sem mudança (block_index=0 = um único bloco linear).
-- ============================================================================

ALTER TABLE cadence_steps
  ADD COLUMN IF NOT EXISTS block_index INT NOT NULL DEFAULT 0;

ALTER TABLE cadence_steps
  ADD COLUMN IF NOT EXISTS due_offset JSONB;

COMMENT ON COLUMN cadence_steps.block_index IS
  'Índice do bloco paralelo. Tasks com mesmo block_index executam em paralelo. Bloco N+1 só inicia quando todas as tasks do bloco N estão concluídas.';

COMMENT ON COLUMN cadence_steps.due_offset IS
  'Prazo em linguagem natural. Estrutura: { unit: business_days|calendar_days|hours, value: int, anchor: cadence_start|previous_block_completed|card_field, card_field?: string }';

CREATE INDEX IF NOT EXISTS idx_cadence_steps_block
  ON cadence_steps(template_id, block_index, step_order);
