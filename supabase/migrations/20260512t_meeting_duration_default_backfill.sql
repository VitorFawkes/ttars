-- ============================================================================
-- Backfill: tarefas de reuniao do AC sem metadata.duration_minutes
-- ============================================================================
-- Reunioes importadas do AC vinham sem metadata (null) porque o webhook
-- nao populava o campo. UI mostra duracao usando metadata.duration_minutes
-- ou 30min padrao — sem o campo, o card de reuniao no calendario fica
-- inconsistente.
--
-- Este backfill seta duration_minutes=15 (novo default da UI tambem) em
-- tarefas tipo reuniao* do AC que ainda nao tem metadata, sem sobrescrever
-- valores existentes.
-- ============================================================================

UPDATE public.tarefas
SET metadata = jsonb_build_object('duration_minutes', 15)
WHERE tipo IN ('reuniao','reuniao_video','reuniao_presencial','reuniao_telefone')
  AND external_source = 'active_campaign'
  AND (metadata IS NULL OR NOT (metadata ? 'duration_minutes'))
  AND deleted_at IS NULL;
