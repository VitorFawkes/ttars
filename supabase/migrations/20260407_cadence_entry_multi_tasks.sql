-- =============================================================================
-- Cadence Entry Rules: Suportar múltiplas tarefas por regra
-- =============================================================================
-- Converte cadence_event_triggers.task_config (objeto) → task_configs (array)
-- para permitir que uma única regra de entrada crie N tarefas de uma só vez.
--
-- Backfill: wraps o objeto existente em array. Objetos vazios viram array vazio.
-- =============================================================================

ALTER TABLE cadence_event_triggers
    ADD COLUMN IF NOT EXISTS task_configs JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill: converter task_config existente em task_configs[0]
UPDATE cadence_event_triggers
SET task_configs = jsonb_build_array(task_config)
WHERE action_type = 'create_task'
  AND task_config IS NOT NULL
  AND task_config <> '{}'::jsonb
  AND (task_configs IS NULL OR task_configs = '[]'::jsonb);

-- task_config fica como legacy (não droppar já — aguardar 1 ciclo para rollback seguro)
COMMENT ON COLUMN cadence_event_triggers.task_config IS 'DEPRECATED: usar task_configs. Mantido temporariamente para rollback.';
COMMENT ON COLUMN cadence_event_triggers.task_configs IS 'Array de configs de tarefa — permite criar múltiplas tarefas em uma única regra de entrada.';
