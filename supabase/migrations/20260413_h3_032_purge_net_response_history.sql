-- H3-032: mitiga OOM do cron 4 (n8n-ai-extraction-dispatch).
-- net._http_response acumulou 392MB/2930 rows desde 2026-04-13 11:22. A tabela
-- cresce ilimitadamente e o background worker do pg_net fica OOM ao consultá-la
-- antes de enfileirar novas requisições. Purga histórico antigo e instala job
-- recorrente de limpeza.

DELETE FROM net._http_response
WHERE created < NOW() - INTERVAL '1 hour';

CREATE OR REPLACE FUNCTION public.cleanup_net_http_response()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'net', 'extensions'
AS $function$
    DELETE FROM net._http_response WHERE created < NOW() - INTERVAL '1 hour';
$function$;

-- Agenda cleanup a cada 10 minutos (idempotente via unschedule antes)
DO $$
BEGIN
    PERFORM cron.unschedule('cleanup-net-http-response')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-net-http-response');
END$$;

SELECT cron.schedule(
    'cleanup-net-http-response',
    '*/10 * * * *',
    'SELECT public.cleanup_net_http_response()'
);
