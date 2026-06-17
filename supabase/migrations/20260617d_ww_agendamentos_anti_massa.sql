-- "Reuniões agendadas por dia" — troca a régua de qualidade (17/06, caso 30268/Suzanne).
-- ANTES (20260617c): contava só se marcou <= dia da reunião. Isso cortava agendamento REAL
-- feito no dia mas com valor de data estranho/passado no campo (ex.: Suzanne agendou Closer
-- em 16/06 14:31, logo após a SDR, mas o valor do campo 18 ficou 05/06).
-- AGORA: conta o agendamento pelo dia em que foi feito (preenchido), e descarta só EDIÇÃO EM
-- MASSA — quando >= 6 deals tiveram o MESMO campo (6 ou 18) tocado dentro de uma janela de
-- ±10 min (assinatura de import/automação; ex.: bolo de 12/06 10:45-11:05 em 18 deals).
-- REVISADO contra 20260617c: mantém período, os 6 filtros, itens (drill) e grants; só troca a
-- condição de coerência por anti-massa.
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
    v_por_dia JSON; v_itens JSON;
    v_tot_sdr INT; v_tot_closer INT;
BEGIN
    -- Edição em massa: >= 6 deals com o mesmo campo tocado em ±10 min (assinatura de bulk).
    CREATE TEMP TABLE _burst_sdr ON COMMIT DROP AS
      SELECT ac_deal_id FROM (
        SELECT ac_deal_id, count(*) OVER (ORDER BY sdr_agendado_em RANGE BETWEEN interval '10 minutes' PRECEDING AND interval '10 minutes' FOLLOWING) AS nb
          FROM ww_ac_deal_funnel_cache WHERE is_ww AND sdr_agendado_em IS NOT NULL
      ) z WHERE nb >= 6;
    CREATE TEMP TABLE _burst_closer ON COMMIT DROP AS
      SELECT ac_deal_id FROM (
        SELECT ac_deal_id, count(*) OVER (ORDER BY closer_agendado_em RANGE BETWEEN interval '10 minutes' PRECEDING AND interval '10 minutes' FOLLOWING) AS nb
          FROM ww_ac_deal_funnel_cache WHERE is_ww AND closer_agendado_em IS NOT NULL
      ) z WHERE nb >= 6;

    CREATE TEMP TABLE _ww_agd ON COMMIT DROP AS
    SELECT fc.ac_deal_id, fc.contact_id, fc.deal_title,
           fc.sdr_agendado_em, fc.sdr_agendou_at,
           fc.closer_agendado_em, fc.closer_agendou_at,
           w.tipo, w.origem, w.faixa, w.destino, w.convidados, w.consultor_id,
           c.id AS card_id
      FROM ww_ac_deal_funnel_cache fc
      LEFT JOIN ww_funil_casal w ON w.contact_id = fc.contact_id AND w.org_id = v_org
      LEFT JOIN cards c ON c.external_id = fc.ac_deal_id AND c.external_source = 'active_campaign' AND c.deleted_at IS NULL
     WHERE fc.is_ww
       AND (fc.sdr_agendado_em    BETWEEN p_date_start AND p_date_end
         OR fc.closer_agendado_em BETWEEN p_date_start AND p_date_end);

    IF p_origins       IS NOT NULL THEN DELETE FROM _ww_agd WHERE origem       IS NULL OR origem       != ALL(p_origins);       END IF;
    IF p_tipos         IS NOT NULL THEN DELETE FROM _ww_agd WHERE tipo         IS NULL OR tipo         != ALL(p_tipos);         END IF;
    IF p_faixas        IS NOT NULL THEN DELETE FROM _ww_agd WHERE faixa        IS NULL OR faixa        != ALL(p_faixas);        END IF;
    IF p_destinos      IS NOT NULL THEN DELETE FROM _ww_agd WHERE destino      IS NULL OR destino      != ALL(p_destinos);      END IF;
    IF p_convidados    IS NOT NULL THEN DELETE FROM _ww_agd WHERE convidados   IS NULL OR convidados   != ALL(p_convidados);    END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _ww_agd WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;

    CREATE TEMP TABLE _ww_ev ON COMMIT DROP AS
    SELECT (sdr_agendado_em AT TIME ZONE v_tz)::DATE AS dia, 'sdr'::TEXT AS reuniao,
           deal_title AS casal, ac_deal_id, contact_id, card_id, tipo,
           sdr_agendado_em AS marcou_em, sdr_agendou_at AS reuniao_em
      FROM _ww_agd
     WHERE sdr_agendado_em BETWEEN p_date_start AND p_date_end
       AND sdr_agendou_at IS NOT NULL
       AND ac_deal_id NOT IN (SELECT ac_deal_id FROM _burst_sdr)
    UNION ALL
    SELECT (closer_agendado_em AT TIME ZONE v_tz)::DATE, 'closer',
           deal_title, ac_deal_id, contact_id, card_id, tipo,
           closer_agendado_em, closer_agendou_at
      FROM _ww_agd
     WHERE closer_agendado_em BETWEEN p_date_start AND p_date_end
       AND closer_agendou_at IS NOT NULL
       AND ac_deal_id NOT IN (SELECT ac_deal_id FROM _burst_closer);

    SELECT COALESCE(json_agg(d ORDER BY d.dia), '[]'::JSON) INTO v_por_dia
    FROM (
        SELECT to_char(dia, 'YYYY-MM-DD') AS dia,
               COUNT(*) FILTER (WHERE reuniao = 'sdr')    AS sdr,
               COUNT(*) FILTER (WHERE reuniao = 'closer') AS closer
        FROM _ww_ev GROUP BY dia
    ) d;

    SELECT COALESCE(json_agg(json_build_object(
               'dia', to_char(dia, 'YYYY-MM-DD'), 'reuniao', reuniao, 'casal', casal,
               'ac_deal_id', ac_deal_id, 'contact_id', contact_id, 'card_id', card_id, 'tipo', tipo,
               'marcou_em', marcou_em, 'reuniao_em', reuniao_em
           ) ORDER BY marcou_em DESC), '[]'::JSON) INTO v_itens FROM _ww_ev;

    SELECT COUNT(*) FILTER (WHERE reuniao='sdr'), COUNT(*) FILTER (WHERE reuniao='closer')
      INTO v_tot_sdr, v_tot_closer FROM _ww_ev;

    DROP TABLE _ww_agd; DROP TABLE _ww_ev; DROP TABLE _burst_sdr; DROP TABLE _burst_closer;
    RETURN json_build_object(
        'por_dia', v_por_dia,
        'itens', v_itens,
        'total_sdr', COALESCE(v_tot_sdr, 0),
        'total_closer', COALESCE(v_tot_closer, 0),
        'fonte', 'updatedTimestamp campos 6/18 do Active; conta por dia de agendamento, exceto edicao em massa (>=6 em +/-10min)'
    );
END $function$;

REVOKE ALL ON FUNCTION public.ww_agendamentos_por_dia(uuid, timestamptz, timestamptz, text[], text[], text[], text[], text[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_agendamentos_por_dia(uuid, timestamptz, timestamptz, text[], text[], text[], text[], text[], uuid[]) TO authenticated, service_role;
