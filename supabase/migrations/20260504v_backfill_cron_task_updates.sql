-- ============================================================================
-- MIGRATION: backfill — reclassifica task_updated em massa como 'cron'
-- Date: 2026-05-04
--
-- Auditoria identificou ~370 atividades task_updated com mesma data_vencimento,
-- sem created_by e sem source — clara assinatura de cron job de re-agendamento
-- em massa. Estavam aparecendo como "Sistema" no feed, poluindo a timeline.
--
-- Este backfill marca essas linhas com source='cron', actor_type='integration'
-- e actor_label='Automação agendada' — ficam separadas visualmente das ações
-- humanas.
--
-- Critério (conservador, evita falsos positivos):
--   - tipo = 'task_updated'
--   - created_by IS NULL
--   - actor_label = 'Sistema' (ainda não classificado)
--   - metadata.changes existe e tem APENAS data_vencimento (titulo e
--     descricao são NULL no jsonb)
-- ============================================================================

BEGIN;

UPDATE public.activities
SET
    metadata = COALESCE(metadata, '{}'::jsonb) || '{"source":"cron"}'::jsonb,
    actor_type = 'integration',
    actor_id = NULL,
    actor_label = 'Automação agendada'
WHERE tipo = 'task_updated'
  AND created_by IS NULL
  AND actor_label = 'Sistema'
  AND metadata ? 'changes'
  AND (metadata->'changes'->>'titulo') IS NULL
  AND (metadata->'changes'->>'descricao') IS NULL
  AND (metadata->'changes'->>'data_vencimento') IS NOT NULL;

COMMIT;
