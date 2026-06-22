-- ============================================================================
-- 20260622h_ww_agenda_native_reagendou.sql
-- ----------------------------------------------------------------------------
-- FIX (audit Analytics 2, visao-6): a categoria "Em reagendamento" dos desfechos
-- da agenda ficava SEMPRE 0 no native. Causa: ww_agenda_reunioes_native setava
-- curr_stage = NULL, e o ramo de reagendamento dependia de curr_stage = '201'/'222'
-- (stage ids do ActiveCampaign, inexistentes no funil próprio do ttars).
--
-- Definição de "reagendou" (decisão de negócio do Mateus, adaptada à fonte de dados
-- que EXISTE no ttars): a DATA da reunião foi MOVIDA para outro dia. Sinal real:
-- activities.tipo='field_changed' em ww_sdr_data_reuniao / ww_closer_data_reuniao com
-- `old` não-nulo e dia(old) <> dia(new). (As tarefas de reunião no ttars são esparsas
-- demais para o critério "2 tasks SDR em dias diferentes" — 0 cards hoje; o histórico
-- de mudança do campo de data é a fonte fiel e cresce com o uso.)
--
-- Recria a função partindo da def viva (snapshot pré-fix), trocando SÓ:
--   - _ww_ag: NULL curr_stage → flags reagendou_sdr / reagendou_closer (via activities)
--   - PENDENTES: guarda curr_stage<>'201'/'222' → NOT reagendou_sdr / NOT reagendou_closer
--   - DESFECHOS: CASE curr_stage=reag_stage → CASE x.reagendou
-- Zero mutação de dados.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww_agenda_reunioes_native(
    p_org_id uuid DEFAULT NULL::uuid, p_dias_futuro integer DEFAULT 7,
    p_dias_pendentes integer DEFAULT 14, p_origins text[] DEFAULT NULL::text[],
    p_tipos text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[],
    p_destinos text[] DEFAULT NULL::text[], p_convidados text[] DEFAULT NULL::text[],
    p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_dias_desfechos integer DEFAULT 30,
    p_date_start timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_date_end timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_atras INT := GREATEST(p_dias_pendentes, p_dias_desfechos);
    v_proximas JSON; v_pendentes JSON; v_por_dia JSON; v_desfechos JSON;
    v_desf_ini TIMESTAMPTZ := COALESCE(p_date_start, NOW() - make_interval(days => p_dias_desfechos));
    v_desf_fim TIMESTAMPTZ := COALESCE(p_date_end, NOW());
    v_desf_dias INT := COALESCE((EXTRACT(EPOCH FROM (COALESCE(p_date_end,NOW()) - COALESCE(p_date_start, NOW() - make_interval(days => p_dias_desfechos))))/86400)::INT, p_dias_desfechos);
BEGIN
    -- Universo nativo: 1 linha por casal/card, com agendou_*/fez_* do log de etapas.
    -- reagendou_*: a data da reunião foi movida pra outro dia (field_changed no log).
    CREATE TEMP TABLE _ww_ag ON COMMIT DROP AS
    SELECT NULL::TEXT AS ac_deal_id, w.contact_id, w.deal_title,
           w.sdr_agendou_at, w.closer_agendou_at,
           w.fez_sdr_at AS sdr_como_registrado_at, w.fez_closer_at AS closer_como_registrado_at,
           NULL::TEXT AS motivo_perda_sdr_raw, NULL::TEXT AS motivo_perda_closer_raw,
           w.tipo, w.faixa, w.convidados, w.destino, w.origem, w.consultor_id, w.consultor_nome,
           w.sdr_canal, w.closer_canal,
           COALESCE(w.fez_sdr, FALSE) AS fez_sdr, COALESCE(w.fez_closer, FALSE) AS fez_closer,
           COALESCE(w.is_perdido, FALSE) AS is_perdido,
           w.contact_id::uuid AS card_id,
           COALESCE(rg.reagendou_sdr, FALSE)    AS reagendou_sdr,
           COALESCE(rg.reagendou_closer, FALSE) AS reagendou_closer
      FROM ww_funil_casal_native w
      LEFT JOIN (
          SELECT a.card_id,
                 bool_or(a.metadata->>'field_key' = 'ww_sdr_data_reuniao')    AS reagendou_sdr,
                 bool_or(a.metadata->>'field_key' = 'ww_closer_data_reuniao') AS reagendou_closer
            FROM activities a
           WHERE a.org_id = v_org
             AND a.tipo = 'field_changed'
             AND a.metadata->>'field_key' IN ('ww_sdr_data_reuniao','ww_closer_data_reuniao')
             AND public._ww_native_ts(a.metadata->>'old') IS NOT NULL
             AND public._ww_native_ts(a.metadata->>'old')::date
                 <> public._ww_native_ts(a.metadata->>'new')::date
           GROUP BY a.card_id
      ) rg ON rg.card_id = w.contact_id::uuid
     WHERE w.org_id = v_org
       AND (w.sdr_agendou_at    BETWEEN NOW() - make_interval(days => v_atras) AND NOW() + make_interval(days => p_dias_futuro)
         OR w.closer_agendou_at BETWEEN NOW() - make_interval(days => v_atras) AND NOW() + make_interval(days => p_dias_futuro));

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

    -- POR DIA: futuras agrupadas pelo dia em Brasília
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

    -- PENDENTES: data já passou, casal não perdido, sem registro do "como foi" e NÃO reagendado.
    SELECT COALESCE(json_agg(x ORDER BY x.quando), '[]'::JSON) INTO v_pendentes
    FROM (
        SELECT fc.sdr_agendou_at AS quando, 'sdr'::TEXT AS reuniao, fc.deal_title AS casal, fc.tipo,
               fc.ac_deal_id, fc.contact_id, fc.card_id,
               EXTRACT(DAY FROM NOW() - fc.sdr_agendou_at)::INT AS dias_atraso
          FROM _ww_ag fc
         WHERE fc.sdr_agendou_at < NOW() AND fc.sdr_agendou_at >= NOW() - make_interval(days => p_dias_pendentes)
           AND NOT fc.fez_sdr AND NOT fc.is_perdido
           AND (fc.sdr_como_registrado_at IS NULL OR fc.sdr_como_registrado_at < fc.sdr_agendou_at - INTERVAL '24 hours')
           AND NOT fc.reagendou_sdr
        UNION ALL
        SELECT fc.closer_agendou_at, 'closer', fc.deal_title, fc.tipo, fc.ac_deal_id, fc.contact_id, fc.card_id,
               EXTRACT(DAY FROM NOW() - fc.closer_agendou_at)::INT
          FROM _ww_ag fc
         WHERE fc.closer_agendou_at < NOW() AND fc.closer_agendou_at >= NOW() - make_interval(days => p_dias_pendentes)
           AND NOT fc.fez_closer AND NOT fc.is_perdido
           AND (fc.closer_como_registrado_at IS NULL OR fc.closer_como_registrado_at < fc.closer_agendou_at - INTERVAL '24 hours')
           AND NOT fc.reagendou_closer
    ) x;

    -- DESFECHOS: o que aconteceu com as reuniões marcadas no período.
    CREATE TEMP TABLE _ww_desf ON COMMIT DROP AS
    SELECT x.quando, x.reuniao, x.casal, x.tipo, x.ac_deal_id, x.contact_id, x.card_id, x.motivo, x.sdr_canal, x.closer_canal,
           CASE
             WHEN x.fez THEN 'feita'
             WHEN x.reg_at IS NOT NULL AND x.reg_at >= x.quando - INTERVAL '24 hours' THEN 'nao_aconteceu'
             WHEN x.reagendou THEN 'reagendando'
             WHEN x.is_perdido THEN 'perdida'
             ELSE 'sem_registro'
           END AS categoria
    FROM (
        SELECT sdr_agendou_at AS quando, 'sdr'::TEXT AS reuniao, deal_title AS casal, tipo,
               ac_deal_id, contact_id, card_id, motivo_perda_sdr_raw AS motivo,
               fez_sdr AS fez, sdr_como_registrado_at AS reg_at, reagendou_sdr AS reagendou, is_perdido, sdr_canal, closer_canal
          FROM _ww_ag
         WHERE sdr_agendou_at >= v_desf_ini AND sdr_agendou_at <= v_desf_fim
        UNION ALL
        SELECT closer_agendou_at, 'closer', deal_title, tipo, ac_deal_id, contact_id, card_id,
               motivo_perda_closer_raw, fez_closer, closer_como_registrado_at, reagendou_closer AS reagendou, is_perdido, sdr_canal, closer_canal
          FROM _ww_ag
         WHERE closer_agendou_at >= v_desf_ini AND closer_agendou_at <= v_desf_fim
    ) x;

    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_desf WHERE reuniao='sdr' AND (sdr_canal IS NULL OR _ww_norm_canal_strict(sdr_canal) != ALL(p_sdr_canal)); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_desf WHERE reuniao='closer' AND (closer_canal IS NULL OR _ww_norm_canal_strict(closer_canal) != ALL(p_closer_canal)); END IF;

    SELECT json_build_object(
        'janela_dias', v_desf_dias,
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
        'fonte', 'native (ttars): agendou_*/fez_* do log de etapas (ww_funil_casal_native). reagendou = data da reunião movida (field_changed). Sem AC: ac_deal_id/motivo NULL.'
    );
END $function$;

NOTIFY pgrst, 'reload schema';
