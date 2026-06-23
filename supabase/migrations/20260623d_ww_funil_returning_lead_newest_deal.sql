-- 20260623d — Funil WW: lead que VOLTA usa o negócio mais recente (não funde o velho)
-- Problema: ww_funil_casal agrupa por contato e fundia TODOS os negócios da pessoa —
--   data da reunião = min() (negócio mais ANTIGO vencia) e is_perdido herdava o motivo
--   de perda do negócio velho mesmo havendo negócio NOVO aberto. Resultado: casal que
--   voltou (ex: deals 30305/Milena 17/06, 30363/Jennyfer 19/06) caía na semana antiga
--   (dez/2025, mai/2026) como PERDIDO, e a reunião nova não contava na semana certa.
-- Correção cirúrgica (caminho B aprovado pelo Vitor 23/06):
--   1) campos de reunião (sdr/closer: agendou_at, canal, como_registrado_at) passam a vir
--      do negócio MAIS RECENTE da pessoa (array_agg ORDER BY deal_created_at DESC)[1],
--      no mesmo padrão que título/faixa/consultor já usavam — em vez de min()/[1] solto.
--   2) is_perdido só vale se a pessoa NÃO tem negócio aberto (tem_deal_aberto = FALSE).
-- Blast radius PROVÁVEL = só contatos com 2+ negócios (raro). Contato de 1 negócio:
--   min() == "mais recente" == único valor -> NADA muda.
-- lead_created_at segue min() (entrada = 1a vez que a pessoa apareceu) — inalterado.
-- Base = def viva 20260617e (preserva nascimento certo, tipo-por-funil 20260616j, ganho
--   campo 87 20260615g — todos incluídos nesta versão; só mudam cf de reunião + is_perdido).

CREATE OR REPLACE FUNCTION public.refresh_ww_funil_casal()
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
        is_perdido,
        entrou_sdr, entrou_elopement, tipo_entrada, entrou_valido,
        refreshed_at
    )
    WITH ww_contacts AS (
        SELECT contact_id FROM ww_ac_deal_funnel_cache
        WHERE contact_id IS NOT NULL AND is_ww
        UNION
        SELECT contact_id FROM ww_deal_event
        WHERE org_id = v_org AND contact_id IS NOT NULL
          AND (   (kind = 'esteira' AND (to_id IN ('3','4','12','22','23') OR from_id = '12'))
               OR (kind = 'etapa'   AND to_id IN ('8','61','13','15','16','221','184','199')) )
        UNION
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
            bool_or(kind='esteira' AND (to_id='1' OR from_id='1'))                     AS touched_sdr_ev,
            min(event_ts)                                                              AS first_ev
        FROM ww_deal_event e
        JOIN ww_contacts wc ON wc.contact_id = e.contact_id
        WHERE e.org_id = v_org
        GROUP BY e.contact_id
    ), cf AS (
        SELECT c.contact_id,
            min(deal_created_at)                                                          AS lead_created_at,
            -- 20260623d: reunião vem do negócio MAIS RECENTE (não min()), pra lead que
            -- voltou refletir a reunião nova, não a do negócio velho.
            (array_agg(sdr_agendou_at      ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE sdr_agendou_at IS NOT NULL))[1]    AS sdr_agendou_at,
            (array_agg(sdr_canal::text     ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE sdr_canal IS NOT NULL))[1]         AS sdr_canal,
            (array_agg(closer_agendou_at   ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE closer_agendou_at IS NOT NULL))[1] AS closer_agendou_at,
            (array_agg(closer_canal::text  ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE closer_canal IS NOT NULL))[1]      AS closer_canal,
            (array_agg(sdr_como_registrado_at    ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE sdr_como_registrado_at IS NOT NULL))[1]    AS sdr_reg_at,
            (array_agg(closer_como_registrado_at ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE closer_como_registrado_at IS NOT NULL))[1] AS closer_reg_at,
            min(ganho_at)                                                                 AS campo87_at,
            (array_agg(deal_title      ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE deal_title IS NOT NULL))[1]      AS deal_title,
            bool_or(COALESCE(is_elopement_pipeline,FALSE))                                AS is_elo_pipe,
            bool_or(pipeline_group_id = 1)                                                AS in_sdr_pipe,
            bool_or(pipeline_group_id = 12)                                               AS in_elo_grp,
            bool_or(pipeline_group_id IN (3,4,14,17,22,23,24,25))                         AS in_funil_cas,
            bool_or(pipeline_group_id IN (5,9,10,11,19,21))                               AS in_guest_grp,
            bool_and(COALESCE(is_fake,FALSE))                                             AS all_fake_val,
            bool_and(COALESCE(is_duplicado,FALSE))                                        AS all_dup_val,
            (array_agg(faixa_raw       ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE btrim(faixa_raw) <> ''))[1]       AS faixa_raw,
            (array_agg(convidados_raw  ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE btrim(convidados_raw) <> ''))[1]  AS convidados_raw,
            (array_agg(destino_raw     ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE btrim(destino_raw) <> ''))[1]     AS destino_raw,
            (array_agg(COALESCE(utm_source,origem_conversao) ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE btrim(COALESCE(utm_source,origem_conversao)) <> ''))[1] AS origem_raw,
            (array_agg(consultor_id    ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE consultor_id IS NOT NULL))[1]    AS consultor_id,
            (array_agg(owner_nome      ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE owner_nome IS NOT NULL))[1]      AS consultor_nome,
            (array_agg(tipo_casamento  ORDER BY deal_created_at DESC NULLS LAST) FILTER (WHERE tipo_casamento IS NOT NULL))[1]  AS campo30,
            bool_or(motivo_perda_sdr_raw IS NOT NULL OR motivo_perda_closer_raw IS NOT NULL) AS tem_motivo_perda,
            bool_or(ac_status = 0)        AS tem_deal_aberto,
            bool_or(ac_status IN (2,3))   AS tem_deal_perdido
        FROM ww_ac_deal_funnel_cache c
        JOIN ww_contacts wc2 ON wc2.contact_id = c.contact_id
        WHERE c.pipeline_group_id IS DISTINCT FROM 37
        GROUP BY c.contact_id
    ), j AS (
        SELECT
            COALESCE(ev.contact_id, cf.contact_id) AS contact_id,
            cf.deal_title,
            COALESCE(ev.is_elo, cf.is_elo_pipe, FALSE) AS is_elo,
            (COALESCE(ev.touched_sdr_ev, FALSE) OR COALESCE(cf.in_sdr_pipe, FALSE)) AS entrou_sdr_val,
            (COALESCE(ev.is_elo, FALSE) OR COALESCE(cf.is_elo_pipe, FALSE) OR COALESCE(cf.in_elo_grp, FALSE) OR cf.campo30 = 'Elopment Wedding') AS entrou_elop_val,
            (cf.deal_title ~ '-\s*W\s*-') AS is_convidado_val,
            (btrim(coalesce(cf.deal_title,'')) = '') AS is_incompleto_val,
            COALESCE(cf.in_funil_cas, FALSE) AS in_funil_cas,
            COALESCE(cf.all_fake_val, FALSE) AS all_fake_val,
            COALESCE(cf.all_dup_val, FALSE) AS all_dup_val,
            (CASE
               WHEN cf.campo87_at >= TIMESTAMPTZ '2026-01-01' THEN TRUE
               WHEN COALESCE(ev.entrou_planejamento_at, ev.elopement_assinatura_at) < TIMESTAMPTZ '2026-01-01'
                    THEN (ev.entrou_planejamento_at IS NOT NULL OR ev.elopement_assinatura_at IS NOT NULL)
               ELSE FALSE
             END) AS is_ganho,
            CASE
                WHEN COALESCE(ev.touched_sdr_ev, FALSE) OR COALESCE(cf.in_sdr_pipe, FALSE)
                     THEN 'DW'
                WHEN COALESCE(ev.is_elo, FALSE) OR COALESCE(cf.is_elo_pipe, FALSE)
                     OR COALESCE(cf.in_elo_grp, FALSE) OR cf.campo30 = 'Elopment Wedding'
                     THEN 'Elopement'
                ELSE 'DW'
            END AS tipo_final,
            COALESCE(cf.lead_created_at, ev.first_ev) AS lead_created_at,
            ev.entrou_closer_at, ev.entrou_1a_reuniao_at, ev.entrou_contrato_enviado_at, ev.entrou_negociacao_at,
            ev.entrou_op_futura_at, ev.entrou_planejamento_at, ev.entrou_producao_at, ev.entrou_controle_at,
            ev.elopement_assinatura_at, ev.sdr_fez_stage_at,
            cf.sdr_agendou_at, cf.sdr_canal, cf.closer_agendou_at, cf.closer_canal,
            cf.sdr_reg_at, cf.closer_reg_at,
            cf.campo87_at,
            _ww2_norm_faixa_strict(cf.faixa_raw)      AS faixa,
            _ww2_norm_conv_strict(cf.convidados_raw)  AS convidados,
            _ww2_norm_dest_strict(cf.destino_raw)     AS destino,
            _ww_ac_norm_origem(cf.origem_raw)         AS origem,
            cf.consultor_id, cf.consultor_nome, cf.tem_motivo_perda, cf.tem_deal_aberto, cf.tem_deal_perdido,
            (cf.sdr_canal    IS NOT NULL AND cf.sdr_canal    NOT ILIKE '%não teve%'
             AND btrim(cf.sdr_canal,    ' {}[]"') NOT IN ('', 'NULL', 'null')) AS sdr_canal_real,
            (cf.closer_canal IS NOT NULL AND cf.closer_canal NOT ILIKE '%não teve%'
             AND btrim(cf.closer_canal, ' {}[]"') NOT IN ('', 'NULL', 'null')) AS closer_canal_real
        FROM ev FULL OUTER JOIN cf ON ev.contact_id = cf.contact_id
    ), jj AS (
        SELECT *,
            CASE
                WHEN is_ganho AND entrou_elop_val AND NOT entrou_sdr_val THEN 'Elopement'
                WHEN is_ganho THEN 'DW'
                WHEN is_convidado_val OR is_incompleto_val OR all_fake_val OR all_dup_val THEN NULL
                WHEN entrou_sdr_val THEN 'DW'
                WHEN entrou_elop_val THEN 'Elopement'
                WHEN in_funil_cas THEN 'DW'
                ELSE NULL
            END AS tipo_entrada_val
        FROM j
    )
    SELECT
        v_org, contact_id, deal_title,
        tipo_final, (tipo_final = 'Elopement'), lead_created_at,
        entrou_closer_at, entrou_1a_reuniao_at, entrou_contrato_enviado_at, entrou_negociacao_at,
        entrou_op_futura_at, entrou_planejamento_at, entrou_producao_at, entrou_controle_at, elopement_assinatura_at,
        sdr_agendou_at, sdr_canal, closer_agendou_at, closer_canal,
        (sdr_agendou_at IS NOT NULL), sdr_agendou_at,
        (sdr_canal_real OR sdr_fez_stage_at IS NOT NULL),
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
              CASE WHEN closer_canal_real THEN
                  CASE WHEN closer_reg_at IS NOT NULL AND closer_agendou_at IS NOT NULL AND closer_reg_at > closer_agendou_at + INTERVAL '24 hours'
                       THEN closer_reg_at
                       ELSE COALESCE(closer_agendou_at, closer_reg_at) END
              END),
        CASE WHEN (entrou_contrato_enviado_at IS NOT NULL OR entrou_negociacao_at IS NOT NULL OR entrou_op_futura_at IS NOT NULL)
                  THEN 'andamento' WHEN closer_canal_real THEN 'campo' WHEN entrou_planejamento_at IS NOT NULL THEN 'andamento' END,
        (CASE
           WHEN campo87_at >= TIMESTAMPTZ '2026-01-01' THEN TRUE
           WHEN COALESCE(entrou_planejamento_at, elopement_assinatura_at) < TIMESTAMPTZ '2026-01-01'
                THEN (entrou_planejamento_at IS NOT NULL OR elopement_assinatura_at IS NOT NULL)
           ELSE FALSE
         END),
        (CASE
           WHEN campo87_at >= TIMESTAMPTZ '2026-01-01' THEN campo87_at
           WHEN COALESCE(entrou_planejamento_at, elopement_assinatura_at) < TIMESTAMPTZ '2026-01-01'
                THEN COALESCE(entrou_planejamento_at, elopement_assinatura_at)
           ELSE NULL
         END),
        (CASE
           WHEN campo87_at >= TIMESTAMPTZ '2026-01-01' THEN 'campo_ganho'
           WHEN COALESCE(entrou_planejamento_at, elopement_assinatura_at) < TIMESTAMPTZ '2026-01-01'
                AND (entrou_planejamento_at IS NOT NULL OR elopement_assinatura_at IS NOT NULL) THEN 'andamento'
           ELSE NULL
         END),
        faixa, convidados, destino, origem, consultor_id, consultor_nome,
        -- 20260623d: perdido só se a pessoa NAO tem negócio aberto (lead que voltou e
        -- reabriu não é mais "perdido", mesmo carregando motivo de perda do negócio velho).
        ((entrou_planejamento_at IS NULL AND elopement_assinatura_at IS NULL)
            AND NOT COALESCE(tem_deal_aberto, FALSE)
            AND (COALESCE(tem_motivo_perda, FALSE) OR COALESCE(tem_deal_perdido, FALSE))),
        entrou_sdr_val, entrou_elop_val, tipo_entrada_val, (tipo_entrada_val IS NOT NULL),
        now()
    FROM jj
    WHERE contact_id IS NOT NULL;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN v_n;
END $function$;

SELECT refresh_ww_funil_casal();
