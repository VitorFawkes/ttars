-- ============================================================================
-- Analytics-Weddings — Onda 5: ww_marketing_qualidade
--
-- Resposta: "qual fonte/campanha traz lead que FECHA mais que a média?"
--
-- Universo: leads criados no período. Agrupa por (origem, utm_campaign,
-- utm_medium). Pra cada combo: leads, qualificados (chegou em reunião+),
-- fechados, taxa conversão, ticket médio, tempo médio até qualificação,
-- % com email válido, % com telefone válido, drop-off por fase.
--
-- Adicionalmente: lift por origem e por campanha (vs taxa geral do período).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww_marketing_qualidade(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_min_amostra INT DEFAULT 2
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total_leads INT := 0;
    v_total_fechados INT := 0;
    v_taxa_geral NUMERIC;
    v_por_origem JSON;
    v_por_campaign JSON;
    v_dropoff_por_origem JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 2));
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww_mq ON COMMIT DROP AS
    SELECT c.id,
           c.created_at,
           _ww2_norm_origem(c.marketing_data) AS origem,
           COALESCE(
             NULLIF(c.marketing_data->>'utm_medium',''),
             NULLIF(c.marketing_data->'card'->>'utm_medium','')
           ) AS utm_medium,
           COALESCE(
             NULLIF(c.marketing_data->>'utm_campaign',''),
             NULLIF(c.marketing_data->'card'->>'utm_campaign','')
           ) AS utm_campaign,
           (NULLIF(c.produto_data->>'ww_closer_data_ganho','') IS NOT NULL) AS fechou,
           NULLIF(c.produto_data->>'ww_closer_valor_pacote','')::NUMERIC AS valor_pac,
           ph.slug AS phase_slug,
           c.pessoa_principal_id,
           co.email AS contato_email,
           co.telefone AS contato_telefone
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
      LEFT JOIN contatos co ON co.id = c.pessoa_principal_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_mq WHERE origem != ALL(p_origins); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_leads, v_total_fechados FROM _ww_mq;
    v_taxa_geral := CASE WHEN v_total_leads > 0 THEN 100.0 * v_total_fechados / v_total_leads END;

    -- ── Por origem (agregado)
    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem,
      'leads_total', leads,
      'qualificados', qualif,
      'fechados', fechados,
      'taxa_qualif_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * qualif / leads, 1) END,
      'taxa_fechamento_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * fechados / leads, 1) END,
      'lift_vs_geral', CASE
                         WHEN v_taxa_geral IS NULL OR v_taxa_geral = 0 OR leads = 0 THEN NULL
                         ELSE ROUND(((100.0 * fechados / leads) / v_taxa_geral)::numeric, 2)
                       END,
      'ticket_medio', ROUND(ticket::NUMERIC, 0),
      'pct_email_valido', CASE WHEN leads > 0 THEN ROUND(100.0 * com_email / leads, 1) END,
      'pct_tel_valido',   CASE WHEN leads > 0 THEN ROUND(100.0 * com_tel / leads, 1) END
    ) ORDER BY leads DESC), '[]'::JSON) INTO v_por_origem
    FROM (
      SELECT origem,
             COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE phase_slug IN ('closer', 'pos_venda', 'planner') OR fechou) AS qualif,
             COUNT(*) FILTER (WHERE fechou) AS fechados,
             AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket,
             COUNT(*) FILTER (WHERE contato_email IS NOT NULL AND contato_email ~ '@') AS com_email,
             COUNT(*) FILTER (WHERE contato_telefone IS NOT NULL AND length(regexp_replace(contato_telefone,'[^0-9]','','g')) >= 10) AS com_tel
        FROM _ww_mq
       WHERE origem IS NOT NULL
       GROUP BY origem
       HAVING COUNT(*) >= v_min
    ) g;

    -- ── Por campanha (combo origem + campaign + medium)
    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'campaign', campaign, 'medium', medium,
      'leads', leads, 'qualif', qualif, 'fechou', fechou,
      'taxa_qualif_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * qualif / leads, 1) END,
      'taxa_fech_pct',   CASE WHEN leads > 0 THEN ROUND(100.0 * fechou / leads, 1) END,
      'lift_vs_geral', CASE
                         WHEN v_taxa_geral IS NULL OR v_taxa_geral = 0 OR leads = 0 THEN NULL
                         ELSE ROUND(((100.0 * fechou / leads) / v_taxa_geral)::numeric, 2)
                       END,
      'ticket_medio', ROUND(ticket::NUMERIC, 0)
    ) ORDER BY leads DESC), '[]'::JSON) INTO v_por_campaign
    FROM (
      SELECT origem,
             COALESCE(utm_campaign, '(sem campanha)') AS campaign,
             COALESCE(utm_medium, '(sem medium)') AS medium,
             COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE phase_slug IN ('closer', 'pos_venda', 'planner') OR fechou) AS qualif,
             COUNT(*) FILTER (WHERE fechou) AS fechou,
             AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket
        FROM _ww_mq
       WHERE origem IS NOT NULL AND utm_campaign IS NOT NULL
       GROUP BY origem, utm_campaign, utm_medium
       HAVING COUNT(*) >= v_min
    ) g;

    -- ── Drop-off por fase (por origem) — onde cada fonte perde leads no funil
    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem,
      'entrada', entrada,
      'sdr',      sdr_count,
      'closer',   closer_count,
      'pos_venda',pos_count,
      'fechado',  fechado_count,
      'drop_entrada_sdr', CASE WHEN entrada > 0 THEN ROUND(100.0 * (entrada - sdr_count) / entrada, 1) END,
      'drop_sdr_closer',  CASE WHEN sdr_count > 0 THEN ROUND(100.0 * (sdr_count - closer_count) / sdr_count, 1) END,
      'drop_closer_fechado', CASE WHEN closer_count > 0 THEN ROUND(100.0 * (closer_count - fechado_count) / closer_count, 1) END
    ) ORDER BY entrada DESC), '[]'::JSON) INTO v_dropoff_por_origem
    FROM (
      SELECT origem,
             COUNT(*) AS entrada,
             COUNT(*) FILTER (WHERE phase_slug IN ('sdr','closer','pos_venda','planner') OR fechou) AS sdr_count,
             COUNT(*) FILTER (WHERE phase_slug IN ('closer','pos_venda','planner') OR fechou) AS closer_count,
             COUNT(*) FILTER (WHERE phase_slug IN ('pos_venda','planner') OR fechou) AS pos_count,
             COUNT(*) FILTER (WHERE fechou) AS fechado_count
        FROM _ww_mq
       WHERE origem IS NOT NULL
       GROUP BY origem
       HAVING COUNT(*) >= v_min
    ) g;

    DROP TABLE _ww_mq;

    RETURN json_build_object(
      'date_start', p_date_start, 'date_end', p_date_end,
      'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
      'total_leads', v_total_leads,
      'total_fechados', v_total_fechados,
      'taxa_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
      'por_origem', v_por_origem,
      'por_campaign', v_por_campaign,
      'dropoff_por_origem', v_dropoff_por_origem
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_marketing_qualidade(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], INT) TO authenticated;
