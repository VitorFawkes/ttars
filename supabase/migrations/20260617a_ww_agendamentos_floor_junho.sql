-- "Reuniões agendadas por dia" só conta de JUNHO/2026 pra frente (decisão do Vitor 17/06):
-- antes disso o preenchimento do campo 6/18 não é confiável pra medir agendamento. Chão duro
-- em 2026-06-01, independente do período do filtro. Resto idêntico a 20260616n.
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
    v_org   UUID := COALESCE(p_org_id, requesting_org_id());
    -- Chão duro: nunca contar agendamento anterior a junho/2026.
    v_floor TIMESTAMPTZ := '2026-06-01 00:00:00-03'::timestamptz;
    v_start TIMESTAMPTZ := GREATEST(p_date_start, v_floor);
    v_por_dia JSON;
    v_tot_sdr INT; v_tot_closer INT;
BEGIN
    -- Universo: deals WW com algum agendamento dentro do período EFETIVO (>= junho/2026),
    -- com as dimensões/tipo do casal para aplicar os filtros.
    CREATE TEMP TABLE _ww_agd ON COMMIT DROP AS
    SELECT fc.ac_deal_id,
           fc.sdr_agendado_em, fc.closer_agendado_em,
           w.tipo, w.origem, w.faixa, w.destino, w.convidados, w.consultor_id
      FROM ww_ac_deal_funnel_cache fc
      LEFT JOIN ww_funil_casal w ON w.contact_id = fc.contact_id AND w.org_id = v_org
     WHERE fc.is_ww
       AND (fc.sdr_agendado_em    BETWEEN v_start AND p_date_end
         OR fc.closer_agendado_em BETWEEN v_start AND p_date_end);

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
            SELECT (sdr_agendado_em AT TIME ZONE 'America/Sao_Paulo')::DATE AS dia, 'sdr'::TEXT AS reuniao
              FROM _ww_agd WHERE sdr_agendado_em BETWEEN v_start AND p_date_end
            UNION ALL
            SELECT (closer_agendado_em AT TIME ZONE 'America/Sao_Paulo')::DATE, 'closer'
              FROM _ww_agd WHERE closer_agendado_em BETWEEN v_start AND p_date_end
        ) x
        GROUP BY x.dia
    ) d;

    SELECT COUNT(*) FILTER (WHERE sdr_agendado_em    BETWEEN v_start AND p_date_end),
           COUNT(*) FILTER (WHERE closer_agendado_em BETWEEN v_start AND p_date_end)
      INTO v_tot_sdr, v_tot_closer
      FROM _ww_agd;

    DROP TABLE _ww_agd;
    RETURN json_build_object(
        'por_dia', v_por_dia,
        'total_sdr', COALESCE(v_tot_sdr, 0),
        'total_closer', COALESCE(v_tot_closer, 0),
        'floor', '2026-06-01',
        'fonte', 'updatedTimestamp campos 6/18 do Active (quando a reunião foi marcada)'
    );
END $function$;

REVOKE ALL ON FUNCTION public.ww_agendamentos_por_dia(uuid, timestamptz, timestamptz, text[], text[], text[], text[], text[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_agendamentos_por_dia(uuid, timestamptz, timestamptz, text[], text[], text[], text[], text[], uuid[]) TO authenticated, service_role;
