-- 20260612a — Agenda de reuniões (futuro) + data REAL da reunião feita (régua de 24h)
--
-- Pedido do Vitor (2026-06-12):
-- 1) Visão geral ganha a visão do FUTURO: reuniões marcadas (campo 6 = SDR, campo 18 = Closer)
--    — "quantas reuniões tem para o dia". Nova RPC ww_agenda_reunioes (próximas + pendentes).
-- 2) Data da reunião FEITA pela régua validada caso a caso com a Jéssica (9/9 em junho):
--    a reunião vale a DATA MARCADA, exceto quando o registro "como foi feita" chegou MAIS de
--    24h depois da marcada — sinal de remarcação sem atualizar o campo — e aí vale a data do
--    REGISTRO. (Casos reais: Laís 03/06→08/06, Mariana e Carolina 05/06→09/06; Juliana foi
--    registrada na manhã seguinte e continua valendo a marcada 02/06.)
--
-- O que muda:
--   • ww_ac_deal_funnel_cache: + sdr_como_registrado_at / closer_como_registrado_at
--     (updatedTimestamp dos campos 17/299 no Active — backfill via script local + capturas
--     no webhook por-deal e no reconcile horário).
--   • refresh_ww_funil_casal: fez_sdr_at / fez_closer_at aplicam a régua de 24h.
--     REBASE conferido (TOP-5 #5): base = 20260604f (def viva, RELIDA INTEIRA nesta sessão;
--     cadeia 20260602j→k→l→04b→04e→04f). Únicas mudanças: cf ganha min() dos registros;
--     j repassa; as duas expressões de data usam a régua. Todo o resto byte a byte igual.
--   • ww_agenda_reunioes (NOVA): próximas reuniões (até p_dias_futuro) + vencidas sem
--     registro (até p_dias_pendentes pra trás), com filtros das dimensões do casal.
--     ⚠️ Filtro de CANAL não se aplica (reunião futura ainda não tem canal) — decisão
--     intencional, documentada no subtítulo da tela.

-- ═══════════════ 1) Colunas novas no cache ═══════════════
ALTER TABLE ww_ac_deal_funnel_cache ADD COLUMN IF NOT EXISTS sdr_como_registrado_at TIMESTAMPTZ;
ALTER TABLE ww_ac_deal_funnel_cache ADD COLUMN IF NOT EXISTS closer_como_registrado_at TIMESTAMPTZ;
COMMENT ON COLUMN ww_ac_deal_funnel_cache.sdr_como_registrado_at IS 'updatedTimestamp do campo 17 (Como foi feita a 1ª reunião) no Active — quando o registro foi feito/atualizado';
COMMENT ON COLUMN ww_ac_deal_funnel_cache.closer_como_registrado_at IS 'updatedTimestamp do campo 299 (Como foi feita Reunião Closer) no Active';

-- ═══════════════ 2) refresh_ww_funil_casal — régua de 24h nas datas de "fez" ═══════════════
DROP FUNCTION IF EXISTS public.refresh_ww_funil_casal();

CREATE FUNCTION public.refresh_ww_funil_casal()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
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
END $func$;

REVOKE EXECUTE ON FUNCTION public.refresh_ww_funil_casal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_ww_funil_casal() TO authenticated, service_role;

-- ═══════════════ 3) ww_agenda_reunioes — futuro + vencidas sem registro (NOVA) ═══════════════
CREATE FUNCTION public.ww_agenda_reunioes(
    p_org_id        UUID DEFAULT NULL,
    p_dias_futuro   INT DEFAULT 7,
    p_dias_pendentes INT DEFAULT 14,
    p_origins       TEXT[] DEFAULT NULL,
    p_tipos         TEXT[] DEFAULT NULL,
    p_faixas        TEXT[] DEFAULT NULL,
    p_destinos      TEXT[] DEFAULT NULL,
    p_convidados    TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_proximas JSON; v_pendentes JSON;
BEGIN
    -- Universo: deal-level (cada agendamento tem hora própria) + dimensões/estado do casal.
    CREATE TEMP TABLE _ww_ag ON COMMIT DROP AS
    SELECT fc.ac_deal_id, fc.contact_id, fc.deal_title,
           fc.sdr_agendou_at, fc.closer_agendou_at,
           w.tipo, w.faixa, w.convidados, w.destino, w.origem, w.consultor_id, w.consultor_nome,
           COALESCE(w.fez_sdr, FALSE) AS fez_sdr, COALESCE(w.fez_closer, FALSE) AS fez_closer,
           COALESCE(w.is_perdido, FALSE) AS is_perdido,
           c.id AS card_id
      FROM ww_ac_deal_funnel_cache fc
      LEFT JOIN ww_funil_casal w ON w.contact_id = fc.contact_id AND w.org_id = v_org
      LEFT JOIN cards c ON c.external_id = fc.ac_deal_id AND c.external_source = 'active_campaign' AND c.deleted_at IS NULL
     WHERE fc.is_ww
       AND (fc.sdr_agendou_at    BETWEEN NOW() - make_interval(days => p_dias_pendentes) AND NOW() + make_interval(days => p_dias_futuro)
         OR fc.closer_agendou_at BETWEEN NOW() - make_interval(days => p_dias_pendentes) AND NOW() + make_interval(days => p_dias_futuro));

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ag WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ag WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww_ag WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww_ag WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados IS NOT NULL THEN DELETE FROM _ww_ag WHERE convidados IS NULL OR convidados != ALL(p_convidados); END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _ww_ag WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;

    -- PRÓXIMAS: reuniões marcadas de agora em diante (casal não perdido)
    SELECT COALESCE(json_agg(x ORDER BY x.quando), '[]'::JSON) INTO v_proximas
    FROM (
        SELECT fc.sdr_agendou_at AS quando, 'sdr'::TEXT AS reuniao, fc.deal_title AS casal,
               fc.tipo, fc.ac_deal_id, fc.contact_id, fc.card_id, fc.consultor_nome
          FROM _ww_ag fc
         WHERE fc.sdr_agendou_at >= NOW() AND fc.sdr_agendou_at <= NOW() + make_interval(days => p_dias_futuro)
           AND NOT fc.is_perdido
        UNION ALL
        SELECT fc.closer_agendou_at, 'closer', fc.deal_title, fc.tipo, fc.ac_deal_id, fc.contact_id, fc.card_id, fc.consultor_nome
          FROM _ww_ag fc
         WHERE fc.closer_agendou_at >= NOW() AND fc.closer_agendou_at <= NOW() + make_interval(days => p_dias_futuro)
           AND NOT fc.is_perdido
    ) x;

    -- PENDENTES: data já passou, reunião não confirmada (sem registro nem avanço), casal não perdido.
    -- É AVISO operacional (cobrar registro), não contagem.
    SELECT COALESCE(json_agg(x ORDER BY x.quando), '[]'::JSON) INTO v_pendentes
    FROM (
        SELECT fc.sdr_agendou_at AS quando, 'sdr'::TEXT AS reuniao, fc.deal_title AS casal, fc.tipo,
               fc.ac_deal_id, fc.contact_id, fc.card_id,
               EXTRACT(DAY FROM NOW() - fc.sdr_agendou_at)::INT AS dias_atraso
          FROM _ww_ag fc
         WHERE fc.sdr_agendou_at < NOW() AND fc.sdr_agendou_at >= NOW() - make_interval(days => p_dias_pendentes)
           AND NOT fc.fez_sdr AND NOT fc.is_perdido
        UNION ALL
        SELECT fc.closer_agendou_at, 'closer', fc.deal_title, fc.tipo, fc.ac_deal_id, fc.contact_id, fc.card_id,
               EXTRACT(DAY FROM NOW() - fc.closer_agendou_at)::INT
          FROM _ww_ag fc
         WHERE fc.closer_agendou_at < NOW() AND fc.closer_agendou_at >= NOW() - make_interval(days => p_dias_pendentes)
           AND NOT fc.fez_closer AND NOT fc.is_perdido
    ) x;

    DROP TABLE _ww_ag;
    RETURN json_build_object(
        'proximas', v_proximas,
        'pendentes', v_pendentes,
        'gerado_em', NOW(),
        'fonte', 'ww_ac_deal_funnel_cache (campos 6/18 do Active) + estado do casal (ww_funil_casal)'
    );
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww_agenda_reunioes(UUID, INT, INT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_agenda_reunioes(UUID, INT, INT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated, service_role;
