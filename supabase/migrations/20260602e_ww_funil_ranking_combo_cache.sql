-- ============================================================================
-- ww_funil_ranking_combo — AGORA lê 100% do ww_ac_deal_funnel_cache (AC-only).
-- ZERO cards/CRM. Mesma assinatura e MESMO formato de saída (não quebra a tela).
--
-- Marcos já calculados no cache (regras finais: closer=campo 299 + andamento).
-- Dimensões: faixa/convidados/destino normalizados dos campos DECLARADOS do form
--   (deal) — bem preenchidos (≠ real_orcamento sparse). Origem via normalizador
--   AC existente (_ww_ac_norm_origem). Consultor resolvido (AC owner→profile).
-- DROP+CREATE (plain) — repointa a fonte; releitura das versões anteriores feita.
-- ============================================================================

DROP FUNCTION IF EXISTS public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[]);

CREATE FUNCTION public.ww_funil_ranking_combo(
    p_date_start    TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end      TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode     TEXT        DEFAULT 'cohort',
    p_org_id        UUID        DEFAULT NULL,
    p_dimensoes     TEXT[]      DEFAULT ARRAY['faixa'],
    p_origins       TEXT[]      DEFAULT NULL,
    p_tipos         TEXT[]      DEFAULT NULL,
    p_consultor_ids UUID[]      DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_rows JSON; v_total INT := 0; v_dims TEXT[];
    v_p0 NUMERIC := 0; v_base_total INT := 0; v_base_ganho INT := 0;
BEGIN
    SELECT ARRAY(SELECT DISTINCT d FROM unnest(COALESCE(p_dimensoes, ARRAY['faixa'])) d
                 WHERE d IN ('faixa','convidados','destino')) INTO v_dims;
    IF v_dims IS NULL OR array_length(v_dims,1) IS NULL THEN v_dims := ARRAY['faixa']; END IF;

    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT
        _ww2_norm_faixa_strict(faixa_raw)      AS faixa,
        _ww2_norm_conv_strict(convidados_raw)  AS convidados,
        _ww2_norm_dest_strict(destino_raw)     AS destino,
        marco_marcou_sdr AS m_msdr, marco_fez_sdr AS m_fsdr,
        marco_marcou_closer AS m_mclo, marco_fez_closer AS m_fclo, marco_ganho AS m_g
      FROM ww_ac_deal_funnel_cache c
     WHERE c.pipeline_group_id IN (1,3,4)
       AND NOT COALESCE(c.is_duplicado,FALSE)
       AND NOT COALESCE(c.is_elopement_pipeline,FALSE)
       AND (CASE WHEN p_date_mode='throughput' THEN
                  (c.deal_created_at  BETWEEN p_date_start AND p_date_end)
               OR (c.sdr_agendou_at   BETWEEN p_date_start AND p_date_end)
               OR (c.closer_agendou_at BETWEEN p_date_start AND p_date_end)
               OR (c.ganho_at         BETWEEN p_date_start AND p_date_end)
            ELSE (c.deal_created_at BETWEEN p_date_start AND p_date_end) END)
       AND (p_origins IS NULL       OR _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) = ANY(p_origins))
       AND (p_tipos IS NULL         OR c.tipo_casamento = ANY(p_tipos))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids));

    SELECT COUNT(*) INTO v_total FROM _pool;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE m_g)
      INTO v_base_total, v_base_ganho FROM _pool
     WHERE (NOT ('faixa'=ANY(v_dims)) OR faixa IS NOT NULL)
       AND (NOT ('convidados'=ANY(v_dims)) OR convidados IS NOT NULL)
       AND (NOT ('destino'=ANY(v_dims)) OR destino IS NOT NULL);
    v_p0 := CASE WHEN v_base_total>0 THEN v_base_ganho::NUMERIC/v_base_total ELSE 0 END;

    SELECT json_agg(json_build_object(
             'faixa',faixa,'convidados',convidados,'destino',destino,'label',label,
             'entrou',entrou,'marcou_sdr',m_sdr,'fez_sdr',f_sdr,'marcou_closer',m_cl,
             'fez_closer',f_cl,'ganho',ganho,'taxa_pct',taxa_pct
           ) ORDER BY score DESC, entrou DESC) INTO v_rows
    FROM (
        SELECT g_faixa AS faixa, g_conv AS convidados, g_dest AS destino,
               concat_ws(' · ', g_faixa, g_conv, g_dest) AS label,
               entrou, m_sdr, f_sdr, m_cl, f_cl, ganho,
               ROUND(100.0*ganho/NULLIF(entrou,0),1) AS taxa_pct,
               (ganho + 15*v_p0)/(entrou+15) AS score
        FROM (
            SELECT g_faixa, g_conv, g_dest,
                   COUNT(*)                                                          AS entrou,
                   COUNT(*) FILTER (WHERE m_msdr OR m_fsdr OR m_mclo OR m_fclo OR m_g) AS m_sdr,
                   COUNT(*) FILTER (WHERE m_fsdr OR m_mclo OR m_fclo OR m_g)           AS f_sdr,
                   COUNT(*) FILTER (WHERE m_mclo OR m_fclo OR m_g)                     AS m_cl,
                   COUNT(*) FILTER (WHERE m_fclo OR m_g)                               AS f_cl,
                   COUNT(*) FILTER (WHERE m_g)                                         AS ganho
            FROM (
                SELECT CASE WHEN 'faixa'=ANY(v_dims) THEN faixa END AS g_faixa,
                       CASE WHEN 'convidados'=ANY(v_dims) THEN convidados END AS g_conv,
                       CASE WHEN 'destino'=ANY(v_dims) THEN destino END AS g_dest,
                       m_msdr,m_fsdr,m_mclo,m_fclo,m_g
                FROM _pool
                WHERE (NOT ('faixa'=ANY(v_dims)) OR faixa IS NOT NULL)
                  AND (NOT ('convidados'=ANY(v_dims)) OR convidados IS NOT NULL)
                  AND (NOT ('destino'=ANY(v_dims)) OR destino IS NOT NULL)
            ) sel
            GROUP BY g_faixa, g_conv, g_dest
        ) grp
        ORDER BY score DESC, entrou DESC
        LIMIT 500
    ) r;

    DROP TABLE _pool;
    RETURN json_build_object('dimensoes',v_dims,
        'periodo',json_build_object('date_start',p_date_start,'date_end',p_date_end,'date_mode',p_date_mode),
        'total_no_periodo',v_total,'rows',COALESCE(v_rows,'[]'::JSON));
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;
