-- 20260619o_ww_marketing_qualidade_native.sql
-- Weddings / Analytics 2 — versão NATIVA (ttars-only) de ww_marketing_qualidade.
--
-- Mesma assinatura e MESMO shape de JSON da RPC original (ww_marketing_qualidade),
-- mas lê EXCLUSIVAMENTE do funil nativo ttars (ww_funil_casal_native) + cards/contatos,
-- sem qualquer dependência de ww_ac_deal_funnel_cache / ww_funil_casal (snapshot) /
-- vw_ww_funnel_base.
--
-- Fontes:
--   * Pool      : ww_funil_casal_native (1 linha por card WEDDING)
--   * UTM       : cards.utm_campaign / cards.utm_medium / cards.utm_source
--                 (JOIN cards ON cards.id = native.contact_id::uuid)
--   * Validade  : contatos.email / contatos.telefone (via cards.pessoa_principal_id)
--   * origem    : native.origem (já normalizada na view)
--   * faixa     : native.faixa (declarada no site)
--   * qualificado = fez_sdr ; fechado = ganho ; ticket = valor_final
--
-- SECURITY DEFINER, search_path=public. Não comita / não registra (entrega: dry-run validado).

CREATE OR REPLACE FUNCTION public.ww_marketing_qualidade_native(
    p_date_start   timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end     timestamp with time zone DEFAULT now(),
    p_org_id       uuid    DEFAULT NULL::uuid,
    p_origins      text[]  DEFAULT NULL::text[],
    p_min_amostra  integer DEFAULT 2,
    p_date_mode    text    DEFAULT 'cohort'::text,
    p_tipos        text[]  DEFAULT NULL::text[],
    p_sdr_canal    text[]  DEFAULT NULL::text[],
    p_closer_canal text[]  DEFAULT NULL::text[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_org             UUID := COALESCE(p_org_id, requesting_org_id());
    v_total_leads     INT  := 0;
    v_total_fechados  INT  := 0;
    v_taxa_geral      NUMERIC;
    v_por_origem      JSON;
    v_por_campaign    JSON;
    v_dropoff_por_origem JSON;
    v_origem_x_faixa  JSON;
    v_min             INT  := GREATEST(1, COALESCE(p_min_amostra, 2));
BEGIN
    -- Pool nativo: cards WEDDING que entraram válidos no funil, no período (cohort por
    -- lead_created_at; throughput por qualquer marco no período). Espelha o universo da
    -- RPC nativa ww_funil_conversao_v1_native (entrou_valido + período).
    CREATE TEMP TABLE _ww_mq_native ON COMMIT DROP AS
    SELECT
        n.contact_id,
        n.origem,
        NULLIF(ca.utm_medium, '')   AS utm_medium,
        NULLIF(ca.utm_campaign, '') AS utm_campaign,
        n.tipo_entrada              AS tipo,
        n.faixa                     AS faixa_decl,
        n.sdr_canal,
        n.closer_canal,
        COALESCE(n.ganho, FALSE)          AS fechou,
        COALESCE(n.agendou_sdr, FALSE)    AS marcou_sdr,
        COALESCE(n.fez_sdr, FALSE)        AS fez_sdr,
        COALESCE(n.agendou_closer, FALSE) AS marcou_closer,
        COALESCE(n.fez_closer, FALSE)     AS fez_closer,
        n.valor_final                     AS valor_pac,
        (NULLIF(TRIM(co.email), '')    IS NOT NULL) AS tem_email,
        (NULLIF(TRIM(co.telefone), '') IS NOT NULL) AS tem_tel,
        (ca.pessoa_principal_id IS NOT NULL)        AS tem_contato
    FROM ww_funil_casal_native n
    JOIN cards ca       ON ca.id = n.contact_id::uuid
    LEFT JOIN contatos co ON co.id = ca.pessoa_principal_id
    WHERE n.org_id = v_org
      AND COALESCE(n.entrou_valido, FALSE)
      AND (CASE WHEN p_date_mode = 'throughput' THEN
                  (n.lead_created_at    BETWEEN p_date_start AND p_date_end)
               OR (n.agendou_sdr_at     BETWEEN p_date_start AND p_date_end)
               OR (n.fez_sdr_at         BETWEEN p_date_start AND p_date_end)
               OR (n.agendou_closer_at  BETWEEN p_date_start AND p_date_end)
               OR (n.fez_closer_at      BETWEEN p_date_start AND p_date_end)
               OR (n.ganho_at           BETWEEN p_date_start AND p_date_end)
            ELSE (n.lead_created_at BETWEEN p_date_start AND p_date_end) END);

    -- Filtros opcionais (mesma semântica da RPC original)
    IF p_origins      IS NOT NULL THEN DELETE FROM _ww_mq_native WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_tipos        IS NOT NULL THEN DELETE FROM _ww_mq_native WHERE tipo   IS NULL OR tipo   != ALL(p_tipos);   END IF;
    IF p_sdr_canal    IS NOT NULL THEN DELETE FROM _ww_mq_native WHERE _ww_norm_canal_strict(sdr_canal)    IS NULL OR _ww_norm_canal_strict(sdr_canal)    != ALL(p_sdr_canal);    END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_mq_native WHERE _ww_norm_canal_strict(closer_canal) IS NULL OR _ww_norm_canal_strict(closer_canal) != ALL(p_closer_canal); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou)
      INTO v_total_leads, v_total_fechados FROM _ww_mq_native;
    v_taxa_geral := CASE WHEN v_total_leads > 0 THEN 100.0 * v_total_fechados / v_total_leads END;

    -- por_origem
    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'leads_total', leads, 'qualificados', qualif, 'fechados', fechados,
      'taxa_qualif_pct',     CASE WHEN leads > 0 THEN ROUND(100.0 * qualif   / leads, 1) END,
      'taxa_fechamento_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * fechados / leads, 1) END,
      'lift_vs_geral', CASE WHEN v_taxa_geral IS NULL OR v_taxa_geral = 0 OR leads = 0 THEN NULL
                            ELSE ROUND(((100.0 * fechados / leads) / v_taxa_geral)::numeric, 2) END,
      'ticket_medio', ROUND(ticket::NUMERIC, 0),
      'pct_email_valido', CASE WHEN com_contato > 0 THEN ROUND(100.0 * com_email / com_contato, 1) END,
      'pct_tel_valido',   CASE WHEN com_contato > 0 THEN ROUND(100.0 * com_tel   / com_contato, 1) END
    ) ORDER BY leads DESC), '[]'::JSON) INTO v_por_origem
    FROM (SELECT origem, COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE fez_sdr OR fechou)            AS qualif,
             COUNT(*) FILTER (WHERE fechou)                       AS fechados,
             AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket,
             COUNT(*) FILTER (WHERE tem_contato)                  AS com_contato,
             COUNT(*) FILTER (WHERE tem_contato AND tem_email)    AS com_email,
             COUNT(*) FILTER (WHERE tem_contato AND tem_tel)      AS com_tel
        FROM _ww_mq_native WHERE origem IS NOT NULL GROUP BY origem HAVING COUNT(*) >= v_min) g;

    -- por_campaign (UTM dos cards)
    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'campaign', campaign, 'medium', medium,
      'leads', leads, 'qualif', qualif, 'fechou', fechou,
      'taxa_qualif_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * qualif / leads, 1) END,
      'taxa_fech_pct',   CASE WHEN leads > 0 THEN ROUND(100.0 * fechou / leads, 1) END,
      'lift_vs_geral', CASE WHEN v_taxa_geral IS NULL OR v_taxa_geral = 0 OR leads = 0 THEN NULL
                            ELSE ROUND(((100.0 * fechou / leads) / v_taxa_geral)::numeric, 2) END,
      'ticket_medio', ROUND(ticket::NUMERIC, 0)
    ) ORDER BY leads DESC), '[]'::JSON) INTO v_por_campaign
    FROM (SELECT origem, COALESCE(utm_campaign, '(sem campanha)') AS campaign,
             COALESCE(utm_medium, '(sem medium)') AS medium,
             COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE fez_sdr OR fechou) AS qualif,
             COUNT(*) FILTER (WHERE fechou)            AS fechou,
             AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket
        FROM _ww_mq_native WHERE origem IS NOT NULL AND utm_campaign IS NOT NULL
        GROUP BY origem, utm_campaign, utm_medium HAVING COUNT(*) >= v_min) g;

    -- dropoff_por_origem (entrada → sdr → closer → pos_venda → fechado)
    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'entrada', entrada,
      'sdr', sdr_count, 'closer', closer_count, 'pos_venda', pos_count, 'fechado', fechado_count,
      'drop_entrada_sdr',    CASE WHEN entrada     > 0 THEN ROUND(100.0 * (entrada     - sdr_count)     / entrada,     1) END,
      'drop_sdr_closer',     CASE WHEN sdr_count   > 0 THEN ROUND(100.0 * (sdr_count   - closer_count)  / sdr_count,   1) END,
      'drop_closer_fechado', CASE WHEN closer_count > 0 THEN ROUND(100.0 * (closer_count - fechado_count) / closer_count, 1) END
    ) ORDER BY entrada DESC), '[]'::JSON) INTO v_dropoff_por_origem
    FROM (SELECT origem,
             COUNT(*) AS entrada,
             COUNT(*) FILTER (WHERE marcou_sdr    OR fez_sdr OR marcou_closer OR fez_closer OR fechou) AS sdr_count,
             COUNT(*) FILTER (WHERE marcou_closer OR fez_closer OR fechou)                             AS closer_count,
             COUNT(*) FILTER (WHERE fez_closer    OR fechou)                                           AS pos_count,
             COUNT(*) FILTER (WHERE fechou)                                                            AS fechado_count
        FROM _ww_mq_native WHERE origem IS NOT NULL GROUP BY origem HAVING COUNT(*) >= v_min) g;

    -- origem × faixa declarada
    SELECT COALESCE(json_agg(json_build_object(
      'x', origem, 'y', faixa_decl, 'entrou', e, 'fechou', f,
      'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    )), '[]'::JSON) INTO v_origem_x_faixa
    FROM (SELECT origem, faixa_decl, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_mq_native WHERE origem IS NOT NULL AND faixa_decl IS NOT NULL
           GROUP BY origem, faixa_decl HAVING COUNT(*) >= v_min) g;

    DROP TABLE _ww_mq_native;
    RETURN json_build_object(
      'date_start', p_date_start, 'date_end', p_date_end,
      'date_mode', p_date_mode, 'org_id', v_org,
      'total_leads', v_total_leads, 'total_fechados', v_total_fechados,
      'taxa_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
      'por_origem', v_por_origem, 'por_campaign', v_por_campaign,
      'dropoff_por_origem', v_dropoff_por_origem,
      'origem_x_faixa', v_origem_x_faixa,
      'fonte_marcos', 'ww_funil_casal_native (funil nativo ttars + UTM cards + validade contatos)'
    );
END $function$;
