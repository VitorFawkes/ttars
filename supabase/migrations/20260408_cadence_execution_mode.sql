-- ============================================================================
-- Cadence: execution_mode (linear vs blocks)
-- ============================================================================
-- Marcador no template que diz à cadence-engine qual modelo de execução usar.
--
--  - 'linear' (default): modelo legado — step_order sequencial via next_step_key.
--    Templates criados pelo CadenceBuilderPage antigo usam este modo e continuam
--    funcionando sem mudança.
--
--  - 'blocks': novo modelo — steps agrupados por block_index executam em paralelo.
--    Bloco N+1 só inicia quando TODAS as tarefas do bloco N estão concluídas.
--    Templates criados pelo novo AutomacaoBuilderPage usam este modo.
-- ============================================================================

ALTER TABLE cadence_templates
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'linear'
  CHECK (execution_mode IN ('linear', 'blocks'));

COMMENT ON COLUMN cadence_templates.execution_mode IS
  'Modo de execução: linear (legado, step_order sequencial) ou blocks (novo, paralelo por block_index).';
