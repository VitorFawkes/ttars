-- "Reuniões agendadas por dia" — 2 correções (17/06), REVISADO contra 20260616n + 20260617a:
-- preserva os 6 filtros, agregação por dia, totais e grants fechados a anon do 20260616n.
-- 1) TIRA o chão de junho do 20260617a (pedido explícito do Vitor: respeitar o filtro de data).
-- 2) Filtro de coerência: só conta o agendamento se foi marcado ATÉ O DIA da reunião
--    (na vida real você agenda antes da reunião). Joga fora edições em massa que tocaram o
--    campo 6/18 meses depois da reunião já ter acontecido (ex.: bolo de 12/06 10:48-11:01 em
--    ~18 deals da Closer, reuniões reais em fev-mai) — ruído de import/automação, não agendamento.
CREATE OR REPLACE FUNCTION public.ww_agendamentos_por_dia(
    p_org_id        uuid        DEFAULT NULL,
    p_date_start    timestamptz DEFAULT (now() - interval '30 days'),
    p_date_end      timestamptz DEFAULT now(),
    p_tipos         text[]      DEFAULT NULL,
    p_origins       text[]      DEFAULT NULL,
    p_faixas        text[]      DEFAULT NULL,
    p_destinos      text[]      DEFAULT NULL,
    p_convidados    text[]      DEFAULT NULL,
    p_consultor_ids uuid[]      DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_tz  TEXT := 'America/Sao_Paulo';
    v_por_dia JSON;
    v_tot_sdr INT; v_tot_closer INT;
BEGIN
    CREATE TEMP TABLE _ww_agd ON COMMIT DROP AS
    SELECT fc.ac_deal_id,
           fc.sdr_agendado_em, fc.sdr_agendou_at,
           fc.closer_agendado_em, fc.closer_agendou_at,
           w.tipo, w.origem, w.faixa, w.destino, w.convidados, w.consultor_id
      FROM ww_ac_deal_funnel_cache fc
      LEFT JOIN ww_funil_casal w ON w.contact_id = fc.contact_id AND w.org_id = v_org
     WHERE fc.is_ww
       AND (fc.sdr_agendado_em    BETWEEN p_date_start AND p_date_end
         OR fc.closer_agendado_em BETWEEN p_date_start AND p_date_end);

    IF p_origins       IS NOT NULL THEN DELETE FROM _ww_agd WHERE origem       IS NULL OR origem       != ALL(p_origins);       END IF;
    IF p_tipos         IS NOT NULL THEN DELETE FROM _ww_agd WHERE tipo         IS NULL OR tipo         != ALL(p_tipos);         END IF;
    IF p_faixas        IS NOT NULL THEN DELETE FROM _ww_agd WHERE faixa        IS NULL OR faixa        != ALL(p_faixas);        END IF;
    IF p_destinos      IS NOT NULL THEN DELETE FROM _ww_agd WHERE destino      IS NULL OR destino      != ALL(p_destinos);      END IF;
    IF p_convidados    IS NOT NULL THEN DELETE FROM _ww_agd WHERE convidados   IS NULL OR convidados   != ALL(p_convidados);    END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _ww_agd WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;

    SELECT COALESCE(json_agg(d ORDER BY d.dia), '[]'::JSON) INTO v_por_dia
    FROM (
        SELECT x.dia,
               COUNT(*) FILTER (WHERE x.reuniao = 'sdr')    AS sdr,
               COUNT(*) FILTER (WHERE x.reuniao = 'closer') AS closer
        FROM (
            SELECT (sdr_agendado_em AT TIME ZONE v_tz)::DATE AS dia, 'sdr'::TEXT AS reuniao
              FROM _ww_agd
             WHERE sdr_agendado_em BETWEEN p_date_start AND p_date_end
               AND sdr_agendou_at IS NOT NULL
               AND (sdr_agendado_em AT TIME ZONE v_tz)::DATE <= (sdr_agendou_at AT TIME ZONE v_tz)::DATE
            UNION ALL
            SELECT (closer_agendado_em AT TIME ZONE v_tz)::DATE, 'closer'
              FROM _ww_agd
             WHERE closer_agendado_em BETWEEN p_date_start AND p_date_end
               AND closer_agendou_at IS NOT NULL
               AND (closer_agendado_em AT TIME ZONE v_tz)::DATE <= (closer_agendou_at AT TIME ZONE v_tz)::DATE
        ) x
        GROUP BY x.dia
    ) d;

    SELECT
        COUNT(*) FILTER (WHERE sdr_agendado_em BETWEEN p_date_start AND p_date_end
                           AND sdr_agendou_at IS NOT NULL
                           AND (sdr_agendado_em AT TIME ZONE v_tz)::DATE <= (sdr_agendou_at AT TIME ZONE v_tz)::DATE),
        COUNT(*) FILTER (WHERE closer_agendado_em BETWEEN p_date_start AND p_date_end
                           AND closer_agendou_at IS NOT NULL
                           AND (closer_agendado_em AT TIME ZONE v_tz)::DATE <= (closer_agendou_at AT TIME ZONE v_tz)::DATE)
      INTO v_tot_sdr, v_tot_closer
      FROM _ww_agd;

    DROP TABLE _ww_agd;
    RETURN json_build_object(
        'por_dia', v_por_dia,
        'total_sdr', COALESCE(v_tot_sdr, 0),
        'total_closer', COALESCE(v_tot_closer, 0),
        'fonte', 'updatedTimestamp campos 6/18 do Active; conta so agendamento <= dia da reuniao'
    );
END $function$;

REVOKE ALL ON FUNCTION public.ww_agendamentos_por_dia(uuid, timestamptz, timestamptz, text[], text[], text[], text[], text[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_agendamentos_por_dia(uuid, timestamptz, timestamptz, text[], text[], text[], text[], text[], uuid[]) TO authenticated, service_role;
