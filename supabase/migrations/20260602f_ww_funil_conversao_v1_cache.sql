-- ============================================================================
-- ww_funil_conversao_v1 — AGORA lê 100% do ww_ac_deal_funnel_cache (AC-only).
-- ZERO cards/CRM. Mesma assinatura e MESMO formato de saída (baseline/filtrado
-- com os 6 marcos cumulativos, distincts, ac_sync). DROP+CREATE.
-- baseline = universo no período (com origem/tipo/consultor); filtrado = + perfil.
-- ============================================================================

DROP FUNCTION IF EXISTS public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[]);

CREATE FUNCTION public.ww_funil_conversao_v1(
    p_date_start    TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end      TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode     TEXT        DEFAULT 'cohort',
    p_org_id        UUID        DEFAULT NULL,
    p_faixas        TEXT[]      DEFAULT NULL,
    p_convidados    TEXT[]      DEFAULT NULL,
    p_destinos      TEXT[]      DEFAULT NULL,
    p_origins       TEXT[]      DEFAULT NULL,
    p_tipos         TEXT[]      DEFAULT NULL,
    p_consultor_ids UUID[]      DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_baseline JSON; v_filtrado JSON; v_baseline_total INT := 0; v_filtrado_total INT := 0;
    v_ac_sync JSON; v_df INT; v_dc INT; v_dd INT;
BEGIN
    -- baseline: universo DW no período + origem/tipo/consultor (SEM perfil faixa/conv/destino)
    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT _ww2_norm_faixa_strict(faixa_raw) AS faixa,
           _ww2_norm_conv_strict(convidados_raw) AS convidados,
           _ww2_norm_dest_strict(destino_raw) AS destino,
           marco_marcou_sdr AS m_msdr, marco_fez_sdr AS m_fsdr, marco_marcou_closer AS m_mclo,
           marco_fez_closer AS m_fclo, marco_ganho AS m_g
      FROM ww_ac_deal_funnel_cache c
     WHERE c.pipeline_group_id IN (1,3,4)
       AND NOT COALESCE(c.is_duplicado,FALSE) AND NOT COALESCE(c.is_elopement_pipeline,FALSE)
       AND (CASE WHEN p_date_mode='throughput' THEN
                  (c.deal_created_at BETWEEN p_date_start AND p_date_end)
               OR (c.sdr_agendou_at BETWEEN p_date_start AND p_date_end)
               OR (c.closer_agendou_at BETWEEN p_date_start AND p_date_end)
               OR (c.ganho_at BETWEEN p_date_start AND p_date_end)
            ELSE (c.deal_created_at BETWEEN p_date_start AND p_date_end) END)
       AND (p_origins IS NULL       OR _ww_ac_norm_origem(COALESCE(c.utm_source,c.origem_conversao)) = ANY(p_origins))
       AND (p_tipos IS NULL         OR c.tipo_casamento = ANY(p_tipos))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids));

    SELECT COUNT(*) INTO v_baseline_total FROM _pool;
    SELECT json_build_object(
        'entrou', v_baseline_total,
        'marcou_sdr',    COUNT(*) FILTER (WHERE m_msdr OR m_fsdr OR m_mclo OR m_fclo OR m_g),
        'fez_sdr',       COUNT(*) FILTER (WHERE m_fsdr OR m_mclo OR m_fclo OR m_g),
        'marcou_closer', COUNT(*) FILTER (WHERE m_mclo OR m_fclo OR m_g),
        'fez_closer',    COUNT(*) FILTER (WHERE m_fclo OR m_g),
        'ganho',         COUNT(*) FILTER (WHERE m_g)
    ) INTO v_baseline FROM _pool;

    -- filtrado: baseline + perfil (faixa/convidados/destino)
    CREATE TEMP TABLE _filt ON COMMIT DROP AS
    SELECT * FROM _pool
     WHERE (p_faixas IS NULL     OR faixa = ANY(p_faixas))
       AND (p_convidados IS NULL OR convidados = ANY(p_convidados))
       AND (p_destinos IS NULL   OR destino = ANY(p_destinos));
    SELECT COUNT(*) INTO v_filtrado_total FROM _filt;
    SELECT json_build_object(
        'entrou', v_filtrado_total,
        'marcou_sdr',    COUNT(*) FILTER (WHERE m_msdr OR m_fsdr OR m_mclo OR m_fclo OR m_g),
        'fez_sdr',       COUNT(*) FILTER (WHERE m_fsdr OR m_mclo OR m_fclo OR m_g),
        'marcou_closer', COUNT(*) FILTER (WHERE m_mclo OR m_fclo OR m_g),
        'fez_closer',    COUNT(*) FILTER (WHERE m_fclo OR m_g),
        'ganho',         COUNT(*) FILTER (WHERE m_g)
    ) INTO v_filtrado FROM _filt;

    SELECT COUNT(DISTINCT faixa) FILTER (WHERE faixa IS NOT NULL),
           COUNT(DISTINCT convidados) FILTER (WHERE convidados IS NOT NULL),
           COUNT(DISTINCT destino) FILTER (WHERE destino IS NOT NULL)
      INTO v_df, v_dc, v_dd FROM _pool;

    SELECT json_build_object(
        'last_event_at', MAX(processed_at),
        'minutes_ago', CASE WHEN MAX(processed_at) IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW()-MAX(processed_at)))/60.0 END,
        'status', CASE WHEN MAX(processed_at) IS NULL THEN 'unknown'
            WHEN NOW()-MAX(processed_at) < INTERVAL '10 minutes' THEN 'recent'
            WHEN NOW()-MAX(processed_at) < INTERVAL '60 minutes' THEN 'stale' ELSE 'very_stale' END
    ) INTO v_ac_sync FROM integration_events
    WHERE entity_type='deal' AND processed_at IS NOT NULL AND created_at > NOW()-INTERVAL '24 hours';

    DROP TABLE _pool; DROP TABLE _filt;
    RETURN json_build_object(
        'periodo', json_build_object('date_start',p_date_start,'date_end',p_date_end,'date_mode',p_date_mode),
        'pipeline_id', NULL, 'org_id', v_org_id,
        'filtros_aplicados', json_build_object('faixas',p_faixas,'convidados',p_convidados,'destinos',p_destinos,'origins',p_origins,'tipos',p_tipos,'consultor_ids',p_consultor_ids),
        'ac_sync', v_ac_sync, 'baseline', v_baseline, 'filtrado', v_filtrado,
        'baseline_total', v_baseline_total, 'filtrado_total', v_filtrado_total,
        'distincts_disponiveis', json_build_object('faixas',v_df,'convidados',v_dc,'destinos',v_dd),
        'tem_filtro_preenchimento',
            (p_faixas IS NOT NULL AND array_length(p_faixas,1)>0)
         OR (p_convidados IS NOT NULL AND array_length(p_convidados,1)>0)
         OR (p_destinos IS NOT NULL AND array_length(p_destinos,1)>0)
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;
