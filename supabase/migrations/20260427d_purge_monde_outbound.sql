-- Purga permanente de todos os caminhos CRM -> Monde (outbound).
-- Mantem intacta a importacao Monde -> CRM (inbound).
--
-- Removido:
--  1. Triggers e funcao que enfileiravam mudancas de contatos
--  2. Cron jobs monde-people-dispatch e monde-queue-cleanup
--  3. Linha do kill switch de monde-people-dispatch
--  4. Settings de outbound (MONDE_V2_SYNC_DIRECTION, MONDE_SHADOW_MODE)
--  5. View v_monde_sent_items (se existir)
--  6. Tabelas monde_sales, monde_sale_items, monde_people_queue
--  7. Sections com widget_component='monde' nas pipelines
--
-- Mantido:
--  - monde-people-import (inbound) e seu cron
--  - monde-people-search (inbound)
--  - funcao set_monde_import_flag() (usada pelo inbound)
--  - setting MONDE_V2_SYNC_ENABLED (usada pelo inbound como gate)
--  - colunas contatos.monde_person_id e contatos.monde_last_sync (usadas pelo inbound)

BEGIN;

-- 1) Triggers em contatos
DROP TRIGGER IF EXISTS trg_monde_people_outbound_insert ON public.contatos;
DROP TRIGGER IF EXISTS trg_monde_people_outbound_update ON public.contatos;

-- 2) Funcao que alimentava a fila
DROP FUNCTION IF EXISTS public.log_monde_people_event();

-- 3) Cron jobs outbound
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monde-people-dispatch') THEN
    PERFORM cron.unschedule('monde-people-dispatch');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monde-queue-cleanup') THEN
    PERFORM cron.unschedule('monde-queue-cleanup');
  END IF;
END $$;

-- 4) Kill switch
DELETE FROM public.scheduled_job_kill_switch
WHERE job_name = 'monde-people-dispatch';

-- 5) Settings de outbound (mantem MONDE_V2_SYNC_ENABLED, usado pelo inbound)
DELETE FROM public.integration_settings
WHERE key IN ('MONDE_V2_SYNC_DIRECTION', 'MONDE_SHADOW_MODE');

-- 6) View dependente
DROP VIEW IF EXISTS public.v_monde_sent_items CASCADE;

-- 7) Tabelas de outbound
DROP TABLE IF EXISTS public.monde_sale_items CASCADE;
DROP TABLE IF EXISTS public.monde_sales CASCADE;
DROP TABLE IF EXISTS public.monde_people_queue CASCADE;

-- 8) Sections que renderizavam o widget Monde (widget agora removido do frontend)
DELETE FROM public.sections WHERE widget_component = 'monde';

COMMIT;
