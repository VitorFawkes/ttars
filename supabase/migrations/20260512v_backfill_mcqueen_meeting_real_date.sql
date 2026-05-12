-- ============================================================================
-- Backfill: data real da reuniao do McQueen (campo custom do deal AC)
-- ============================================================================
-- AC tem 2 fontes pra horario de reuniao:
--   1. task[duedate]: a tarefa criada (pode ser auto-gerada por automacao,
--      com duedate=agora)
--   2. deal[fields][N] com nome tipo "Data e horario do agendamento da
--      1a. Reuniao": campo custom que o usuario preenche com o horario
--      real da reuniao
--
-- Estavamos usando (1) — gravava o instante da criacao da task. O correto
-- e (2). Caso concreto: McQueen — usuario marcou 26/05/2026 09:00 BRT, AC
-- armazenou em field[124] como '2026-05-26 12:00:00' (UTC), mas a tarefa
-- ficou com task[duedate]=2026-05-12 15:50 UTC (instante da automacao).
--
-- Este backfill corrige especificamente as 2 tarefas do McQueen. Fix
-- generico no webhook (proxima PR) vai detectar o campo custom em todos
-- os reuniao* events daqui pra frente.
-- ============================================================================

UPDATE public.tarefas
SET data_vencimento = '2026-05-26T12:00:00+00:00'::TIMESTAMPTZ
WHERE card_id = '5d3d2428-7284-44dd-9c0a-92048382918c'
  AND tipo = 'reuniao'
  AND external_source = 'active_campaign'
  AND external_id IN ('82095','82096')
  AND deleted_at IS NULL;
