-- ============================================================================
-- FIX: "Reagendamento SDR" (etapa 201) NÃO conta como Fez SDR — reunião foi
-- remarcada, não aconteceu. Mesma lógica do "Reagendamento Closer" (222), que
-- já estava fora. Sinal de Fez SDR por andamento agora = só etapas 8 (Qualificado
-- pela SDR) e 61 (Aguardando pagamento TAXA). Recria refresh_ww_funil_casal.
-- ============================================================================

DROP FUNCTION IF EXISTS public.refresh_ww_funil_casal();

CREATE FUNCTION public.refresh_ww_funil_casal()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE
    v_org UUID := 'b0000000-0000-0000-0000-000000000002';   -- Welcome Weddings
    v_n INTEGER;
BEGIN
    DELETE FROM ww_funil_casal WHERE org_id = v_org;

    INSERT INTO ww_funil_casal (
        org_id, contact_id, deal_title, tipo, is_elopement, lead_created_at,
        entrou_closer_at, entrou_1a_reuniao_at, entrou_contrato_enviado_at, entrou_negociacao_at,
        entrou_op_futura_at, entrou_planejamento_at, entrou_producao_at, entrou_controle_at, elopement_assinatura_at,
        sdr_agendou_at, sdr_canal, closer_agendou_at, closer_canal,
        agendou_sdr, agendou_sdr_at,
        fez_sdr, fez_sdr_at, fez_sdr_fonte,
        agendou_closer, agendou_closer_at, agendou_closer_fonte,
        fez_closer, fez_closer_at, fez_closer_fonte,
        ganho, ganho_at, ganho_fonte,
        is_perdido, refreshed_at
    )
    WITH ev AS (
        SELECT contact_id,
            min(event_ts) FILTER (WHERE kind='esteira' AND to_id='3')                  AS entrou_closer_at,
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id='13')                 AS entrou_1a_reuniao_at,
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id='15')                 AS entrou_contrato_enviado_at,
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id='16')                 AS entrou_negociacao_at,
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id='221')                AS entrou_op_futura_at,
            min(event_ts) FILTER (WHERE kind='esteira' AND to_id='4')                  AS entrou_planejamento_at,
            min(event_ts) FILTER (WHERE kind='esteira' AND to_id='22')                 AS entrou_producao_at,
            min(event_ts) FILTER (WHERE kind='esteira' AND to_id='23')                 AS entrou_controle_at,
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id IN ('184','199'))     AS elopement_assinatura_at,
            -- FEZ SDR por andamento: SÓ 8 (Qualificado) e 61 (Aguardando TAXA). 201 (Reagendamento) NÃO.
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id IN ('8','61'))        AS sdr_fez_stage_at,
            bool_or(kind='esteira' AND (to_id='12' OR from_id='12'))                   AS is_elo,
            min(event_ts)                                                              AS first_ev
        FROM ww_deal_event
        WHERE org_id = v_org AND contact_id IS NOT NULL
        GROUP BY contact_id
    ), cf AS (
        SELECT contact_id,
            min(deal_created_at)                                                          AS lead_created_at,
            min(sdr_agendou_at)                                                           AS sdr_agendou_at,
            (array_agg(sdr_canal::text) FILTER (WHERE sdr_canal IS NOT NULL))[1]          AS sdr_canal,
            min(closer_agendou_at)                                                        AS closer_agendou_at,
            (array_agg(closer_canal::text) FILTER (WHERE closer_canal IS NOT NULL))[1]    AS closer_canal,
            (array_agg(deal_title) FILTER (WHERE deal_title IS NOT NULL))[1]              AS deal_title,
            bool_or(COALESCE(is_elopement_pipeline,FALSE))                                AS is_elo_pipe
        FROM ww_ac_deal_funnel_cache
        WHERE contact_id IS NOT NULL
        GROUP BY contact_id
    ), j AS (
        SELECT
            COALESCE(ev.contact_id, cf.contact_id) AS contact_id,
            cf.deal_title,
            COALESCE(ev.is_elo, cf.is_elo_pipe, FALSE) AS is_elo,
            COALESCE(cf.lead_created_at, ev.first_ev) AS lead_created_at,
            ev.entrou_closer_at, ev.entrou_1a_reuniao_at, ev.entrou_contrato_enviado_at, ev.entrou_negociacao_at,
            ev.entrou_op_futura_at, ev.entrou_planejamento_at, ev.entrou_producao_at, ev.entrou_controle_at,
            ev.elopement_assinatura_at, ev.sdr_fez_stage_at,
            cf.sdr_agendou_at, cf.sdr_canal, cf.closer_agendou_at, cf.closer_canal,
            (cf.sdr_canal    IS NOT NULL AND cf.sdr_canal    NOT ILIKE '%não teve%' AND cf.sdr_canal    NOT IN ('[]','""','')) AS sdr_canal_real,
            (cf.closer_canal IS NOT NULL AND cf.closer_canal NOT ILIKE '%não teve%' AND cf.closer_canal NOT IN ('[]','""','')) AS closer_canal_real
        FROM ev FULL OUTER JOIN cf ON ev.contact_id = cf.contact_id
    )
    SELECT
        v_org, contact_id, deal_title,
        CASE WHEN is_elo THEN 'Elopement' ELSE 'DW' END, is_elo, lead_created_at,
        entrou_closer_at, entrou_1a_reuniao_at, entrou_contrato_enviado_at, entrou_negociacao_at,
        entrou_op_futura_at, entrou_planejamento_at, entrou_producao_at, entrou_controle_at, elopement_assinatura_at,
        sdr_agendou_at, sdr_canal, closer_agendou_at, closer_canal,
        (sdr_agendou_at IS NOT NULL),
        sdr_agendou_at,
        (sdr_canal_real OR sdr_fez_stage_at IS NOT NULL),
        CASE WHEN sdr_canal_real THEN sdr_agendou_at ELSE sdr_fez_stage_at END,
        CASE WHEN sdr_canal_real THEN 'campo' WHEN sdr_fez_stage_at IS NOT NULL THEN 'andamento' END,
        (closer_agendou_at IS NOT NULL OR entrou_closer_at IS NOT NULL),
        COALESCE(closer_agendou_at, entrou_closer_at),
        CASE WHEN closer_agendou_at IS NOT NULL THEN 'campo' WHEN entrou_closer_at IS NOT NULL THEN 'andamento' END,
        (closer_canal_real OR entrou_contrato_enviado_at IS NOT NULL OR entrou_negociacao_at IS NOT NULL
            OR entrou_op_futura_at IS NOT NULL OR entrou_planejamento_at IS NOT NULL),
        LEAST(entrou_contrato_enviado_at, entrou_negociacao_at, entrou_op_futura_at, entrou_planejamento_at,
              CASE WHEN closer_canal_real THEN closer_agendou_at END),
        CASE WHEN (entrou_contrato_enviado_at IS NOT NULL OR entrou_negociacao_at IS NOT NULL OR entrou_op_futura_at IS NOT NULL)
                  THEN 'andamento' WHEN closer_canal_real THEN 'campo' WHEN entrou_planejamento_at IS NOT NULL THEN 'andamento' END,
        (entrou_planejamento_at IS NOT NULL OR elopement_assinatura_at IS NOT NULL),
        COALESCE(entrou_planejamento_at, elopement_assinatura_at),
        CASE WHEN entrou_planejamento_at IS NOT NULL OR elopement_assinatura_at IS NOT NULL THEN 'andamento' END,
        FALSE, now()
    FROM j
    WHERE contact_id IS NOT NULL;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END $func$;

GRANT EXECUTE ON FUNCTION public.refresh_ww_funil_casal() TO authenticated, service_role;
