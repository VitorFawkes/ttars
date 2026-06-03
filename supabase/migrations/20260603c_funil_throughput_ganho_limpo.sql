-- 20260603c — Funil comparado (#1 reportado pelo Vitor: "data de entrada + 2025 dá 97, não 104").
--
-- DUAS causas (verificadas): (a) o funil é DW (exclui os 9 Elopements de propósito — pipeline
-- próprio); (b) no modo throughput o GANHO contava deals "ativos no período" (entrou-OU-ganhou),
-- inflando com casais que entraram em 2025 mas ganharam depois.
--
-- CONSERTO: no throughput, o marco GANHO conta por ganho_at no período (m_gp) → 95 DW limpo,
-- mantendo a monotonia (marcos superiores ainda contam "alcançou", ≥ ganho). E a RPC passa a
-- devolver `elopement_ganho` (Elopements ganhos no período, mesma régua de data) pra a tela
-- mostrar à parte: 95 DW + 9 Elopement = 104.
--
-- VERIFICAÇÃO REBASE (TOP 5 #5): parte da 20260602m (def viva, lê ww_funil_casal). Mudanças:
-- pool ganha coluna m_gp; o FILTER de ganho vira mode-aware; conversao_v1 devolve elopement_ganho.
-- Nada da lógica de cohort/dimensões/score é revertido. filter_options NÃO é tocada.

-- ---------- 1) ww_funil_conversao_v1 ----------
DROP FUNCTION IF EXISTS public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[]);

CREATE FUNCTION public.ww_funil_conversao_v1(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_faixas     TEXT[] DEFAULT NULL,
    p_convidados TEXT[] DEFAULT NULL,
    p_destinos   TEXT[] DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_baseline JSON; v_filtrado JSON; v_bt INT:=0; v_ft INT:=0; v_df INT; v_dc INT; v_dd INT; v_ac JSON;
    v_elo_ganho INT := 0;
BEGIN
    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT faixa, convidados, destino,
           agendou_sdr AS m_msdr, fez_sdr AS m_fsdr, agendou_closer AS m_mclo, fez_closer AS m_fclo, ganho AS m_g,
           (ganho AND ganho_at BETWEEN p_date_start AND p_date_end) AS m_gp
      FROM ww_funil_casal c
     WHERE NOT COALESCE(c.is_elopement,FALSE)
       AND (CASE WHEN p_date_mode='throughput' THEN
                  (c.lead_created_at BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_sdr_at  BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_closer_at BETWEEN p_date_start AND p_date_end)
               OR (c.ganho_at        BETWEEN p_date_start AND p_date_end)
            ELSE (c.lead_created_at BETWEEN p_date_start AND p_date_end) END)
       AND (p_origins IS NULL       OR c.origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids));

    SELECT COUNT(*) INTO v_bt FROM _pool;
    SELECT json_build_object('entrou', v_bt,
        'marcou_sdr',    COUNT(*) FILTER (WHERE m_msdr OR m_fsdr OR m_mclo OR m_fclo OR m_g),
        'fez_sdr',       COUNT(*) FILTER (WHERE m_fsdr OR m_mclo OR m_fclo OR m_g),
        'marcou_closer', COUNT(*) FILTER (WHERE m_mclo OR m_fclo OR m_g),
        'fez_closer',    COUNT(*) FILTER (WHERE m_fclo OR m_g),
        'ganho',         COUNT(*) FILTER (WHERE CASE WHEN p_date_mode='throughput' THEN m_gp ELSE m_g END)) INTO v_baseline FROM _pool;

    CREATE TEMP TABLE _filt ON COMMIT DROP AS
    SELECT * FROM _pool
     WHERE (p_faixas IS NULL     OR faixa = ANY(p_faixas))
       AND (p_convidados IS NULL OR convidados = ANY(p_convidados))
       AND (p_destinos IS NULL   OR destino = ANY(p_destinos));
    SELECT COUNT(*) INTO v_ft FROM _filt;
    SELECT json_build_object('entrou', v_ft,
        'marcou_sdr',    COUNT(*) FILTER (WHERE m_msdr OR m_fsdr OR m_mclo OR m_fclo OR m_g),
        'fez_sdr',       COUNT(*) FILTER (WHERE m_fsdr OR m_mclo OR m_fclo OR m_g),
        'marcou_closer', COUNT(*) FILTER (WHERE m_mclo OR m_fclo OR m_g),
        'fez_closer',    COUNT(*) FILTER (WHERE m_fclo OR m_g),
        'ganho',         COUNT(*) FILTER (WHERE CASE WHEN p_date_mode='throughput' THEN m_gp ELSE m_g END)) INTO v_filtrado FROM _filt;

    -- Elopement ganhos no período (à parte — pipeline próprio), mesma régua de data
    SELECT COUNT(*) INTO v_elo_ganho FROM ww_funil_casal c
     WHERE c.org_id = v_org AND COALESCE(c.is_elopement,FALSE) AND c.ganho
       AND (CASE WHEN p_date_mode='throughput'
                 THEN (c.ganho_at BETWEEN p_date_start AND p_date_end)
                 ELSE (c.lead_created_at BETWEEN p_date_start AND p_date_end) END);

    SELECT COUNT(DISTINCT faixa) FILTER (WHERE faixa IS NOT NULL),
           COUNT(DISTINCT convidados) FILTER (WHERE convidados IS NOT NULL),
           COUNT(DISTINCT destino) FILTER (WHERE destino IS NOT NULL)
      INTO v_df, v_dc, v_dd FROM _pool;

    SELECT json_build_object('last_event_at', MAX(processed_at),
        'minutes_ago', CASE WHEN MAX(processed_at) IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW()-MAX(processed_at)))/60.0 END,
        'status', CASE WHEN MAX(processed_at) IS NULL THEN 'unknown'
            WHEN NOW()-MAX(processed_at) < INTERVAL '10 minutes' THEN 'recent'
            WHEN NOW()-MAX(processed_at) < INTERVAL '60 minutes' THEN 'stale' ELSE 'very_stale' END
    ) INTO v_ac FROM integration_events
    WHERE entity_type='deal' AND processed_at IS NOT NULL AND created_at > NOW()-INTERVAL '24 hours';

    DROP TABLE _pool; DROP TABLE _filt;
    RETURN json_build_object(
        'periodo', json_build_object('date_start',p_date_start,'date_end',p_date_end,'date_mode',p_date_mode),
        'pipeline_id', NULL, 'org_id', v_org,
        'filtros_aplicados', json_build_object('faixas',p_faixas,'convidados',p_convidados,'destinos',p_destinos,'origins',p_origins,'tipos',p_tipos,'consultor_ids',p_consultor_ids),
        'ac_sync', v_ac, 'baseline', v_baseline, 'filtrado', v_filtrado,
        'baseline_total', v_bt, 'filtrado_total', v_ft,
        'elopement_ganho', v_elo_ganho,
        'distincts_disponiveis', json_build_object('faixas',v_df,'convidados',v_dc,'destinos',v_dd),
        'tem_filtro_preenchimento',
            (p_faixas IS NOT NULL AND array_length(p_faixas,1)>0)
         OR (p_convidados IS NOT NULL AND array_length(p_convidados,1)>0)
         OR (p_destinos IS NOT NULL AND array_length(p_destinos,1)>0));
END $func$;
GRANT EXECUTE ON FUNCTION public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

-- ---------- 2) ww_funil_ranking_combo (mesma régua de ganho mode-aware) ----------
DROP FUNCTION IF EXISTS public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[]);

CREATE FUNCTION public.ww_funil_ranking_combo(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_dimensoes  TEXT[] DEFAULT ARRAY['faixa'],
    p_origins    TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE v_rows JSON; v_total INT:=0; v_dims TEXT[]; v_p0 NUMERIC:=0; v_bt INT:=0; v_bg INT:=0;
BEGIN
    SELECT ARRAY(SELECT DISTINCT d FROM unnest(COALESCE(p_dimensoes, ARRAY['faixa'])) d WHERE d IN ('faixa','convidados','destino')) INTO v_dims;
    IF v_dims IS NULL OR array_length(v_dims,1) IS NULL THEN v_dims := ARRAY['faixa']; END IF;

    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT faixa, convidados, destino,
           agendou_sdr AS m_msdr, fez_sdr AS m_fsdr, agendou_closer AS m_mclo, fez_closer AS m_fclo,
           (CASE WHEN p_date_mode='throughput' THEN (ganho AND ganho_at BETWEEN p_date_start AND p_date_end) ELSE ganho END) AS m_g
      FROM ww_funil_casal c
     WHERE NOT COALESCE(c.is_elopement,FALSE)
       AND (CASE WHEN p_date_mode='throughput' THEN
                  (c.lead_created_at BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_sdr_at BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_closer_at BETWEEN p_date_start AND p_date_end)
               OR (c.ganho_at BETWEEN p_date_start AND p_date_end)
            ELSE (c.lead_created_at BETWEEN p_date_start AND p_date_end) END)
       AND (p_origins IS NULL       OR c.origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids));

    SELECT COUNT(*) INTO v_total FROM _pool;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE m_g) INTO v_bt, v_bg FROM _pool
     WHERE (NOT ('faixa'=ANY(v_dims)) OR faixa IS NOT NULL)
       AND (NOT ('convidados'=ANY(v_dims)) OR convidados IS NOT NULL)
       AND (NOT ('destino'=ANY(v_dims)) OR destino IS NOT NULL);
    v_p0 := CASE WHEN v_bt>0 THEN v_bg::NUMERIC/v_bt ELSE 0 END;

    SELECT json_agg(json_build_object('faixa',faixa,'convidados',convidados,'destino',destino,'label',label,
             'entrou',entrou,'marcou_sdr',m_sdr,'fez_sdr',f_sdr,'marcou_closer',m_cl,'fez_closer',f_cl,'ganho',ganho,'taxa_pct',taxa_pct)
           ORDER BY score DESC, entrou DESC) INTO v_rows
    FROM (
        SELECT g_faixa AS faixa, g_conv AS convidados, g_dest AS destino,
               concat_ws(' · ', g_faixa, g_conv, g_dest) AS label, entrou, m_sdr, f_sdr, m_cl, f_cl, ganho,
               ROUND(100.0*ganho/NULLIF(entrou,0),1) AS taxa_pct, (ganho + 15*v_p0)/(entrou+15) AS score
        FROM (
            SELECT g_faixa, g_conv, g_dest, COUNT(*) AS entrou,
                   COUNT(*) FILTER (WHERE m_msdr OR m_fsdr OR m_mclo OR m_fclo OR m_g) AS m_sdr,
                   COUNT(*) FILTER (WHERE m_fsdr OR m_mclo OR m_fclo OR m_g) AS f_sdr,
                   COUNT(*) FILTER (WHERE m_mclo OR m_fclo OR m_g) AS m_cl,
                   COUNT(*) FILTER (WHERE m_fclo OR m_g) AS f_cl,
                   COUNT(*) FILTER (WHERE m_g) AS ganho
            FROM (
                SELECT CASE WHEN 'faixa'=ANY(v_dims) THEN faixa END AS g_faixa,
                       CASE WHEN 'convidados'=ANY(v_dims) THEN convidados END AS g_conv,
                       CASE WHEN 'destino'=ANY(v_dims) THEN destino END AS g_dest,
                       m_msdr,m_fsdr,m_mclo,m_fclo,m_g
                FROM _pool
                WHERE (NOT ('faixa'=ANY(v_dims)) OR faixa IS NOT NULL)
                  AND (NOT ('convidados'=ANY(v_dims)) OR convidados IS NOT NULL)
                  AND (NOT ('destino'=ANY(v_dims)) OR destino IS NOT NULL)
            ) sel GROUP BY g_faixa, g_conv, g_dest
        ) grp ORDER BY score DESC, entrou DESC LIMIT 500
    ) r;

    DROP TABLE _pool;
    RETURN json_build_object('dimensoes',v_dims,
        'periodo',json_build_object('date_start',p_date_start,'date_end',p_date_end,'date_mode',p_date_mode),
        'total_no_periodo',v_total,'rows',COALESCE(v_rows,'[]'::JSON));
END $func$;
GRANT EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;
