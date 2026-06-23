-- ============================================================================
-- WEDDINGS — Analytics 2 (Parte 2): backfill dos campos do analytics no card
-- ============================================================================
-- Completa os 5 campos do card (que o ww_funil_casal_native lê) a partir do cache
-- COMPLETO ww_ac_deal_funnel_cache (linkado via external_id = ac_deal_id):
--   sdr_agendou_at  → ww_sdr_data_reuniao   (campo 6)
--   sdr_canal[]     → ww_sdr_como_reuniao    (campo 17, só quando sdr_fez)
--   closer_agendou_at → ww_closer_data_reuniao (campo 18)
--   closer_canal    → ww_closer_como_reuniao  (campo 299, só quando closer_fez e ≠ "Não teve reunião")
--   ganho_at        → ww_closer_data_ganho    (campo 87)
--
-- FILL-EMPTY-ONLY (nunca sobrescreve valor já preenchido). Datas em formato SP local
-- (ISO -03:00) iguais aos valores existentes, p/ o _ww_native_ts parsear igual.
-- set_config(app.update_source=integration) suprime push/cadência.
--
-- ONGOING (follow-up, fora desta migration): estender a sync do cache
-- (ww-ac-funnel-sync-incremental) p/ também gravar esses campos no card, ou um cron
-- re-rodando este UPDATE, pra não voltar a defasar.
-- ============================================================================

BEGIN;

SELECT set_config('app.update_source', 'integration', true);

-- Desliga o log de activities durante o backfill (senão geraria milhares de
-- "campo alterado" datados de hoje nas timelines dos cards). Re-liga ao fim.
ALTER TABLE public.cards DISABLE TRIGGER card_update_activity_trigger;

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
  AND (fc.sdr_agendou_at IS NOT NULL OR fc.sdr_fez OR fc.closer_agendou_at IS NOT NULL
       OR fc.closer_fez OR fc.ganho_at IS NOT NULL);

ALTER TABLE public.cards ENABLE TRIGGER card_update_activity_trigger;

COMMIT;
