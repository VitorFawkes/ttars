-- 20260603e — Funil/matriz: PADRÃO passa a mostrar TUDO (DW + Elopement = 104), não só DW.
--
-- Pedido do Vitor: as outras abas já mostram 104; o funil comparado e a matriz mostravam 95
-- (só Destination Wedding) porque filtravam NOT is_elopement. Remove esse filtro → inclui todos
-- os casamentos por padrão. (O filtro DW/Elopement vem depois, planejado à parte.)
-- Elopements passam pelas etapas (96 fez_sdr, 70 fez_closer, 18 ganho) — funil fica coerente.
--
-- VERIFICAÇÃO REBASE (TOP 5 #5): parte das defs vivas (conversao_v1 + ranking_combo da 20260603c;
-- filter_options da 20260602m). Mudanças: remove `NOT COALESCE(is_elopement,FALSE)` dos pools e
-- das options; remove o elopement_ganho (agora tudo já entra no ganho). Throughput limpo (m_gp)
-- e demais lógicas preservados.

-- ---------- 1) ww_funil_conversao_v1 (inclui Elopement) ----------
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
BEGIN
    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT faixa, convidados, destino,
           agendou_sdr AS m_msdr, fez_sdr AS m_fsdr, agendou_closer AS m_mclo, fez_closer AS m_fclo, ganho AS m_g,
           (ganho AND ganho_at BETWEEN p_date_start AND p_date_end) AS m_gp
      FROM ww_funil_casal c
     WHERE c.org_id = v_org
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
        'distincts_disponiveis', json_build_object('faixas',v_df,'convidados',v_dc,'destinos',v_dd),
        'tem_filtro_preenchimento',
            (p_faixas IS NOT NULL AND array_length(p_faixas,1)>0)
         OR (p_convidados IS NOT NULL AND array_length(p_convidados,1)>0)
         OR (p_destinos IS NOT NULL AND array_length(p_destinos,1)>0));
END $func$;
GRANT EXECUTE ON FUNCTION public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

-- ---------- 2) ww_funil_ranking_combo (inclui Elopement) ----------
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
     WHERE (CASE WHEN p_date_mode='throughput' THEN
                  (c.lead_created_at BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_sdr_at BETWEEN p_date_start AND p_date_end)
               OR (c.agendou_closer_at BETWEEN p_date_start AND p_date_end)
               OR (c.ganho_at BETWEEN p_date_start AND p_date_end)
            ELSE (c.lead_created_at BETWEEN p_date_start AND p_date_end) END)
       AND (p_origins IS NULL       OR c.origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids));

    SELECT COUNT(*) INTO v_total FROM _pool;
    -- inclui TUDO (null da dimensão vira 'Não informado') p/ reconciliar com o total de casamentos
    SELECT COUNT(*), COUNT(*) FILTER (WHERE m_g) INTO v_bt, v_bg FROM _pool;
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
                SELECT CASE WHEN 'faixa'=ANY(v_dims) THEN COALESCE(faixa, 'Não informado') END AS g_faixa,
                       CASE WHEN 'convidados'=ANY(v_dims) THEN COALESCE(convidados, 'Não informado') END AS g_conv,
                       CASE WHEN 'destino'=ANY(v_dims) THEN COALESCE(destino, 'Não informado') END AS g_dest,
                       m_msdr,m_fsdr,m_mclo,m_fclo,m_g
                FROM _pool
            ) sel GROUP BY g_faixa, g_conv, g_dest
        ) grp ORDER BY score DESC, entrou DESC LIMIT 500
    ) r;

    DROP TABLE _pool;
    RETURN json_build_object('dimensoes',v_dims,
        'periodo',json_build_object('date_start',p_date_start,'date_end',p_date_end,'date_mode',p_date_mode),
        'total_no_periodo',v_total,'rows',COALESCE(v_rows,'[]'::JSON));
END $func$;
GRANT EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

-- ---------- 3) ww_funil_filter_options (inclui Elopement) ----------
DROP FUNCTION IF EXISTS public.ww_funil_filter_options(UUID);

CREATE FUNCTION public.ww_funil_filter_options(p_org_id UUID DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE v_f JSON; v_c JSON; v_d JSON; v_o JSON; v_cons JSON;
BEGIN
    SELECT json_agg(x ORDER BY x) INTO v_f FROM (SELECT DISTINCT faixa x FROM ww_funil_casal WHERE faixa IS NOT NULL) a;
    SELECT json_agg(x ORDER BY x) INTO v_c FROM (SELECT DISTINCT convidados x FROM ww_funil_casal WHERE convidados IS NOT NULL) a;
    SELECT json_agg(x ORDER BY x) INTO v_d FROM (SELECT DISTINCT destino x FROM ww_funil_casal WHERE destino IS NOT NULL) a;
    SELECT json_agg(x ORDER BY x) INTO v_o FROM (SELECT DISTINCT origem x FROM ww_funil_casal WHERE origem IS NOT NULL AND origem<>'Desconhecida') a;
    SELECT json_agg(json_build_object('id',consultor_id,'nome',consultor_nome) ORDER BY consultor_nome) INTO v_cons
      FROM (SELECT DISTINCT consultor_id, consultor_nome FROM ww_funil_casal WHERE consultor_id IS NOT NULL AND consultor_nome IS NOT NULL) a;
    RETURN json_build_object('faixas',COALESCE(v_f,'[]'::JSON),'convidados',COALESCE(v_c,'[]'::JSON),
        'destinos',COALESCE(v_d,'[]'::JSON),'origens',COALESCE(v_o,'[]'::JSON),'consultores',COALESCE(v_cons,'[]'::JSON));
END $func$;
GRANT EXECUTE ON FUNCTION public.ww_funil_filter_options(UUID) TO authenticated;
