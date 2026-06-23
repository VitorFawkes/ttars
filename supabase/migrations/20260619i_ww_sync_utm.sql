-- 20260619i_ww_sync_utm.sql
-- Fase 0 da revisao do Analytics 2 (ttars-only): o dashboard nativo passa a ler so o ttars,
-- e este sync (mantido) alimenta os campos do card a partir do Active em background.
-- Acrescenta UTM (utm_source/medium/campaign) ao sync ja existente (reuniao/ganho), fill-empty-only,
-- pra a aba Marketing funcionar no nativo (cards.utm_* hoje estao vazios; UTM so existe no Active).
-- Base: pg_get_functiondef vivo (CLAUDE.md regra #5).

CREATE OR REPLACE FUNCTION public.ww_sync_analytics_fields_from_cache()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                    ELSE '{}'::jsonb END,
            -- UTM (fill-empty-only): origem de campanha vive no Active -> espelha no card
            utm_source   = CASE WHEN COALESCE(c.utm_source,'')=''   AND COALESCE(fc.utm_source,'')<>''   THEN fc.utm_source   ELSE c.utm_source   END,
            utm_medium   = CASE WHEN COALESCE(c.utm_medium,'')=''   AND COALESCE(fc.utm_medium,'')<>''   THEN fc.utm_medium   ELSE c.utm_medium   END,
            utm_campaign = CASE WHEN COALESCE(c.utm_campaign,'')='' AND COALESCE(fc.utm_campaign,'')<>'' THEN fc.utm_campaign ELSE c.utm_campaign END
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
            OR (COALESCE(c.utm_source,'')=''   AND COALESCE(fc.utm_source,'')<>'')
            OR (COALESCE(c.utm_medium,'')=''   AND COALESCE(fc.utm_medium,'')<>'')
            OR (COALESCE(c.utm_campaign,'')='' AND COALESCE(fc.utm_campaign,'')<>'')
          )
        RETURNING 1
    )
    SELECT count(*) INTO v_n FROM upd;
    RETURN v_n;
END
$function$;


-- Backfill imediato dos cards existentes (a funcao e fill-empty-only; rodar agora popula tudo):
SELECT public.ww_sync_analytics_fields_from_cache();
