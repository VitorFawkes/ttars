-- ============================================================================
-- WEDDINGS — Analytics 2: sync contínuo dos campos do analytics (cache → card)
-- ============================================================================
-- O backfill 20260619c foi carga única. Conforme novas reuniões/ganhos entram no
-- Active (cache ww_ac_deal_funnel_cache atualizado pelo cron ww-ac-funnel-sync */30),
-- os campos do card voltariam a defasar. Esta função + pg_cron mantém os 5 campos
-- do analytics preenchidos a partir do cache, FILL-EMPTY-ONLY, tocando só cards com
-- pendência (campo vazio + cache tem valor) → poucos por run, sem flood de activities
-- (não precisa desligar card_update_activity_trigger).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ww_sync_analytics_fields_from_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_n integer;
BEGIN
    PERFORM set_config('app.update_source', 'integration', true);

    WITH upd AS (
        UPDATE public.cards c
        SET produto_data = c.produto_data
            || CASE WHEN COALESCE(c.produto_data->>'ww_sdr_data_reuniao','')='' AND fc.sdr_agendou_at IS NOT NULL
                    THEN jsonb_build_object('ww_sdr_data_reuniao',
                         to_char(fc.sdr_agendou_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS-03:00'))
                    ELSE '{}'::jsonb END
            || CASE WHEN COALESCE(c.produto_data->>'ww_sdr_como_reuniao','')='' AND fc.sdr_fez
                         AND COALESCE(array_to_string(fc.sdr_canal,', '),'')<>''
                    THEN jsonb_build_object('ww_sdr_como_reuniao', array_to_string(fc.sdr_canal,', '))
                    ELSE '{}'::jsonb END
            || CASE WHEN COALESCE(c.produto_data->>'ww_closer_data_reuniao','')='' AND fc.closer_agendou_at IS NOT NULL
                    THEN jsonb_build_object('ww_closer_data_reuniao',
                         to_char(fc.closer_agendou_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS-03:00'))
                    ELSE '{}'::jsonb END
            || CASE WHEN COALESCE(c.produto_data->>'ww_closer_como_reuniao','')='' AND fc.closer_fez
                         AND COALESCE(fc.closer_canal,'') NOT IN ('','Não teve reunião')
                    THEN jsonb_build_object('ww_closer_como_reuniao', fc.closer_canal)
                    ELSE '{}'::jsonb END
            || CASE WHEN COALESCE(c.produto_data->>'ww_closer_data_ganho','')='' AND fc.ganho_at IS NOT NULL
                    THEN jsonb_build_object('ww_closer_data_ganho',
                         to_char(fc.ganho_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS-03:00'))
                    ELSE '{}'::jsonb END
        FROM public.ww_ac_deal_funnel_cache fc
        WHERE fc.ac_deal_id = c.external_id
          AND fc.is_ww
          AND c.org_id = 'b0000000-0000-0000-0000-000000000002'::uuid
          AND c.produto = 'WEDDING'
          AND c.deleted_at IS NULL
          -- só toca quem tem PENDÊNCIA (campo vazio + cache tem valor):
          AND (
               (COALESCE(c.produto_data->>'ww_sdr_data_reuniao','')='' AND fc.sdr_agendou_at IS NOT NULL)
            OR (COALESCE(c.produto_data->>'ww_sdr_como_reuniao','')='' AND fc.sdr_fez AND COALESCE(array_to_string(fc.sdr_canal,', '),'')<>'')
            OR (COALESCE(c.produto_data->>'ww_closer_data_reuniao','')='' AND fc.closer_agendou_at IS NOT NULL)
            OR (COALESCE(c.produto_data->>'ww_closer_como_reuniao','')='' AND fc.closer_fez AND COALESCE(fc.closer_canal,'') NOT IN ('','Não teve reunião'))
            OR (COALESCE(c.produto_data->>'ww_closer_data_ganho','')='' AND fc.ganho_at IS NOT NULL)
          )
        RETURNING 1
    )
    SELECT count(*) INTO v_n FROM upd;
    RETURN v_n;
END
$fn$;

COMMENT ON FUNCTION public.ww_sync_analytics_fields_from_cache() IS
  'Sync contínuo (fill-empty-only) dos 5 campos do analytics do card a partir de ww_ac_deal_funnel_cache. Roda via pg_cron ww-sync-analytics-fields (20,50). Retorna nº de cards atualizados. Migration 20260619e.';

-- pg_cron irmão (idempotente). Roda :20 e :50, depois do cache (*/30 em :00/:30).
SELECT cron.unschedule('ww-sync-analytics-fields')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ww-sync-analytics-fields');

SELECT cron.schedule(
  'ww-sync-analytics-fields',
  '20,50 * * * *',
  $$ SELECT public.ww_sync_analytics_fields_from_cache(); $$
);

COMMIT;
