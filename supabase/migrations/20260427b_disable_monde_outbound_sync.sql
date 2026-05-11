-- Desliga o caminho CRM → Monde (outbound).
-- Mantém a importação Monde → CRM (inbound) funcionando.
--
-- Camadas de defesa:
-- 1. integration_settings.MONDE_V2_SYNC_DIRECTION = 'inbound_only'
--    Trigger log_monde_people_event() já checa esse valor e short-circuit antes
--    de enfileirar em monde_people_queue.
-- 2. scheduled_job_kill_switch.is_enabled = false para 'monde-people-dispatch'
--    Cron continua ativo (a cada 2min) mas o wrapper retorna 'paused' sem
--    chamar a edge function. Ver migration 20260414d.
--
-- Reversível: para reativar o envio, basta UPDATE nas duas linhas abaixo
-- (value='bidirectional' ou 'outbound_only', is_enabled=true).

BEGIN;

-- 1. Trava o sync na direção inbound_only
UPDATE public.integration_settings
SET value = 'inbound_only',
    updated_at = NOW()
WHERE key = 'MONDE_V2_SYNC_DIRECTION';

-- Garante que a row existe (defensivo — projetos antigos podem não ter o seed)
INSERT INTO public.integration_settings (key, value, description)
SELECT 'MONDE_V2_SYNC_DIRECTION', 'inbound_only', 'Direção do sync: bidirectional, outbound_only, inbound_only'
WHERE NOT EXISTS (
  SELECT 1 FROM public.integration_settings WHERE key = 'MONDE_V2_SYNC_DIRECTION'
);

-- 2. Pausa o cron de despacho via kill switch
UPDATE public.scheduled_job_kill_switch
SET is_enabled = false
WHERE job_name = 'monde-people-dispatch';

COMMIT;
