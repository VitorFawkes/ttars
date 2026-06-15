-- 20260612b — ww_funil_casal: SÓ deals do funil Weddings (is_ww)
--
-- PROBLEMA (achado pelo Vitor): leads WelConnect (esteira AC 37) apareciam nos
-- indicadores. Causa-raiz: refresh_ww_funil_casal agregava ww_ac_deal_funnel_cache
-- e ww_deal_event SEM filtrar is_ww — 351 contatos sem NENHUM deal Weddings
-- viravam "casal": 138 SDR Trips (8), 79 WelConnect (37), 53 Consultoras TRIPS (6),
-- 47 WTN Desqualificados (34), 33 Extras Viagem (20), 1 (31).
--
-- FIX: CTE ww_contacts = evidência Weddings (deal is_ww OU marco WW na jornada).
-- ev e cf só agregam contatos com evidência; linha de esteira 37 (WelConnect)
-- NUNCA contribui (nem título/dims em contato misto). Casamento real que migrou
-- de esteira após ganhar (DW/EW em Consultoras TRIPS: Ana Paula e Antonio,
-- Sandra e Alex, Vanessa e Fernando) PERMANECE via marcos da jornada.
-- Contato misto verificado (79465 "Carol e Felipe": casamento ganho + deal WC):
-- PERMANECE via deal Weddings; deal WC deixa de contribuir.
-- CRM verificado: 0 cards WC na org Weddings. Motivo de perda de deal não-WW em
-- contato misto: 0 casos (cf filtrado garante daqui pra frente).
--
-- DILIGÊNCIA (TOP-5 #5 / guard de rebase): definições anteriores em
-- 20260602j → 20260602k (fez_sdr etapas 8/61) → 20260604e/f (dim do cadastro
-- recente não-vazio) → 20260604b (is_perdido) → 20260612a (data real da reunião,
-- régua 24h). Esta migration parte da DEFINIÇÃO VIVA DE PRODUÇÃO (pg_get_functiondef,
-- 2026-06-12, já com 20260612a) e muda APENAS os dois filtros acima.

DROP FUNCTION IF EXISTS public.refresh_ww_funil_casal();

CREATE FUNCTION public.refresh_ww_funil_casal()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID := 'b0000000-0000-0000-0000-000000000002';
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
        faixa, convidados, destino, origem, consultor_id, consultor_nome,
        is_perdido, refreshed_at
    )
    -- 20260612b: casal só existe com EVIDÊNCIA Weddings — deal em esteira WW
    -- (is_ww) OU marco WW na jornada (esteiras 3/4/12/22/23, etapas de closer/
    -- elopement/SDR). Lead puro de WelConnect (37), Trips (6/8/20) ou WTN (34)
    -- não tem nem um nem outro → some do painel. Casamento real que migrou de
    -- esteira depois de ganhar (ex: DW que foi pra Consultoras TRIPS) tem marcos
    -- na jornada → permanece, com título/dims do cadastro dele.
    WITH ww_contacts AS (
        -- evidência 1: deal em esteira Weddings no cache
        SELECT contact_id FROM ww_ac_deal_funnel_cache
        WHERE contact_id IS NOT NULL AND is_ww
        UNION
        -- evidência 2: marco Weddings na jornada (cobre casamento que migrou de
        -- esteira depois de ganhar — ex: DW movido pra Consultoras TRIPS)
        SELECT contact_id FROM ww_deal_event
        WHERE org_id = v_org AND contact_id IS NOT NULL
          AND (   (kind = 'esteira' AND (to_id IN ('3','4','12','22','23') OR from_id = '12'))
               OR (kind = 'etapa'   AND to_id IN ('8','61','13','15','16','221','184','199')) )
        UNION
        -- evidência 3: jornada de deal que NÃO está no cache (deletado do Active) —
        -- contava antes e continua contando, EXCETO se a jornada prova WelConnect
        SELECT e3.contact_id FROM ww_deal_event e3
        WHERE e3.org_id = v_org AND e3.contact_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM ww_ac_deal_funnel_cache c3 WHERE c3.ac_deal_id = e3.ac_deal_id)
          AND NOT EXISTS (SELECT 1 FROM ww_deal_event e4
                          WHERE e4.org_id = v_org AND e4.contact_id = e3.contact_id
                            AND e4.kind = 'esteira' AND (e4.to_id = '37' OR e4.from_id = '37'))
    ), ev AS (
        SELECT e.contact_id,
            min(event_ts) FILTER (WHERE kind='esteira' AND to_id='3')                  AS entrou_closer_at,
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id='13')                 AS entrou_1a_reuniao_at,
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id='15')                 AS entrou_contrato_enviado_at,
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id='16')                 AS entrou_negociacao_at,
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id='221')                AS entrou_op_futura_at,
            min(event_ts) FILTER (WHERE kind='esteira' AND to_id='4')                  AS entrou_planejamento_at,
            min(event_ts) FILTER (WHERE kind='esteira' AND to_id='22')                 AS entrou_producao_at,
            min(event_ts) FILTER (WHERE kind='esteira' AND to_id='23')                 AS entrou_controle_at,
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id IN ('184','199'))     AS elopement_assinatura_at,
            min(event_ts) FILTER (WHERE kind='etapa'   AND to_id IN ('8','61'))        AS sdr_fez_stage_at,
            bool_or(kind='esteira' AND (to_id='12' OR from_id='12'))                   AS is_elo,
            min(event_ts)                                                              AS first_ev
        FROM ww_deal_event e
        JOIN ww_contacts wc ON wc.contact_id = e.contact_id
        WHERE e.org_id = v_org
        GROUP BY e.contact_id
    ), cf AS (
        SELECT c.contact_id,
            min(deal_created_at)                                                          AS lead_created_at,
            min(sdr_agendou_at)                                                           AS sdr_agendou_at,
            (array_agg(sdr_canal::text)    FILTER (WHERE sdr_canal IS NOT NULL))[1]       AS sdr_canal,
            min(closer_agendou_at)                                                        AS closer_agendou_at,
            (array_agg(closer_canal::text) FILTER (WHERE closer_canal IS NOT NULL))[1]    AS closer_canal,
            -- 20260612a: quando o registro "como foi feita" foi escrito no Active
            min(sdr_como_registrado_at)                                                   AS sdr_reg_at,
            min(closer_como_registrado_at)                                                AS closer_reg_at,
            (array_agg(deal_title      ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE deal_title IS NOT NULL))[1]      AS deal_title,
            bool_or(COALESCE(is_elopement_pipeline,FALSE))                                AS is_elo_pipe,
            (array_agg(faixa_raw       ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE btrim(faixa_raw) <> ''))[1]       AS faixa_raw,
            (array_agg(convidados_raw  ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE btrim(convidados_raw) <> ''))[1]  AS convidados_raw,
            (array_agg(destino_raw     ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE btrim(destino_raw) <> ''))[1]     AS destino_raw,
            (array_agg(COALESCE(utm_source,origem_conversao) ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE btrim(COALESCE(utm_source,origem_conversao)) <> ''))[1] AS origem_raw,
            (array_agg(consultor_id    ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE consultor_id IS NOT NULL))[1]    AS consultor_id,
            (array_agg(owner_nome      ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE owner_nome IS NOT NULL))[1]      AS consultor_nome,
            bool_or(motivo_perda_sdr_raw IS NOT NULL OR motivo_perda_closer_raw IS NOT NULL) AS tem_motivo_perda
        FROM ww_ac_deal_funnel_cache c
        JOIN ww_contacts wc2 ON wc2.contact_id = c.contact_id
        -- 20260612b: deal WelConnect (37) nunca contribui título/dims/motivo,
        -- nem em contato misto (casamento real + deal WC).
        WHERE c.pipeline_group_id IS DISTINCT FROM 37
        GROUP BY c.contact_id
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
            cf.sdr_reg_at, cf.closer_reg_at,
            _ww2_norm_faixa_strict(cf.faixa_raw)      AS faixa,
            _ww2_norm_conv_strict(cf.convidados_raw)  AS convidados,
            _ww2_norm_dest_strict(cf.destino_raw)     AS destino,
            _ww_ac_norm_origem(cf.origem_raw)         AS origem,
            cf.consultor_id, cf.consultor_nome, cf.tem_motivo_perda,
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
        (sdr_agendou_at IS NOT NULL), sdr_agendou_at,
        (sdr_canal_real OR sdr_fez_stage_at IS NOT NULL),
        -- 20260612a: régua de 24h — registro muito depois da marcada = remarcação não atualizada
        CASE WHEN sdr_canal_real THEN
            CASE WHEN sdr_reg_at IS NOT NULL AND sdr_agendou_at IS NOT NULL AND sdr_reg_at > sdr_agendou_at + INTERVAL '24 hours'
                 THEN sdr_reg_at
                 ELSE COALESCE(sdr_agendou_at, sdr_reg_at) END
        ELSE sdr_fez_stage_at END,
        CASE WHEN sdr_canal_real THEN 'campo' WHEN sdr_fez_stage_at IS NOT NULL THEN 'andamento' END,
        (closer_agendou_at IS NOT NULL OR entrou_closer_at IS NOT NULL),
        COALESCE(closer_agendou_at, entrou_closer_at),
        CASE WHEN closer_agendou_at IS NOT NULL THEN 'campo' WHEN entrou_closer_at IS NOT NULL THEN 'andamento' END,
        (closer_canal_real OR entrou_contrato_enviado_at IS NOT NULL OR entrou_negociacao_at IS NOT NULL
            OR entrou_op_futura_at IS NOT NULL OR entrou_planejamento_at IS NOT NULL),
        LEAST(entrou_contrato_enviado_at, entrou_negociacao_at, entrou_op_futura_at, entrou_planejamento_at,
              -- 20260612a: régua de 24h no ramo do campo
              CASE WHEN closer_canal_real THEN
                  CASE WHEN closer_reg_at IS NOT NULL AND closer_agendou_at IS NOT NULL AND closer_reg_at > closer_agendou_at + INTERVAL '24 hours'
                       THEN closer_reg_at
                       ELSE COALESCE(closer_agendou_at, closer_reg_at) END
              END),
        CASE WHEN (entrou_contrato_enviado_at IS NOT NULL OR entrou_negociacao_at IS NOT NULL OR entrou_op_futura_at IS NOT NULL)
                  THEN 'andamento' WHEN closer_canal_real THEN 'campo' WHEN entrou_planejamento_at IS NOT NULL THEN 'andamento' END,
        (entrou_planejamento_at IS NOT NULL OR elopement_assinatura_at IS NOT NULL),
        COALESCE(entrou_planejamento_at, elopement_assinatura_at),
        CASE WHEN entrou_planejamento_at IS NOT NULL OR elopement_assinatura_at IS NOT NULL THEN 'andamento' END,
        faixa, convidados, destino, origem, consultor_id, consultor_nome,
        ((entrou_planejamento_at IS NULL AND elopement_assinatura_at IS NULL) AND COALESCE(tem_motivo_perda, FALSE)),
        now()
    FROM j
    WHERE contact_id IS NOT NULL;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END $function$


-- Reconstrói a tabela já sem os contatos não-Weddings
SELECT public.refresh_ww_funil_casal();
