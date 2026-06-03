-- 20260603h — Filtro DW×Elopement nas RPCs baseadas em ww_funil_casal (Perfil + Funil)
--
-- ww_funil_casal já tem a coluna `tipo` ('DW'/'Elopement', derivada da esteira). Estas RPCs liam
-- a tabela mas não filtravam por tipo. Adiciona:
--   • ww_v2_lead_ideal: parâmetro p_tipos + filtro nos 2 lados + `tipo` como dimensão de comparação
--     (mostra o mix DW/Elopement que ENTRA vs que FECHOU).
--   • ww_funil_conversao_v1 / ww_funil_ranking_combo: `tipo` no pool + filtro p_tipos (permite isolar
--     o funil de DW ou de Elopement; o padrão — sem filtro — continua mostrando TUDO, 104).
--
-- REBASE (TOP 5 #5): lead_ideal parte de 20260603b; funis partem de 20260603e (def vivas). Mudança
-- ADITIVA (coluna tipo + filtro). Nada da lógica viva removido. DROP+CREATE (recriação revisada).

-- ═══════════════════════ 1) ww_v2_lead_ideal (base 20260603b + p_tipos + dim tipo) ═══════════════════════
DROP FUNCTION IF EXISTS public.ww_v2_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, TEXT[], UUID[], TEXT[], TEXT[], TEXT[]);

CREATE FUNCTION public.ww_v2_lead_ideal(
    p_atual_start     TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_atual_end       TIMESTAMPTZ DEFAULT NOW(),
    p_org_id          UUID DEFAULT NULL,
    p_historico_start TIMESTAMPTZ DEFAULT NULL,
    p_historico_end   TIMESTAMPTZ DEFAULT NULL,
    p_historico_meses INT DEFAULT 12,
    p_min_amostra     INT DEFAULT 2,
    p_origins         TEXT[] DEFAULT NULL,
    p_consultor_ids   UUID[] DEFAULT NULL,
    p_faixas          TEXT[] DEFAULT NULL,
    p_destinos        TEXT[] DEFAULT NULL,
    p_convidados      TEXT[] DEFAULT NULL,
    p_tipos           TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_hist_start TIMESTAMPTZ;
    v_hist_end   TIMESTAMPTZ;
    v_total_hist INT := 0;
    v_total_atual INT := 0;
    v_comparacoes JSON;
    v_cruzamentos JSON;
    v_top_perfis_hist JSON;
    v_top_perfis_atual JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 2));
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    IF p_historico_start IS NOT NULL AND p_historico_end IS NOT NULL THEN
      v_hist_start := p_historico_start;
      v_hist_end := p_historico_end;
    ELSE
      v_hist_start := '1970-01-01'::timestamptz;
      v_hist_end := NOW();
    END IF;

    CREATE TEMP TABLE _ww_v2_pli_h ON COMMIT DROP AS
    SELECT faixa, destino, convidados, tipo
      FROM ww_funil_casal
     WHERE org_id = v_org_id AND ganho = TRUE
       AND (ganho_at IS NULL OR (ganho_at >= v_hist_start AND ganho_at <= v_hist_end))
       AND (p_origins IS NULL       OR origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR consultor_id = ANY(p_consultor_ids))
       AND (p_faixas IS NULL        OR faixa = ANY(p_faixas))
       AND (p_destinos IS NULL      OR destino = ANY(p_destinos))
       AND (p_convidados IS NULL    OR convidados = ANY(p_convidados))
       AND (p_tipos IS NULL         OR tipo = ANY(p_tipos));

    CREATE TEMP TABLE _ww_v2_pli_a ON COMMIT DROP AS
    SELECT faixa, destino, convidados, tipo
      FROM ww_funil_casal
     WHERE org_id = v_org_id
       AND lead_created_at >= p_atual_start AND lead_created_at <= p_atual_end
       AND (p_origins IS NULL       OR origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR consultor_id = ANY(p_consultor_ids))
       AND (p_faixas IS NULL        OR faixa = ANY(p_faixas))
       AND (p_destinos IS NULL      OR destino = ANY(p_destinos))
       AND (p_convidados IS NULL    OR convidados = ANY(p_convidados))
       AND (p_tipos IS NULL         OR tipo = ANY(p_tipos));

    SELECT COUNT(*) INTO v_total_hist  FROM _ww_v2_pli_h;
    SELECT COUNT(*) INTO v_total_atual FROM _ww_v2_pli_a;

    WITH dims AS (
      SELECT 'faixa' AS dim, faixa AS cat FROM _ww_v2_pli_h WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino', destino FROM _ww_v2_pli_h WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados', convidados FROM _ww_v2_pli_h WHERE convidados IS NOT NULL
      UNION ALL SELECT 'tipo', tipo FROM _ww_v2_pli_h WHERE tipo IS NOT NULL
    ),
    dims_a AS (
      SELECT 'faixa' AS dim, faixa AS cat FROM _ww_v2_pli_a WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino', destino FROM _ww_v2_pli_a WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados', convidados FROM _ww_v2_pli_a WHERE convidados IS NOT NULL
      UNION ALL SELECT 'tipo', tipo FROM _ww_v2_pli_a WHERE tipo IS NOT NULL
    ),
    tot_h AS (SELECT dim, COUNT(*) AS total FROM dims GROUP BY dim),
    tot_a AS (SELECT dim, COUNT(*) AS total FROM dims_a GROUP BY dim),
    by_h  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims GROUP BY dim, cat),
    by_a  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims_a GROUP BY dim, cat),
    cats AS (SELECT DISTINCT dim, cat FROM (SELECT dim, cat FROM by_h UNION ALL SELECT dim, cat FROM by_a) z),
    rows AS (
      SELECT c.dim, c.cat,
             COALESCE(h.qtd, 0) AS historico_qtd,
             COALESCE(a.qtd, 0) AS atual_qtd,
             CASE WHEN th.total > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / th.total, 1) END AS historico_pct,
             CASE WHEN ta.total > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / ta.total, 1) END AS atual_pct
        FROM cats c
        LEFT JOIN by_h h ON h.dim=c.dim AND h.cat=c.cat
        LEFT JOIN by_a a ON a.dim=c.dim AND a.cat=c.cat
        LEFT JOIN tot_h th ON th.dim=c.dim
        LEFT JOIN tot_a ta ON ta.dim=c.dim
    )
    SELECT COALESCE(json_agg(json_build_object('dimensao', dim, 'dados', dados)), '[]'::JSON) INTO v_comparacoes
    FROM (
      SELECT dim, json_agg(json_build_object(
          'categoria', cat,
          'historico_qtd', historico_qtd, 'historico_pct', historico_pct,
          'atual_qtd', atual_qtd, 'atual_pct', atual_pct,
          'lift', CASE WHEN historico_pct IS NULL OR historico_pct = 0 OR atual_pct IS NULL THEN NULL
                       ELSE ROUND((atual_pct / historico_pct)::numeric, 2) END,
          'delta_pp', CASE WHEN historico_pct IS NULL OR atual_pct IS NULL THEN NULL
                          ELSE ROUND((atual_pct - historico_pct)::numeric, 1) END
        ) ORDER BY historico_qtd DESC, atual_qtd DESC) AS dados
        FROM rows WHERE historico_qtd >= v_min OR atual_qtd >= v_min
       GROUP BY dim
    ) g;

    SELECT json_build_object(
      'faixa_x_convidados', (
        WITH h AS (SELECT faixa AS x, convidados AS y, COUNT(*) AS qtd FROM _ww_v2_pli_h WHERE faixa IS NOT NULL AND convidados IS NOT NULL GROUP BY faixa, convidados),
             a AS (SELECT faixa AS x, convidados AS y, COUNT(*) AS qtd FROM _ww_v2_pli_a WHERE faixa IS NOT NULL AND convidados IS NOT NULL GROUP BY faixa, convidados),
             cells AS (SELECT DISTINCT x, y FROM (SELECT x, y FROM h UNION ALL SELECT x, y FROM a) z)
        SELECT COALESCE(json_agg(json_build_object(
          'x', cells.x, 'y', cells.y,
          'hist_qtd', COALESCE(h.qtd, 0),
          'hist_pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / v_total_hist, 1) END,
          'atual_qtd', COALESCE(a.qtd, 0),
          'atual_pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / v_total_atual, 1) END
        )), '[]'::JSON)
        FROM cells LEFT JOIN h ON h.x = cells.x AND h.y = cells.y LEFT JOIN a ON a.x = cells.x AND a.y = cells.y
      ),
      'faixa_x_destino', (
        WITH h AS (SELECT faixa AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_h WHERE faixa IS NOT NULL AND destino IS NOT NULL GROUP BY faixa, destino),
             a AS (SELECT faixa AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_a WHERE faixa IS NOT NULL AND destino IS NOT NULL GROUP BY faixa, destino),
             cells AS (SELECT DISTINCT x, y FROM (SELECT x, y FROM h UNION ALL SELECT x, y FROM a) z)
        SELECT COALESCE(json_agg(json_build_object(
          'x', cells.x, 'y', cells.y,
          'hist_qtd', COALESCE(h.qtd, 0),
          'hist_pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / v_total_hist, 1) END,
          'atual_qtd', COALESCE(a.qtd, 0),
          'atual_pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / v_total_atual, 1) END
        )), '[]'::JSON)
        FROM cells LEFT JOIN h ON h.x = cells.x AND h.y = cells.y LEFT JOIN a ON a.x = cells.x AND a.y = cells.y
      ),
      'convidados_x_destino', (
        WITH h AS (SELECT convidados AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_h WHERE convidados IS NOT NULL AND destino IS NOT NULL GROUP BY convidados, destino),
             a AS (SELECT convidados AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_a WHERE convidados IS NOT NULL AND destino IS NOT NULL GROUP BY convidados, destino),
             cells AS (SELECT DISTINCT x, y FROM (SELECT x, y FROM h UNION ALL SELECT x, y FROM a) z)
        SELECT COALESCE(json_agg(json_build_object(
          'x', cells.x, 'y', cells.y,
          'hist_qtd', COALESCE(h.qtd, 0),
          'hist_pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / v_total_hist, 1) END,
          'atual_qtd', COALESCE(a.qtd, 0),
          'atual_pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / v_total_atual, 1) END
        )), '[]'::JSON)
        FROM cells LEFT JOIN h ON h.x = cells.x AND h.y = cells.y LEFT JOIN a ON a.x = cells.x AND a.y = cells.y
      )
    ) INTO v_cruzamentos;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa, 'destino', destino, 'convidados', convidados,
      'qtd', qtd,
      'pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * qtd / v_total_hist, 1) END
    ) ORDER BY qtd DESC), '[]'::JSON) INTO v_top_perfis_hist
    FROM (
      SELECT faixa, destino, convidados, COUNT(*) AS qtd
        FROM _ww_v2_pli_h WHERE faixa IS NOT NULL AND destino IS NOT NULL AND convidados IS NOT NULL
       GROUP BY faixa, destino, convidados
       HAVING COUNT(*) >= 1
       ORDER BY COUNT(*) DESC LIMIT 10
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa, 'destino', destino, 'convidados', convidados,
      'qtd', qtd,
      'pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * qtd / v_total_atual, 1) END
    ) ORDER BY qtd DESC), '[]'::JSON) INTO v_top_perfis_atual
    FROM (
      SELECT faixa, destino, convidados, COUNT(*) AS qtd
        FROM _ww_v2_pli_a WHERE faixa IS NOT NULL AND destino IS NOT NULL AND convidados IS NOT NULL
       GROUP BY faixa, destino, convidados
       HAVING COUNT(*) >= v_min
       ORDER BY COUNT(*) DESC LIMIT 10
    ) g;

    DROP TABLE _ww_v2_pli_h;
    DROP TABLE _ww_v2_pli_a;

    RETURN json_build_object(
      'atual_start', p_atual_start, 'atual_end', p_atual_end,
      'historico_start', v_hist_start, 'historico_end', v_hist_end,
      'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
      'min_amostra', v_min,
      'fonte_v2', 'ww_funil_casal',
      'filtros_aplicados', json_build_object('origins',p_origins,'consultor_ids',p_consultor_ids,'faixas',p_faixas,'destinos',p_destinos,'convidados',p_convidados,'tipos',p_tipos),
      'total_historico', v_total_hist,
      'total_atual', v_total_atual,
      'comparacoes', v_comparacoes,
      'cruzamentos', v_cruzamentos,
      'top_perfis_historico', v_top_perfis_hist,
      'top_perfis_atual', v_top_perfis_atual
    );
END $func$;
GRANT EXECUTE ON FUNCTION public.ww_v2_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[]) TO authenticated;

-- ═══════════════════════ 2) ww_funil_conversao_v1 (base 20260603e + tipo no pool) ═══════════════════════
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
       AND (p_tipos IS NULL         OR c.tipo = ANY(p_tipos))
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

-- ═══════════════════════ 3) ww_funil_ranking_combo (base 20260603e + tipo no pool) ═══════════════════════
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
       AND (p_tipos IS NULL         OR c.tipo = ANY(p_tipos))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids));

    SELECT COUNT(*) INTO v_total FROM _pool;
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
