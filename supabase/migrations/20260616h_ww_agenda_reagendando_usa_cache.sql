-- 20260616h_ww_agenda_reagendando_usa_cache.sql
--
-- Parte B (continuação): a detecção de "reagendando" no ww_agenda_reunioes (curr_stage = 201
-- p/ SDR, 222 p/ Closer) passa a usar a etapa atual da cache (ac_current_stage_id), não mais o
-- último evento da timeline ww_deal_event (incompleta). Mesma fonte confiável do "Onde estão agora".
--
-- Base: definição VIVA de produção (pg_get_functiondef, 2026-06-16).

CREATE OR REPLACE FUNCTION public.ww_agenda_reunioes(p_org_id uuid DEFAULT NULL::uuid, p_dias_futuro integer DEFAULT 7, p_dias_pendentes integer DEFAULT 14, p_origins text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_convidados text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_dias_desfechos integer DEFAULT 30, p_date_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_date_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_atras INT := GREATEST(p_dias_pendentes, p_dias_desfechos);
    v_proximas JSON; v_pendentes JSON; v_por_dia JSON; v_desfechos JSON;
    -- P2 (20260615h): desfechos respeitam o período do filtro quando passado; senão últimos p_dias_desfechos.
    v_desf_ini TIMESTAMPTZ := COALESCE(p_date_start, NOW() - make_interval(days => p_dias_desfechos));
    v_desf_fim TIMESTAMPTZ := COALESCE(p_date_end, NOW());
    v_desf_dias INT := COALESCE((EXTRACT(EPOCH FROM (COALESCE(p_date_end,NOW()) - COALESCE(p_date_start, NOW() - make_interval(days => p_dias_desfechos))))/86400)::INT, p_dias_desfechos);
BEGIN
    -- Universo: deal-level (cada agendamento tem hora própria) + dimensões/estado do casal.
    CREATE TEMP TABLE _ww_ag ON COMMIT DROP AS
    SELECT fc.ac_deal_id, fc.contact_id, fc.deal_title,
           fc.sdr_agendou_at, fc.closer_agendou_at,
           fc.sdr_como_registrado_at, fc.closer_como_registrado_at,
           fc.motivo_perda_sdr_raw, fc.motivo_perda_closer_raw,
           w.tipo, w.faixa, w.convidados, w.destino, w.origem, w.consultor_id, w.consultor_nome,
           w.sdr_canal, w.closer_canal,
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

    -- 20260616g: etapa atual vem da cache (deal.stage do Active), não da timeline incompleta — p/ detectar "reagendando"
    UPDATE _ww_ag a SET curr_stage = fc.ac_current_stage_id
      FROM ww_ac_deal_funnel_cache fc
     WHERE fc.ac_deal_id = a.ac_deal_id AND fc.ac_current_stage_id IS NOT NULL;

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
    SELECT x.quando, x.reuniao, x.casal, x.tipo, x.ac_deal_id, x.contact_id, x.card_id, x.motivo, x.sdr_canal, x.closer_canal,
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
               fez_sdr AS fez, sdr_como_registrado_at AS reg_at, curr_stage, '201'::TEXT AS reag_stage, is_perdido, sdr_canal, closer_canal
          FROM _ww_ag
         WHERE sdr_agendou_at >= v_desf_ini AND sdr_agendou_at <= v_desf_fim
        UNION ALL
        SELECT closer_agendou_at, 'closer', deal_title, tipo, ac_deal_id, contact_id, card_id,
               motivo_perda_closer_raw, fez_closer, closer_como_registrado_at, curr_stage, '222', is_perdido, sdr_canal, closer_canal
          FROM _ww_ag
         WHERE closer_agendou_at >= v_desf_ini AND closer_agendou_at <= v_desf_fim
    ) x;

    -- P2: filtro de canal SÓ nos desfechos (passado tem canal registrado). Próximas/pendentes ficam livres.
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
        'fonte', 'ww_ac_deal_funnel_cache (campos 6/18 do Active) + estado do casal (ww_funil_casal) + etapa atual da cache; (timeline (ww_deal_event)'
    );
END $function$
;
