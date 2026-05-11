-- TTL automático para ai_agent_turn_logs: deleta linhas com mais de 30 dias.
-- Cron diário às 3am (BRT ~ 6am UTC, mas usaremos UTC sem ajuste).

CREATE OR REPLACE FUNCTION cleanup_ai_agent_turn_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM ai_agent_turn_logs WHERE created_at < now() - interval '30 days';
END $$;

COMMENT ON FUNCTION cleanup_ai_agent_turn_logs IS
  'Apaga linhas de ai_agent_turn_logs com mais de 30 dias. Chamado por cron diário 03:00 UTC.';

-- Schedule via pg_cron (idempotente — unschedule se já existe)
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-ai-agent-turn-logs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-ai-agent-turn-logs',
  '0 3 * * *',
  $$SELECT cleanup_ai_agent_turn_logs()$$
);
