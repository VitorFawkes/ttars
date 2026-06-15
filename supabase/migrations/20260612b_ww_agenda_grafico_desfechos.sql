-- 20260612b — Agenda WW: série por dia (gráfico do futuro) + desfechos das reuniões marcadas
--
-- Pedido do Vitor (2026-06-12, na sequência da agenda):
--   "Preciso também de gráfico pra essa questão, pra eu ver dias e semanas futuras.
--    Além também de uma outra visão de canceladas, reagendadas, perdidos e etc.
--    Análise completa de gestor de vendas."
--
-- O que muda (amplia ww_agenda_reunioes, criada em 20260612a — única migration anterior
-- que define a função; relida inteira nesta sessão. REBASE conferido, TOP-5 #5):
--   • + p_dias_desfechos (novo parâmetro no FIM, default 30) → assinatura muda, então
--     DROP da assinatura antiga (evita overload ambíguo no PostgREST).
--   • + 'por_dia': reuniões futuras agrupadas por dia BRT [{dia, sdr, closer}] — alimenta
--     o gráfico de dias/semanas futuras (janela p_dias_futuro).
--   • + 'desfechos': reuniões cuja data marcada caiu nos últimos p_dias_desfechos —
--     classificação mutuamente exclusiva, na ordem:
--       1. feita          — fez (campo "como foi" com canal real OU avanço no funil)
--       2. nao_aconteceu  — registraram o campo mas sem canal real ("Não teve reunião")
--       3. reagendando    — etapa ATUAL é Reagendamento (SDR 201 / Closer 222)
--       4. perdida        — casal com motivo de perda e sem chegar ao planejamento
--       5. sem_registro   — venceu e ninguém registrou nem moveu (mesmo aviso da lista)
--     Volta contagens por papel + itens nominais (com motivo de perda quando houver).
--   • Etapa atual vem do último evento 'etapa' em ww_deal_event (timeline mantida por
--     webhook + reconcile horário).

DROP FUNCTION IF EXISTS public.ww_agenda_reunioes(UUID, INT, INT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[]);
DROP FUNCTION IF EXISTS public.ww_agenda_reunioes(UUID, INT, INT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], INT);

CREATE FUNCTION public.ww_agenda_reunioes(
    p_org_id        UUID DEFAULT NULL,
    p_dias_futuro   INT DEFAULT 7,
    p_dias_pendentes INT DEFAULT 14,
    p_origins       TEXT[] DEFAULT NULL,
    p_tipos         TEXT[] DEFAULT NULL,
    p_faixas        TEXT[] DEFAULT NULL,
    p_destinos      TEXT[] DEFAULT NULL,
    p_convidados    TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL,
    p_dias_desfechos INT DEFAULT 30
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_atras INT := GREATEST(p_dias_pendentes, p_dias_desfechos);
    v_proximas JSON; v_pendentes JSON; v_por_dia JSON; v_desfechos JSON;
BEGIN
    -- Universo: deal-level (cada agendamento tem hora própria) + dimensões/estado do casal.
    CREATE TEMP TABLE _ww_ag ON COMMIT DROP AS
    SELECT fc.ac_deal_id, fc.contact_id, fc.deal_title,
           fc.sdr_agendou_at, fc.closer_agendou_at,
           fc.sdr_como_registrado_at, fc.closer_como_registrado_at,
           fc.motivo_perda_sdr_raw, fc.motivo_perda_closer_raw,
           w.tipo, w.faixa, w.convidados, w.destino, w.origem, w.consultor_id, w.consultor_nome,
           COALESCE(w.fez_sdr, FALSE) AS fez_sdr, COALESCE(w.fez_closer, FALSE) AS fez_closer,
           COALESCE(w.is_perdido, FALSE) AS is_perdido,
           c.id AS card_id,
           NULL::TEXT AS curr_stage
      FROM ww_ac_deal_funnel_cache fc
      LEFT JOIN ww_funil_casal w ON w.contact_id = fc.contact_id AND w.org_id = v_org
      LEFT JOIN cards c ON c.external_id = fc.ac_deal_id AND c.external_source = 'active_campaign' AND c.deleted_at IS NULL
     WHERE fc.is_ww
       AND (fc.sdr_agendou_at    BETWEEN NOW() - make_interval(days => v_atras) AND NOW() + make_interval(days => p_dias_futuro)
         OR fc.closer_agendou_at BETWEEN NOW() - make_interval(days => v_atras) AND NOW() + make_interval(days => p_dias_futuro));

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ag WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ag WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww_ag WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww_ag WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados IS NOT NULL THEN DELETE FROM _ww_ag WHERE convidados IS NULL OR convidados != ALL(p_convidados); END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _ww_ag WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;

    -- Etapa atual (último evento de etapa na timeline) — p/ detectar "reagendando"
    UPDATE _ww_ag a SET curr_stage = e.to_id
      FROM (SELECT DISTINCT ON (ac_deal_id) ac_deal_id, to_id
              FROM ww_deal_event
             WHERE org_id = v_org AND kind = 'etapa'
               AND ac_deal_id IN (SELECT ac_deal_id FROM _ww_ag)
             ORDER BY ac_deal_id, event_ts DESC) e
     WHERE e.ac_deal_id = a.ac_deal_id;

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

    -- POR DIA (gráfico): futuras agrupadas pelo dia em Brasília
    SELECT COALESCE(json_agg(d ORDER BY d.dia), '[]'::JSON) INTO v_por_dia
    FROM (
        SELECT (x.quando AT TIME ZONE 'America/Sao_Paulo')::DATE AS dia,
               COUNT(*) FILTER (WHERE x.reuniao = 'sdr')    AS sdr,
               COUNT(*) FILTER (WHERE x.reuniao = 'closer') AS closer
        FROM (
            SELECT sdr_agendou_at AS quando, 'sdr'::TEXT AS reuniao FROM _ww_ag
             WHERE sdr_agendou_at >= NOW() AND sdr_agendou_at <= NOW() + make_interval(days => p_dias_futuro) AND NOT is_perdido
            UNION ALL
            SELECT closer_agendou_at, 'closer' FROM _ww_ag
             WHERE closer_agendou_at >= NOW() AND closer_agendou_at <= NOW() + make_interval(days => p_dias_futuro) AND NOT is_perdido
        ) x
        GROUP BY 1
    ) d;

    -- PENDENTES: data já passou e NINGUÉM reagiu — sem registro do "como foi" (nem "não teve
    -- reunião"), sem mover pra Reagendamento, casal não perdido. É AVISO operacional (cobrar
    -- registro), não contagem. Registro vale pra ESTA reunião se veio de 24h antes dela em diante
    -- (registro mais antigo = sobra de reunião anterior remarcada, aí o aviso continua valendo).
    SELECT COALESCE(json_agg(x ORDER BY x.quando), '[]'::JSON) INTO v_pendentes
    FROM (
        SELECT fc.sdr_agendou_at AS quando, 'sdr'::TEXT AS reuniao, fc.deal_title AS casal, fc.tipo,
               fc.ac_deal_id, fc.contact_id, fc.card_id,
               EXTRACT(DAY FROM NOW() - fc.sdr_agendou_at)::INT AS dias_atraso
          FROM _ww_ag fc
         WHERE fc.sdr_agendou_at < NOW() AND fc.sdr_agendou_at >= NOW() - make_interval(days => p_dias_pendentes)
           AND NOT fc.fez_sdr AND NOT fc.is_perdido
           AND (fc.sdr_como_registrado_at IS NULL OR fc.sdr_como_registrado_at < fc.sdr_agendou_at - INTERVAL '24 hours')
           AND COALESCE(fc.curr_stage, '') <> '201'
        UNION ALL
        SELECT fc.closer_agendou_at, 'closer', fc.deal_title, fc.tipo, fc.ac_deal_id, fc.contact_id, fc.card_id,
               EXTRACT(DAY FROM NOW() - fc.closer_agendou_at)::INT
          FROM _ww_ag fc
         WHERE fc.closer_agendou_at < NOW() AND fc.closer_agendou_at >= NOW() - make_interval(days => p_dias_pendentes)
           AND NOT fc.fez_closer AND NOT fc.is_perdido
           AND (fc.closer_como_registrado_at IS NULL OR fc.closer_como_registrado_at < fc.closer_agendou_at - INTERVAL '24 hours')
           AND COALESCE(fc.curr_stage, '') <> '222'
    ) x;

    -- DESFECHOS: o que aconteceu com as reuniões marcadas dos últimos p_dias_desfechos.
    -- Categoria única por reunião, na ordem feita > nao_aconteceu > reagendando > perdida > sem_registro.
    CREATE TEMP TABLE _ww_desf ON COMMIT DROP AS
    SELECT x.quando, x.reuniao, x.casal, x.tipo, x.ac_deal_id, x.contact_id, x.card_id, x.motivo,
           CASE
             WHEN x.fez THEN 'feita'
             -- registro sem canal real ("Não teve reunião") feito no entorno desta reunião
             WHEN x.reg_at IS NOT NULL AND x.reg_at >= x.quando - INTERVAL '24 hours' THEN 'nao_aconteceu'
             WHEN x.curr_stage = x.reag_stage THEN 'reagendando'
             WHEN x.is_perdido THEN 'perdida'
             ELSE 'sem_registro'
           END AS categoria
    FROM (
        SELECT sdr_agendou_at AS quando, 'sdr'::TEXT AS reuniao, deal_title AS casal, tipo,
               ac_deal_id, contact_id, card_id, motivo_perda_sdr_raw AS motivo,
               fez_sdr AS fez, sdr_como_registrado_at AS reg_at, curr_stage, '201'::TEXT AS reag_stage, is_perdido
          FROM _ww_ag
         WHERE sdr_agendou_at < NOW() AND sdr_agendou_at >= NOW() - make_interval(days => p_dias_desfechos)
        UNION ALL
        SELECT closer_agendou_at, 'closer', deal_title, tipo, ac_deal_id, contact_id, card_id,
               motivo_perda_closer_raw, fez_closer, closer_como_registrado_at, curr_stage, '222', is_perdido
          FROM _ww_ag
         WHERE closer_agendou_at < NOW() AND closer_agendou_at >= NOW() - make_interval(days => p_dias_desfechos)
    ) x;

    SELECT json_build_object(
        'janela_dias', p_dias_desfechos,
        'sdr',    (SELECT json_build_object(
                       'marcadas', COUNT(*),
                       'feitas', COUNT(*) FILTER (WHERE categoria='feita'),
                       'nao_aconteceu', COUNT(*) FILTER (WHERE categoria='nao_aconteceu'),
                       'reagendando', COUNT(*) FILTER (WHERE categoria='reagendando'),
                       'perdidas', COUNT(*) FILTER (WHERE categoria='perdida'),
                       'sem_registro', COUNT(*) FILTER (WHERE categoria='sem_registro'))
                     FROM _ww_desf WHERE reuniao='sdr'),
        'closer', (SELECT json_build_object(
                       'marcadas', COUNT(*),
                       'feitas', COUNT(*) FILTER (WHERE categoria='feita'),
                       'nao_aconteceu', COUNT(*) FILTER (WHERE categoria='nao_aconteceu'),
                       'reagendando', COUNT(*) FILTER (WHERE categoria='reagendando'),
                       'perdidas', COUNT(*) FILTER (WHERE categoria='perdida'),
                       'sem_registro', COUNT(*) FILTER (WHERE categoria='sem_registro'))
                     FROM _ww_desf WHERE reuniao='closer'),
        'itens', (SELECT COALESCE(json_agg(d ORDER BY d.quando DESC), '[]'::JSON) FROM _ww_desf d)
    ) INTO v_desfechos;

    DROP TABLE _ww_ag;
    DROP TABLE _ww_desf;
    RETURN json_build_object(
        'proximas', v_proximas,
        'pendentes', v_pendentes,
        'por_dia', v_por_dia,
        'desfechos', v_desfechos,
        'gerado_em', NOW(),
        'fonte', 'ww_ac_deal_funnel_cache (campos 6/18 do Active) + estado do casal (ww_funil_casal) + timeline (ww_deal_event)'
    );
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww_agenda_reunioes(UUID, INT, INT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_agenda_reunioes(UUID, INT, INT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], INT) TO authenticated, service_role;
