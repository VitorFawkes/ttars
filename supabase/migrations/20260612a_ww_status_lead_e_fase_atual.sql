-- 20260612a — Filtro Abertos/Perdidos + "Onde estão agora" sem perdidos e batendo com a lista
--
-- Pedidos do Vitor (2026-06-12, com print):
--   1) "Onde estão agora — por fase" (Visão geral) incluía PERDIDOS nas fases SDR/Closer.
--      Perdido é STATUS, não posição (memory feedback_perdido_ganho_sao_status) — se perdeu,
--      não está lá agora. Fases passam a excluir perdidos.
--   2) O número da fase divergia "por bem pouco" da lista do drill: o funil contava POR DEAL
--      (vw_ww_funnel_base) e o drill POR CASAL (ww_funil_casal) — casal com 2 cadastros contava
--      2x no bloco e 1x na lista. O bloco "Onde estão agora" passa a contar da ww_funil_casal
--      (mesma fonte e régua do drill → bate exato).
--   3) Filtro novo "Status do lead" (todos | aberto | perdido) nas abas onde muda a resposta:
--      Visão geral, Qualidade, Funil comparado. p_status_lead TEXT em:
--      ww2_overview, ww_serie_temporal, ww_funil_conversao_v1, ww_funil_ranking_combo,
--      ww_qualidade_lead e ww_drill_casais (o drill respeita o mesmo recorte do clique).
--      aberto = NOT ganho AND NOT is_perdido · perdido = is_perdido (ww_funil_casal, 20260604b).
--      Nas funções de universo por-deal (overview, qualidade) o status vem por JOIN no casal —
--      UMA definição de perdido pra tudo.
--
-- REBASE conferido (TOP-5 #5) — bases VIVAS extraídas verbatim dos arquivos (cadeia relida):
--   • ww_serie_temporal      ← 20260611a (def viva)
--   • ww_funil_conversao_v1  ← 20260611a (def viva)
--   • ww_funil_ranking_combo ← 20260611b (def viva)
--   • ww2_overview           ← 20260611d v7 (def viva; 611b v6 superseded HOJE — conferido no log)
--   • ww_qualidade_lead      ← 20260611b (def viva)
--   • ww_drill_casais        ← 20260611e v3 (def viva; este arquivo passa a ser a fonte = v4)
-- Assinaturas mudam (+p_status_lead) → DROP da assinatura antiga + CREATE + grants novos.
-- Grants: authenticated + service_role; REVOKE PUBLIC/anon.

-- ═══════════════ 1) ww_serie_temporal + p_status_lead ═══════════════
DROP FUNCTION IF EXISTS public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]); -- def viva 20260611a
DROP FUNCTION IF EXISTS public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT); -- re-aplicação

CREATE FUNCTION public.ww_serie_temporal(
    p_date_start        TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '12 months'),
    p_date_end          TIMESTAMPTZ DEFAULT NOW(),
    p_granularidade     TEXT DEFAULT 'month',
    p_org_id            UUID DEFAULT NULL,
    p_date_mode         TEXT DEFAULT 'throughput',
    p_incluir_elopement BOOLEAN DEFAULT TRUE,
    p_origins           TEXT[] DEFAULT NULL,
    p_faixas            TEXT[] DEFAULT NULL,
    p_destinos          TEXT[] DEFAULT NULL,
    p_convidados        TEXT[] DEFAULT NULL,
    p_consultor_ids     UUID[] DEFAULT NULL,
    p_tipos             TEXT[] DEFAULT NULL,
    p_sdr_canal         TEXT[] DEFAULT NULL,
    p_closer_canal      TEXT[] DEFAULT NULL,
    p_status_lead       TEXT DEFAULT NULL    -- 'aberto' | 'perdido' | NULL (todos)
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE
    v_org   UUID := COALESCE(p_org_id, requesting_org_id());
    v_trunc TEXT := CASE WHEN p_granularidade = 'week' THEN 'week' ELSE 'month' END;
    v_step  INTERVAL := CASE WHEN p_granularidade = 'week' THEN INTERVAL '1 week' ELSE INTERVAL '1 month' END;
    v_lblfmt TEXT := CASE WHEN p_granularidade = 'week' THEN 'DD/MM' ELSE 'MM/YYYY' END;
    v_series JSON;
    v_tot_e INT; v_tot_s INT; v_tot_c INT; v_tot_g INT;
BEGIN
    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT lead_created_at, fez_sdr, fez_sdr_at, fez_closer, fez_closer_at, ganho, ganho_at
      FROM ww_funil_casal c
     WHERE c.org_id = v_org
       AND (p_incluir_elopement OR NOT COALESCE(c.is_elopement, FALSE))
       AND (p_tipos IS NULL         OR c.tipo = ANY(p_tipos))
       AND (p_origins IS NULL       OR c.origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids))
       AND (p_faixas IS NULL        OR c.faixa = ANY(p_faixas))
       AND (p_destinos IS NULL      OR c.destino = ANY(p_destinos))
       AND (p_convidados IS NULL    OR c.convidados = ANY(p_convidados))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       AND (p_status_lead IS NULL
            OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
            OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

    IF p_date_mode = 'cohort' THEN
        WITH buckets AS (
            SELECT generate_series(date_trunc(v_trunc, p_date_start), date_trunc(v_trunc, p_date_end), v_step) AS b
        ),
        agg AS (
            SELECT date_trunc(v_trunc, lead_created_at) AS b,
                   COUNT(*) AS entrou,
                   COUNT(*) FILTER (WHERE fez_sdr) AS fez_sdr,
                   COUNT(*) FILTER (WHERE fez_closer) AS fez_closer,
                   COUNT(*) FILTER (WHERE ganho) AS ganho
              FROM _pool
             WHERE lead_created_at BETWEEN p_date_start AND p_date_end
             GROUP BY 1
        )
        SELECT json_agg(json_build_object(
                   'periodo', to_char(bk.b, 'YYYY-MM-DD'),
                   'label',   to_char(bk.b, v_lblfmt),
                   'entrou',     COALESCE(a.entrou, 0),
                   'fez_sdr',    COALESCE(a.fez_sdr, 0),
                   'fez_closer', COALESCE(a.fez_closer, 0),
                   'ganho',      COALESCE(a.ganho, 0)
               ) ORDER BY bk.b)
          INTO v_series
          FROM buckets bk LEFT JOIN agg a ON a.b = bk.b;
    ELSE
        WITH buckets AS (
            SELECT generate_series(date_trunc(v_trunc, p_date_start), date_trunc(v_trunc, p_date_end), v_step) AS b
        ),
        ev AS (
            SELECT date_trunc(v_trunc, lead_created_at) b, 1 e, 0 s, 0 c, 0 g FROM _pool WHERE lead_created_at BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, fez_sdr_at),    0,1,0,0 FROM _pool WHERE fez_sdr    AND fez_sdr_at    BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, fez_closer_at), 0,0,1,0 FROM _pool WHERE fez_closer AND fez_closer_at BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, ganho_at),      0,0,0,1 FROM _pool WHERE ganho      AND ganho_at      BETWEEN p_date_start AND p_date_end
        ),
        agg AS (SELECT b, SUM(e) entrou, SUM(s) fez_sdr, SUM(c) fez_closer, SUM(g) ganho FROM ev GROUP BY b)
        SELECT json_agg(json_build_object(
                   'periodo', to_char(bk.b, 'YYYY-MM-DD'),
                   'label',   to_char(bk.b, v_lblfmt),
                   'entrou',     COALESCE(a.entrou, 0),
                   'fez_sdr',    COALESCE(a.fez_sdr, 0),
                   'fez_closer', COALESCE(a.fez_closer, 0),
                   'ganho',      COALESCE(a.ganho, 0)
               ) ORDER BY bk.b)
          INTO v_series
          FROM buckets bk LEFT JOIN agg a ON a.b = bk.b;
    END IF;

    -- Totais do período (mesma régua de modo)
    IF p_date_mode = 'cohort' THEN
        SELECT COUNT(*), COUNT(*) FILTER (WHERE fez_sdr), COUNT(*) FILTER (WHERE fez_closer), COUNT(*) FILTER (WHERE ganho)
          INTO v_tot_e, v_tot_s, v_tot_c, v_tot_g
          FROM _pool WHERE lead_created_at BETWEEN p_date_start AND p_date_end;
    ELSE
        SELECT COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE fez_sdr    AND fez_sdr_at    BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE fez_closer AND fez_closer_at BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE ganho      AND ganho_at      BETWEEN p_date_start AND p_date_end)
          INTO v_tot_e, v_tot_s, v_tot_c, v_tot_g FROM _pool;
    END IF;

    DROP TABLE _pool;
    RETURN json_build_object(
        'granularidade', v_trunc,
        'date_mode', p_date_mode,
        'series', COALESCE(v_series, '[]'::JSON),
        'totais', json_build_object('entrou', v_tot_e, 'fez_sdr', v_tot_s, 'fez_closer', v_tot_c, 'ganho', v_tot_g)
    );
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT) TO authenticated, service_role;

-- ═══════════════ 2) ww_funil_conversao_v1 + p_status_lead ═══════════════
DROP FUNCTION IF EXISTS public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[]); -- def viva 20260611a
DROP FUNCTION IF EXISTS public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT); -- re-aplicação

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
    p_consultor_ids UUID[] DEFAULT NULL,
    p_sdr_canal    TEXT[] DEFAULT NULL,
    p_closer_canal TEXT[] DEFAULT NULL,
    p_status_lead  TEXT DEFAULT NULL    -- 'aberto' | 'perdido' | NULL (todos)
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE
    v_org UUID := COALESCE(p_org_id, requesting_org_id());
    v_baseline JSON; v_filtrado JSON; v_bt INT:=0; v_ft INT:=0; v_df INT; v_dc INT; v_dd INT; v_ac JSON;
BEGIN
    -- ⚠️ Filtro de canal redefine o universo: só casais que FIZERAM a reunião por aquele canal.
    --    As etapas anteriores à reunião ficam triviais (100%) — a leitura útil é DALI PRA FRENTE.
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
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       AND (p_status_lead IS NULL
            OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
            OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

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
        'filtros_aplicados', json_build_object('faixas',p_faixas,'convidados',p_convidados,'destinos',p_destinos,'origins',p_origins,'tipos',p_tipos,'consultor_ids',p_consultor_ids,'sdr_canal',p_sdr_canal,'closer_canal',p_closer_canal),
        'ac_sync', v_ac, 'baseline', v_baseline, 'filtrado', v_filtrado,
        'baseline_total', v_bt, 'filtrado_total', v_ft,
        'distincts_disponiveis', json_build_object('faixas',v_df,'convidados',v_dc,'destinos',v_dd),
        'tem_filtro_preenchimento',
            (p_faixas IS NOT NULL AND array_length(p_faixas,1)>0)
         OR (p_convidados IS NOT NULL AND array_length(p_convidados,1)>0)
         OR (p_destinos IS NOT NULL AND array_length(p_destinos,1)>0));
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT) TO authenticated, service_role;


-- ═══════════════ 3) ww_funil_ranking_combo + p_status_lead ═══════════════
DROP FUNCTION IF EXISTS public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[]); -- def viva 20260611b
DROP FUNCTION IF EXISTS public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT); -- re-aplicação

CREATE FUNCTION public.ww_funil_ranking_combo(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_dimensoes  TEXT[] DEFAULT ARRAY['faixa'],
    p_origins    TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL,
    p_sdr_canal    TEXT[] DEFAULT NULL,
    p_closer_canal TEXT[] DEFAULT NULL,
    p_faixas       TEXT[] DEFAULT NULL,
    p_convidados   TEXT[] DEFAULT NULL,
    p_destinos     TEXT[] DEFAULT NULL,
    p_status_lead  TEXT DEFAULT NULL    -- 'aberto' | 'perdido' | NULL (todos)
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $func$
DECLARE v_rows JSON; v_total INT:=0; v_dims TEXT[]; v_p0 NUMERIC:=0; v_bt INT:=0; v_bg INT:=0;
BEGIN
    SELECT ARRAY(SELECT DISTINCT d FROM unnest(COALESCE(p_dimensoes, ARRAY['faixa'])) d WHERE d IN ('faixa','convidados','destino','canal_sdr','canal_closer')) INTO v_dims;
    IF v_dims IS NULL OR array_length(v_dims,1) IS NULL THEN v_dims := ARRAY['faixa']; END IF;

    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT faixa, convidados, destino,
           _ww_norm_canal_strict(c.sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
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
       AND (p_consultor_ids IS NULL OR c.consultor_id = ANY(p_consultor_ids))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       -- AUDITORIA 2026-06-11: chips de perfil agora cortam a matriz também (antes só a manchete)
       AND (p_faixas IS NULL        OR c.faixa = ANY(p_faixas))
       AND (p_convidados IS NULL    OR c.convidados = ANY(p_convidados))
       AND (p_destinos IS NULL      OR c.destino = ANY(p_destinos))
       AND (p_status_lead IS NULL
            OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
            OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

    SELECT COUNT(*) INTO v_total FROM _pool;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE m_g) INTO v_bt, v_bg FROM _pool;
    v_p0 := CASE WHEN v_bt>0 THEN v_bg::NUMERIC/v_bt ELSE 0 END;

    SELECT json_agg(json_build_object('faixa',faixa,'convidados',convidados,'destino',destino,
             'canal_sdr',canal_sdr,'canal_closer',canal_closer,'label',label,
             'entrou',entrou,'marcou_sdr',m_sdr,'fez_sdr',f_sdr,'marcou_closer',m_cl,'fez_closer',f_cl,'ganho',ganho,'taxa_pct',taxa_pct)
           ORDER BY score DESC, entrou DESC) INTO v_rows
    FROM (
        SELECT g_faixa AS faixa, g_conv AS convidados, g_dest AS destino, g_csdr AS canal_sdr, g_cclo AS canal_closer,
               concat_ws(' · ', g_faixa, g_conv, g_dest, g_csdr, g_cclo) AS label, entrou, m_sdr, f_sdr, m_cl, f_cl, ganho,
               ROUND(100.0*ganho/NULLIF(entrou,0),1) AS taxa_pct, (ganho + 15*v_p0)/(entrou+15) AS score
        FROM (
            SELECT g_faixa, g_conv, g_dest, g_csdr, g_cclo, COUNT(*) AS entrou,
                   COUNT(*) FILTER (WHERE m_msdr OR m_fsdr OR m_mclo OR m_fclo OR m_g) AS m_sdr,
                   COUNT(*) FILTER (WHERE m_fsdr OR m_mclo OR m_fclo OR m_g) AS f_sdr,
                   COUNT(*) FILTER (WHERE m_mclo OR m_fclo OR m_g) AS m_cl,
                   COUNT(*) FILTER (WHERE m_fclo OR m_g) AS f_cl,
                   COUNT(*) FILTER (WHERE m_g) AS ganho
            FROM (
                SELECT CASE WHEN 'faixa'=ANY(v_dims) THEN COALESCE(faixa, 'Não informado') END AS g_faixa,
                       CASE WHEN 'convidados'=ANY(v_dims) THEN COALESCE(convidados, 'Não informado') END AS g_conv,
                       CASE WHEN 'destino'=ANY(v_dims) THEN COALESCE(destino, 'Não informado') END AS g_dest,
                       CASE WHEN 'canal_sdr'=ANY(v_dims) THEN COALESCE(canal_sdr, 'Não informado') END AS g_csdr,
                       CASE WHEN 'canal_closer'=ANY(v_dims) THEN COALESCE(canal_closer, 'Não informado') END AS g_cclo,
                       m_msdr,m_fsdr,m_mclo,m_fclo,m_g
                FROM _pool
            ) sel GROUP BY g_faixa, g_conv, g_dest, g_csdr, g_cclo
        ) grp ORDER BY score DESC, entrou DESC LIMIT 500
    ) r;

    DROP TABLE _pool;
    RETURN json_build_object('dimensoes',v_dims,
        'periodo',json_build_object('date_start',p_date_start,'date_end',p_date_end,'date_mode',p_date_mode),
        'total_no_periodo',v_total,'rows',COALESCE(v_rows,'[]'::JSON));
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT) TO authenticated, service_role;

-- ═══════════════ 4) ww2_overview v8: TUDO da ww_funil_casal (bate com o drill) + p_status_lead ═══════════════
-- v8 muda o UNIVERSO: KPIs, conversões e fases saem da ww_funil_casal (1 linha/CASAL) — a
-- MESMA fonte e régua do ww_drill_casais. Antes KPIs/conversões contavam por DEAL
-- (vw_ww_funnel_base): casal com 2 cadastros contava 2x, deal sem card/agendamento ficava
-- fora do "leads", e o número clicado divergia da lista aberta (print do Vitor 2026-06-12).
-- Fases ("Onde estão agora") excluem PERDIDOS (perdido é status, não posição) e contam a
-- safra do período. Alertas seguem dos cards (é onde existe card pra abrir), restritos aos
-- casais do recorte e sem perdidos/ganhos.

DROP FUNCTION IF EXISTS public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]);
DROP FUNCTION IF EXISTS public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT); -- re-aplicação

CREATE FUNCTION public.ww2_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_faixas     TEXT[] DEFAULT NULL,
    p_destinos   TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL,
    p_convidados   TEXT[] DEFAULT NULL,
    p_sdr_canal    TEXT[] DEFAULT NULL,
    p_closer_canal TEXT[] DEFAULT NULL,
    p_status_lead  TEXT DEFAULT NULL    -- 'aberto' | 'perdido' | NULL (todos)
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_window INTERVAL := p_date_end - p_date_start;
    v_prev_start TIMESTAMPTZ := p_date_start - v_window;
    v_prev_end TIMESTAMPTZ := p_date_start;
    v_kpis JSON; v_funnel JSON; v_conv JSON; v_alertas JSON;
    v_ticket NUMERIC; v_receita NUMERIC;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    -- Pool único por CASAL, SEM corte de período (os KPIs comparam com a janela anterior).
    CREATE TEMP TABLE _ww2c ON COMMIT DROP AS
    SELECT c.contact_id, c.lead_created_at,
           COALESCE(c.agendou_sdr, FALSE)    AS agendou_sdr,    c.agendou_sdr_at,
           COALESCE(c.fez_sdr, FALSE)        AS fez_sdr,        c.fez_sdr_at,
           COALESCE(c.agendou_closer, FALSE) AS agendou_closer, c.agendou_closer_at,
           COALESCE(c.fez_closer, FALSE)     AS fez_closer,     c.fez_closer_at,
           COALESCE(c.ganho, FALSE)          AS ganho,          c.ganho_at,
           COALESCE(c.is_perdido, FALSE)     AS is_perdido
      FROM ww_funil_casal c
     WHERE c.org_id = v_org_id
       AND (p_origins IS NULL    OR c.origem = ANY(p_origins))
       AND (p_faixas IS NULL     OR c.faixa = ANY(p_faixas))
       AND (p_destinos IS NULL   OR c.destino = ANY(p_destinos))
       AND (p_convidados IS NULL OR c.convidados = ANY(p_convidados))
       AND (p_tipos IS NULL      OR c.tipo = ANY(p_tipos))
       AND (p_sdr_canal IS NULL    OR _ww_norm_canal_strict(c.sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal))
       -- consultor: dono no Active OU dono do card (mesma régua do ww_drill_casais)
       AND (p_consultor_ids IS NULL OR COALESCE(
              c.consultor_id = ANY(p_consultor_ids)
              OR EXISTS (
                  SELECT 1 FROM cards cc
                   WHERE cc.external_source = 'active_campaign' AND cc.org_id = v_org_id AND cc.deleted_at IS NULL
                     AND cc.external_id IN (SELECT fcx.ac_deal_id FROM ww_ac_deal_funnel_cache fcx
                                             WHERE fcx.contact_id = c.contact_id AND fcx.is_ww)
                     AND (cc.dono_atual_id = ANY(p_consultor_ids) OR cc.sdr_owner_id = ANY(p_consultor_ids)
                          OR cc.vendas_owner_id = ANY(p_consultor_ids) OR cc.pos_owner_id = ANY(p_consultor_ids))
              ), FALSE))
       AND (p_status_lead IS NULL
            OR (p_status_lead = 'perdido' AND COALESCE(c.is_perdido, FALSE))
            OR (p_status_lead = 'aberto'  AND NOT COALESCE(c.ganho, FALSE) AND NOT COALESCE(c.is_perdido, FALSE)));

    IF p_date_mode = 'throughput' THEN
        -- O que ACONTECEU no período — marco pela própria data (régua do drill/série temporal)
        SELECT json_build_object(
            'mode', 'throughput',
            'leads',          COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end),
            'leads_prev',     COUNT(*) FILTER (WHERE lead_created_at >= v_prev_start AND lead_created_at < v_prev_end),
            'reunioes',       COUNT(*) FILTER (WHERE fez_sdr AND fez_sdr_at BETWEEN p_date_start AND p_date_end),
            'reunioes_prev',  COUNT(*) FILTER (WHERE fez_sdr AND fez_sdr_at >= v_prev_start AND fez_sdr_at < v_prev_end),
            'propostas',      COUNT(*) FILTER (WHERE agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end),
            'propostas_prev', COUNT(*) FILTER (WHERE agendou_closer AND agendou_closer_at >= v_prev_start AND agendou_closer_at < v_prev_end),
            'fechados',       COUNT(*) FILTER (WHERE ganho AND ganho_at BETWEEN p_date_start AND p_date_end),
            'fechados_prev',  COUNT(*) FILTER (WHERE ganho AND ganho_at >= v_prev_start AND ganho_at < v_prev_end)
        ) INTO v_kpis FROM _ww2c;
    ELSE
        -- Safra: marcos CUMULATIVOS (chegou na etapa OU além) — mesma régua do funil v1/drill
        SELECT ROUND(COALESCE(AVG(v), 0)::NUMERIC, 0), ROUND(COALESCE(SUM(v), 0)::NUMERIC, 0)
          INTO v_ticket, v_receita
          FROM (
            SELECT (SELECT cc.valor_final FROM cards cc
                     WHERE cc.external_source = 'active_campaign' AND cc.org_id = v_org_id AND cc.deleted_at IS NULL
                       AND cc.external_id IN (SELECT fcx.ac_deal_id FROM ww_ac_deal_funnel_cache fcx
                                               WHERE fcx.contact_id = t.contact_id AND fcx.is_ww)
                       AND cc.valor_final > 0
                     ORDER BY cc.created_at DESC LIMIT 1) AS v
              FROM _ww2c t
             WHERE t.ganho AND t.lead_created_at BETWEEN p_date_start AND p_date_end
          ) g WHERE v IS NOT NULL;
        SELECT json_build_object(
            'mode', 'cohort',
            'leads',          COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end),
            'leads_prev',     COUNT(*) FILTER (WHERE lead_created_at >= v_prev_start AND lead_created_at < v_prev_end),
            'reunioes',       COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end AND (fez_sdr OR agendou_closer OR fez_closer OR ganho)),
            'reunioes_prev',  COUNT(*) FILTER (WHERE lead_created_at >= v_prev_start AND lead_created_at < v_prev_end AND (fez_sdr OR agendou_closer OR fez_closer OR ganho)),
            'propostas',      COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end AND (agendou_closer OR fez_closer OR ganho)),
            'propostas_prev', COUNT(*) FILTER (WHERE lead_created_at >= v_prev_start AND lead_created_at < v_prev_end AND (agendou_closer OR fez_closer OR ganho)),
            'fechados',       COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end AND ganho),
            'fechados_prev',  COUNT(*) FILTER (WHERE lead_created_at >= v_prev_start AND lead_created_at < v_prev_end AND ganho),
            'ticket_medio',   v_ticket,
            'receita',        v_receita
        ) INTO v_kpis FROM _ww2c;
    END IF;

    -- FUNIL "Onde estão agora" — safra do período, SEM perdidos nas fases ativas
    -- (com filtro status='perdido', mostra onde cada perdido PAROU).
    SELECT json_agg(json_build_object(
        'phase_label', phase_label, 'phase_order', phase_order, 'phase_slug', phase_slug,
        'stage_id', stage_id, 'stage_name', stage_name, 'stage_order', stage_order,
        'stage_active', stage_active, 'is_won', is_won, 'is_lost', is_lost,
        'leads_count', leads_count
    ) ORDER BY phase_order) INTO v_funnel
    FROM (
        SELECT 'SDR (Pré-Venda)'::TEXT AS phase_label, 1 AS phase_order, 'sdr'::TEXT AS phase_slug,
               NULL::UUID AS stage_id, NULL::TEXT AS stage_name, 1 AS stage_order,
               TRUE AS stage_active, FALSE AS is_won, FALSE AS is_lost,
               COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end
                                  AND NOT ganho AND NOT (agendou_closer OR fez_closer)
                                  AND (p_status_lead = 'perdido' OR NOT is_perdido))::INT AS leads_count
          FROM _ww2c
        UNION ALL
        SELECT 'Closer', 2, 'closer', NULL::UUID, NULL::TEXT, 1, TRUE, FALSE, FALSE,
               COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end
                                  AND NOT ganho AND (agendou_closer OR fez_closer)
                                  AND (p_status_lead = 'perdido' OR NOT is_perdido))::INT
          FROM _ww2c
        UNION ALL
        SELECT 'Pós-Venda', 3, 'pos_venda', NULL::UUID, NULL::TEXT, 1, TRUE, TRUE, FALSE,
               COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end
                                  AND ganho)::INT
          FROM _ww2c
    ) sc;

    -- CONVERSÃO ENTRE FASES — segue o MODO (v7), agora por CASAL (régua do drill).
    IF p_date_mode = 'throughput' THEN
        WITH m AS (
            SELECT COUNT(*) FILTER (WHERE lead_created_at BETWEEN p_date_start AND p_date_end) AS entrou,
                   COUNT(*) FILTER (WHERE agendou_sdr AND agendou_sdr_at BETWEEN p_date_start AND p_date_end) AS marcou_sdr,
                   COUNT(*) FILTER (WHERE fez_sdr AND fez_sdr_at BETWEEN p_date_start AND p_date_end) AS fez_sdr,
                   COUNT(*) FILTER (WHERE agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end) AS marcou_closer,
                   COUNT(*) FILTER (WHERE fez_closer AND fez_closer_at BETWEEN p_date_start AND p_date_end) AS fez_closer,
                   COUNT(*) FILTER (WHERE ganho AND ganho_at BETWEEN p_date_start AND p_date_end) AS ganho
              FROM _ww2c
        ),
        passos AS (
            SELECT t.* FROM m,
            LATERAL (VALUES
                ('Entrou'::TEXT,      1, m.entrou,        NULL::NUMERIC),
                ('Marcou 1ª reunião', 2, m.marcou_sdr,    CASE WHEN m.entrou        > 0 THEN ROUND(100.0*m.marcou_sdr/m.entrou, 1) END),
                ('Fez 1ª reunião',    3, m.fez_sdr,       CASE WHEN m.marcou_sdr    > 0 THEN ROUND(100.0*m.fez_sdr/m.marcou_sdr, 1) END),
                ('Marcou closer',     4, m.marcou_closer, CASE WHEN m.fez_sdr       > 0 THEN ROUND(100.0*m.marcou_closer/m.fez_sdr, 1) END),
                ('Fez closer',        5, m.fez_closer,    CASE WHEN m.marcou_closer > 0 THEN ROUND(100.0*m.fez_closer/m.marcou_closer, 1) END),
                ('Ganhou',            6, m.ganho,         CASE WHEN m.fez_closer    > 0 THEN ROUND(100.0*m.ganho/m.fez_closer, 1) END)
            ) AS t(phase_label, phase_order, leads, taxa)
            WHERE m.entrou > 0 OR m.marcou_sdr > 0 OR m.ganho > 0
        )
        SELECT COALESCE(json_agg(json_build_object(
            'phase_label', phase_label, 'phase_order', phase_order,
            'leads', leads, 'taxa_vs_anterior', taxa
        ) ORDER BY phase_order), '[]'::JSON) INTO v_conv
        FROM passos;
    ELSE
        WITH cohort AS (
            SELECT * FROM _ww2c WHERE lead_created_at BETWEEN p_date_start AND p_date_end
        ),
        m AS (
            SELECT COUNT(*) AS entrou,
                   COUNT(*) FILTER (WHERE agendou_sdr OR fez_sdr OR agendou_closer OR fez_closer OR ganho) AS marcou_sdr,
                   COUNT(*) FILTER (WHERE fez_sdr OR agendou_closer OR fez_closer OR ganho) AS fez_sdr,
                   COUNT(*) FILTER (WHERE agendou_closer OR fez_closer OR ganho) AS marcou_closer,
                   COUNT(*) FILTER (WHERE fez_closer OR ganho) AS fez_closer,
                   COUNT(*) FILTER (WHERE ganho) AS ganho
              FROM cohort
        ),
        passos AS (
            SELECT t.* FROM m,
            LATERAL (VALUES
                ('Entrou'::TEXT,      1, m.entrou,        NULL::NUMERIC),
                ('Marcou 1ª reunião', 2, m.marcou_sdr,    CASE WHEN m.entrou        > 0 THEN ROUND(100.0*m.marcou_sdr/m.entrou, 1) END),
                ('Fez 1ª reunião',    3, m.fez_sdr,       CASE WHEN m.marcou_sdr    > 0 THEN ROUND(100.0*m.fez_sdr/m.marcou_sdr, 1) END),
                ('Marcou closer',     4, m.marcou_closer, CASE WHEN m.fez_sdr       > 0 THEN ROUND(100.0*m.marcou_closer/m.fez_sdr, 1) END),
                ('Fez closer',        5, m.fez_closer,    CASE WHEN m.marcou_closer > 0 THEN ROUND(100.0*m.fez_closer/m.marcou_closer, 1) END),
                ('Ganhou',            6, m.ganho,         CASE WHEN m.fez_closer    > 0 THEN ROUND(100.0*m.ganho/m.fez_closer, 1) END)
            ) AS t(phase_label, phase_order, leads, taxa)
            WHERE m.entrou > 0
        )
        SELECT COALESCE(json_agg(json_build_object(
            'phase_label', phase_label, 'phase_order', phase_order,
            'leads', leads, 'taxa_vs_anterior', taxa
        ) ORDER BY phase_order), '[]'::JSON) INTO v_conv
        FROM passos;
    END IF;

    -- Alertas — cards ABERTOS dos casais do recorte (sem perdidos/ganhos), parados > 7d, top 8.
    SELECT COALESCE(json_agg(json_build_object(
        'card_id', card_id, 'titulo', titulo, 'stage_name', stage_name,
        'phase_label', phase_label, 'dias_parado', dias_parado, 'valor_estimado', valor_estimado
    ) ORDER BY dias_parado DESC), '[]'::JSON) INTO v_alertas
    FROM (
        SELECT DISTINCT ON (c.id) c.id AS card_id, c.titulo,
               COALESCE(s.nome, '—') AS stage_name,
               COALESCE(ph.label, ph.name, '—') AS phase_label,
               EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at))::INT AS dias_parado,
               c.valor_estimado
          FROM _ww2c t
          JOIN ww_ac_deal_funnel_cache fc ON fc.contact_id = t.contact_id AND fc.is_ww
          JOIN cards c ON c.external_id = fc.ac_deal_id AND c.external_source = 'active_campaign'
          LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
          LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE c.org_id = v_org_id AND c.deleted_at IS NULL AND c.archived_at IS NULL
           AND NOT t.is_perdido AND NOT t.ganho
           AND (c.status_comercial IS NULL OR c.status_comercial NOT IN ('ganho','perdido'))
           AND COALESCE(ph.slug,'') NOT IN ('resolucao','pos_venda')
           AND GREATEST(c.updated_at, c.created_at) < NOW() - INTERVAL '7 days'
         ORDER BY c.id, EXTRACT(DAY FROM NOW() - GREATEST(c.updated_at, c.created_at)) DESC
    ) a;

    DROP TABLE _ww2c;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'prev_start', v_prev_start, 'prev_end', v_prev_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'kpis', v_kpis,
        'funnel', COALESCE(v_funnel, '[]'::JSON),
        'conversoes', COALESCE(v_conv, '[]'::JSON),
        'alertas', COALESCE(v_alertas, '[]'::JSON),
        'fonte_marcos', 'v8 — TUDO da ww_funil_casal (mesma régua do drill); fases sem perdidos; + p_status_lead'
    );
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.ww2_overview IS
  'Overview Weddings v8 — KPIs, conversões e fases da ww_funil_casal (1 linha/casal, mesma régua do ww_drill_casais: número clicado = lista aberta); fases excluem perdidos; + p_status_lead (aberto|perdido).';

-- ═══════════════ 5) ww_qualidade_lead + p_status_lead (status via JOIN no casal) ═══════════════
DROP FUNCTION IF EXISTS public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer, text[], text[]);
DROP FUNCTION IF EXISTS public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer, text[], text[], text); -- re-aplicação

CREATE FUNCTION public.ww_qualidade_lead(
    p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_date_mode text DEFAULT 'cohort',
    p_event_stage_id uuid DEFAULT NULL,
    p_tipos text[] DEFAULT NULL,
    p_min_amostra integer DEFAULT 3,
    p_sdr_canal text[] DEFAULT NULL,
    p_closer_canal text[] DEFAULT NULL,
    p_status_lead text DEFAULT NULL    -- 'aberto' | 'perdido' | NULL (todos)
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_total_entraram INT := 0; v_total_fecharam INT := 0;
    v_taxa_geral NUMERIC;
    v_por_faixa JSON; v_por_destino JSON; v_por_convidados JSON;
    v_of JSON; v_od JSON; v_oc JSON;
    v_por_canal_sdr JSON; v_por_canal_closer JSON;
    v_heatmap JSON; v_cruz JSON; v_evolucao JSON; v_comparacao JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 3));
    v_cob JSON;
BEGIN
    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           _ww2_norm_faixa_strict(c.faixa_raw)      AS faixa,
           _ww2_norm_conv_strict(c.convidados_raw)  AS conv_bucket,
           _ww2_norm_dest_strict(c.destino_raw)     AS destino,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo,
           _ww_norm_canal_strict(c.sdr_canal::text) AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           (c.ganho_at IS NOT NULL) AS fechou,
           c.real_orcamento_parsed AS valor_pac
    FROM ww_ac_deal_funnel_cache c
    LEFT JOIN ww_funil_casal cs ON cs.contact_id = c.contact_id
    WHERE c.is_ww
      AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
      AND CASE
        WHEN p_date_mode = 'throughput' THEN c.ganho_at BETWEEN p_date_start AND p_date_end
        ELSE COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end
      END
      -- status do CASAL (uma definição de perdido pra tudo — 20260604b)
      AND (p_status_lead IS NULL
           OR (p_status_lead = 'perdido' AND COALESCE(cs.is_perdido, FALSE))
           OR (p_status_lead = 'aberto'  AND NOT COALESCE(cs.ganho, FALSE) AND NOT COALESCE(cs.is_perdido, FALSE)));

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ql WHERE origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ql WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;
    v_taxa_geral := CASE WHEN v_total_entraram > 0 THEN 100.0 * v_total_fecharam / v_total_entraram END;

    SELECT json_build_object(
        'com_faixa', COUNT(*) FILTER (WHERE faixa IS NOT NULL),
        'com_destino', COUNT(*) FILTER (WHERE destino IS NOT NULL),
        'com_convidados', COUNT(*) FILTER (WHERE conv_bucket IS NOT NULL)
    ) INTO v_cob FROM _ww_ql;

    -- ── por_faixa (declarada strict; ordem canônica; pequenos → outros) ──
    WITH g AS (
        SELECT faixa AS cat,
               CASE faixa WHEN 'Até R$50 mil' THEN 1 WHEN 'R$50-80 mil' THEN 2 WHEN 'R$50-100 mil' THEN 2
                          WHEN 'R$80-100 mil' THEN 3 WHEN 'R$100-200 mil' THEN 4 WHEN 'R$200-500 mil' THEN 5
                          WHEN '+R$500 mil' THEN 6 WHEN 'Mais de R$500 mil' THEN 6 ELSE 99 END AS ordem,
               COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE faixa IS NOT NULL GROUP BY faixa
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY ordem, e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_faixa, v_of FROM g;

    -- ── por_destino (declarado strict) ──
    WITH g AS (
        SELECT destino AS cat, COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE destino IS NOT NULL GROUP BY destino
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_destino, v_od FROM g;

    -- ── por_convidados (declarado strict; ordem canônica) ──
    WITH g AS (
        SELECT conv_bucket AS cat,
               CASE conv_bucket WHEN 'Apenas o casal' THEN 1 WHEN 'Até 20' THEN 2 WHEN '20-50' THEN 3
                                WHEN '50-80' THEN 4 WHEN '50-100' THEN 4 WHEN '80-100' THEN 5 WHEN '+100' THEN 6 ELSE 99 END AS ordem,
               COUNT(*)::INT AS e, COUNT(*) FILTER (WHERE fechou)::INT AS f,
               AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm,
               PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q25,
               PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS q75,
               COUNT(*) FILTER (WHERE fechou AND valor_pac >= 5000)::INT AS ta
          FROM _ww_ql WHERE conv_bucket IS NOT NULL GROUP BY conv_bucket
    )
    SELECT COALESCE(json_agg(json_build_object(
               'categoria', cat, 'entraram', e, 'fecharam', f,
               'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
               'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0),
               'ticket_p25', ROUND(COALESCE(q25, 0)::NUMERIC, 0),
               'ticket_p75', ROUND(COALESCE(q75, 0)::NUMERIC, 0),
               'ticket_amostra', ta) ORDER BY ordem, e DESC) FILTER (WHERE e >= v_min), '[]'::json),
           CASE WHEN COUNT(*) FILTER (WHERE e < v_min) > 0 THEN json_build_object(
               'entraram', SUM(e) FILTER (WHERE e < v_min),
               'fecharam', SUM(f) FILTER (WHERE e < v_min),
               'categorias_agrupadas', json_agg(cat) FILTER (WHERE e < v_min)) END
      INTO v_por_convidados, v_oc FROM g;

    -- ── conversão por tipo de reunião (universo = quem FEZ a reunião) ──
    SELECT COALESCE(json_agg(json_build_object(
        'categoria', canal, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY e DESC), '[]'::json) INTO v_por_canal_sdr
    FROM (SELECT canal_sdr AS canal, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE canal_sdr IS NOT NULL GROUP BY canal_sdr) g;

    SELECT COALESCE(json_agg(json_build_object(
        'categoria', canal, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY e DESC), '[]'::json) INTO v_por_canal_closer
    FROM (SELECT canal_closer AS canal, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE canal_closer IS NOT NULL GROUP BY canal_closer) g;

    -- ── heatmap faixa × destino (era '[]' fixo) ──
    SELECT COALESCE(json_agg(json_build_object(
        'faixa', faixa, 'destino', destino, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END,
        'ticket_medio', ROUND(COALESCE(tm, 0)::NUMERIC, 0)
    )), '[]'::json) INTO v_heatmap
    FROM (SELECT faixa, destino, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f,
                 AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS tm
            FROM _ww_ql WHERE faixa IS NOT NULL AND destino IS NOT NULL
           GROUP BY faixa, destino HAVING COUNT(*) >= v_min) g;

    -- ── cruzamentos (eram NULL fixo) — {linha, coluna, entraram, fecharam, taxa_pct} ──
    SELECT json_build_object(
      'faixa_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', faixa, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT faixa, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE faixa IS NOT NULL AND origem IS NOT NULL
               GROUP BY faixa, origem HAVING COUNT(*) >= v_min) a),
      'destino_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', destino, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT destino, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE destino IS NOT NULL AND origem IS NOT NULL
               GROUP BY destino, origem HAVING COUNT(*) >= v_min) a),
      'faixa_x_tipo', (
        SELECT COALESCE(json_agg(json_build_object('linha', faixa, 'coluna', tipo, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT faixa, tipo, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE faixa IS NOT NULL AND tipo IS NOT NULL
               GROUP BY faixa, tipo HAVING COUNT(*) >= v_min) a),
      'convidados_x_origem', (
        SELECT COALESCE(json_agg(json_build_object('linha', conv_bucket, 'coluna', origem, 'entraram', e, 'fecharam', f,
            'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END)), '[]'::json)
        FROM (SELECT conv_bucket, origem, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
                FROM _ww_ql WHERE conv_bucket IS NOT NULL AND origem IS NOT NULL
               GROUP BY conv_bucket, origem HAVING COUNT(*) >= v_min) a)
    ) INTO v_cruz;

    -- ── evolução mensal por faixa (era NULL fixo) ──
    SELECT COALESCE(json_agg(json_build_object(
        'mes', mes, 'categoria', faixa, 'entraram', e, 'fecharam', f,
        'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    ) ORDER BY mes), '[]'::json) INTO v_evolucao
    FROM (SELECT TO_CHAR(DATE_TRUNC('month', entrada_at), 'YYYY-MM') AS mes, faixa,
                 COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_ql WHERE faixa IS NOT NULL
           GROUP BY DATE_TRUNC('month', entrada_at), faixa) g;

    -- ── quem ENTRA × quem FECHA (era NULL fixo) — % de entrada vs % dos fechamentos + lift ──
    WITH dims AS (
        SELECT 'faixa'::TEXT AS dim, faixa AS cat, fechou FROM _ww_ql WHERE faixa IS NOT NULL
        UNION ALL SELECT 'destino', destino, fechou FROM _ww_ql WHERE destino IS NOT NULL
        UNION ALL SELECT 'convidados', conv_bucket, fechou FROM _ww_ql WHERE conv_bucket IS NOT NULL
        UNION ALL SELECT 'origem', origem, fechou FROM _ww_ql WHERE origem IS NOT NULL
        UNION ALL SELECT 'tipo', tipo, fechou FROM _ww_ql WHERE tipo IS NOT NULL
    ),
    tot AS (SELECT dim, COUNT(*) AS t_e, COUNT(*) FILTER (WHERE fechou) AS t_f FROM dims GROUP BY dim),
    cat AS (SELECT dim, cat, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f FROM dims GROUP BY dim, cat),
    linhas AS (
        SELECT c.dim, c.cat, c.e, c.f,
               CASE WHEN t.t_e > 0 THEN ROUND(100.0 * c.e / t.t_e, 1) END AS e_pct,
               CASE WHEN t.t_f > 0 THEN ROUND(100.0 * c.f / t.t_f, 1) END AS f_pct
          FROM cat c JOIN tot t ON t.dim = c.dim
         WHERE c.e >= v_min
    )
    SELECT COALESCE(json_agg(json_build_object('dimensao', dim, 'dados', dados)), '[]'::json) INTO v_comparacao
    FROM (
        SELECT dim, json_agg(json_build_object(
            'categoria', cat,
            'entrada_qtd', e, 'entrada_pct', e_pct,
            'fechou_qtd', f, 'fechou_pct', f_pct,
            'lift', CASE WHEN e_pct IS NULL OR e_pct = 0 OR f_pct IS NULL THEN NULL
                         ELSE ROUND((f_pct / e_pct)::numeric, 2) END
        ) ORDER BY e DESC) AS dados
          FROM linhas GROUP BY dim
    ) g;

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'min_amostra', v_min,
        'total_entraram', v_total_entraram, 'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
        'cobertura', v_cob,
        'por_faixa', v_por_faixa, 'por_destino', v_por_destino, 'por_convidados', v_por_convidados,
        'outros_amostra_pequena', json_build_object('faixa', v_of, 'destino', v_od, 'convidados', v_oc),
        'por_canal_sdr', v_por_canal_sdr, 'por_canal_closer', v_por_canal_closer,
        'heatmap_faixa_destino', v_heatmap,
        'cruzamentos', v_cruz,
        'evolucao_mensal_por_faixa', v_evolucao,
        'comparacao_entrada_vs_fechamento', v_comparacao,
        'fonte_marcos', 'ww_ac_deal_funnel_cache (universo AC; dimensões DECLARADAS strict; tickets do orçamento real dos fechados)'
    );
END $$;

REVOKE EXECUTE ON FUNCTION public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer, text[], text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer, text[], text[], text) TO authenticated, service_role;

-- ═══════════════ 6) ww_drill_casais v4: + p_status_lead; fases excluem perdidos (régua do overview v8) ═══════════════
DROP FUNCTION IF EXISTS public.ww_drill_casais(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], INT, INT);
DROP FUNCTION IF EXISTS public.ww_drill_casais(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], INT, INT); -- re-aplicação

CREATE FUNCTION public.ww_drill_casais(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    -- marco do funil / fase atual / status
    p_marco      TEXT DEFAULT NULL,  -- entrou|marcou_sdr|fez_sdr|marcou_closer|fez_closer|ganho|perdido|aberto
    p_phase_slug TEXT DEFAULT NULL,  -- sdr|closer|pos_venda (posição atual)
    -- célula (valores únicos — clique num dado específico)
    p_faixa        TEXT DEFAULT NULL,
    p_destino      TEXT DEFAULT NULL,
    p_convidados   TEXT DEFAULT NULL,
    p_origem       TEXT DEFAULT NULL,
    p_tipo         TEXT DEFAULT NULL,
    p_campaign     TEXT DEFAULT NULL,
    p_medium       TEXT DEFAULT NULL,
    p_motivo_perda TEXT DEFAULT NULL,
    p_motivo_role  TEXT DEFAULT NULL, -- 'sdr' | 'closer' | NULL (qualquer)
    p_consultor_id UUID DEFAULT NULL,
    p_status_lead  TEXT DEFAULT NULL, -- 'aberto' | 'perdido' | NULL (todos)
    -- barra (arrays — filtros ativos da aba; convivem com os singulares via AND)
    p_origins         TEXT[] DEFAULT NULL,
    p_faixas          TEXT[] DEFAULT NULL,
    p_destinos        TEXT[] DEFAULT NULL,
    p_convidados_list TEXT[] DEFAULT NULL,
    p_tipos           TEXT[] DEFAULT NULL,
    p_consultor_ids   UUID[] DEFAULT NULL,
    p_sdr_canal       TEXT[] DEFAULT NULL,
    p_closer_canal    TEXT[] DEFAULT NULL,
    p_limit  INT DEFAULT 50,
    p_offset INT DEFAULT 0
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_total INT;
    v_rows JSON;
BEGIN
    CREATE TEMP TABLE _ww_dc ON COMMIT DROP AS
    SELECT c.contact_id, c.deal_title, c.tipo, c.lead_created_at,
           c.faixa, c.convidados, c.destino, c.origem, c.consultor_id, c.consultor_nome,
           _ww_norm_canal_strict(c.sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           c.agendou_sdr, c.agendou_sdr_at, c.fez_sdr, c.fez_sdr_at,
           c.agendou_closer, c.agendou_closer_at, c.fez_closer, c.fez_closer_at,
           c.ganho, c.ganho_at, c.is_perdido
      FROM ww_funil_casal c
     WHERE c.org_id = v_org_id
       AND (CASE
              -- throughput COM marco: a janela é do próprio marco (abaixo) — não corta aqui
              WHEN p_date_mode = 'throughput' AND p_marco IS NOT NULL THEN TRUE
              WHEN p_date_mode = 'throughput' THEN
                   (c.lead_created_at   BETWEEN p_date_start AND p_date_end)
                OR (c.agendou_sdr_at    BETWEEN p_date_start AND p_date_end)
                OR (c.agendou_closer_at BETWEEN p_date_start AND p_date_end)
                OR (c.ganho_at          BETWEEN p_date_start AND p_date_end)
              ELSE (c.lead_created_at BETWEEN p_date_start AND p_date_end)
            END);

    -- ── Marco do funil ──
    IF p_marco IS NOT NULL THEN
        IF p_date_mode = 'throughput' THEN
            -- o que ACONTECEU no período: marco pela própria data (régua da ww_serie_temporal).
            -- COALESCE(..., FALSE): *_at NULL não pode escapar do corte (3-valued logic).
            CASE p_marco
                WHEN 'entrou'        THEN DELETE FROM _ww_dc WHERE NOT COALESCE(lead_created_at BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'marcou_sdr'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_sdr    AND agendou_sdr_at    BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'fez_sdr'       THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_sdr        AND fez_sdr_at        BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'marcou_closer' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'fez_closer'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_closer     AND fez_closer_at     BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'ganho'         THEN DELETE FROM _ww_dc WHERE NOT COALESCE(ganho          AND ganho_at          BETWEEN p_date_start AND p_date_end, FALSE);
                WHEN 'perdido'       THEN DELETE FROM _ww_dc WHERE NOT (COALESCE(is_perdido, FALSE) AND COALESCE(
                                             (lead_created_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_sdr_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_closer_at BETWEEN p_date_start AND p_date_end), FALSE));
                WHEN 'aberto'        THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR COALESCE(is_perdido, FALSE) OR NOT COALESCE(
                                             (lead_created_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_sdr_at BETWEEN p_date_start AND p_date_end)
                                          OR (agendou_closer_at BETWEEN p_date_start AND p_date_end), FALSE);
                ELSE RAISE EXCEPTION 'p_marco inválido: %', p_marco;
            END CASE;
        ELSE
            -- safra: marcos CUMULATIVOS (mesma régua do ww_funil_conversao_v1)
            CASE p_marco
                WHEN 'entrou'        THEN NULL; -- pool já é a safra
                WHEN 'marcou_sdr'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_sdr OR fez_sdr OR agendou_closer OR fez_closer OR ganho, FALSE);
                WHEN 'fez_sdr'       THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_sdr OR agendou_closer OR fez_closer OR ganho, FALSE);
                WHEN 'marcou_closer' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(agendou_closer OR fez_closer OR ganho, FALSE);
                WHEN 'fez_closer'    THEN DELETE FROM _ww_dc WHERE NOT COALESCE(fez_closer OR ganho, FALSE);
                WHEN 'ganho'         THEN DELETE FROM _ww_dc WHERE NOT COALESCE(ganho, FALSE);
                WHEN 'perdido'       THEN DELETE FROM _ww_dc WHERE NOT COALESCE(is_perdido, FALSE);
                WHEN 'aberto'        THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR COALESCE(is_perdido, FALSE);
                ELSE RAISE EXCEPTION 'p_marco inválido: %', p_marco;
            END CASE;
        END IF;
    END IF;

    -- ── Status do lead (filtro da barra) ──
    IF p_status_lead = 'perdido' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(is_perdido, FALSE);
    ELSIF p_status_lead = 'aberto' THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR COALESCE(is_perdido, FALSE);
    END IF;

    -- ── Fase atual (régua do funil "Onde estão agora" do ww2_overview v8) ──
    -- v4: perdido NÃO está em fase ativa (sai do sdr/closer), a menos que o filtro
    -- de status seja exatamente 'perdido' (aí a fase mostra onde ele parou).
    IF p_phase_slug IS NOT NULL THEN
        CASE p_phase_slug
            WHEN 'sdr'       THEN DELETE FROM _ww_dc WHERE COALESCE(ganho OR agendou_closer OR fez_closer, FALSE)
                                      OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'closer'    THEN DELETE FROM _ww_dc WHERE COALESCE(ganho, FALSE) OR NOT COALESCE(agendou_closer OR fez_closer, FALSE)
                                      OR (COALESCE(is_perdido, FALSE) AND COALESCE(p_status_lead, '') IS DISTINCT FROM 'perdido');
            WHEN 'pos_venda' THEN DELETE FROM _ww_dc WHERE NOT COALESCE(ganho, FALSE);
            ELSE NULL; -- slug desconhecido: não corta (fase de card CRM não existe no universo Active)
        END CASE;
    END IF;

    -- ── Célula (singulares). 'Não informado' = sem valor declarado (heatmaps usam COALESCE) ──
    IF p_faixa IS NOT NULL THEN
        IF p_faixa = 'Não informado' THEN DELETE FROM _ww_dc WHERE faixa IS NOT NULL;
        ELSE DELETE FROM _ww_dc WHERE faixa IS DISTINCT FROM p_faixa; END IF;
    END IF;
    IF p_destino IS NOT NULL THEN
        IF p_destino = 'Não informado' THEN DELETE FROM _ww_dc WHERE destino IS NOT NULL;
        ELSE DELETE FROM _ww_dc WHERE destino IS DISTINCT FROM p_destino; END IF;
    END IF;
    IF p_convidados IS NOT NULL THEN
        IF p_convidados = 'Não informado' THEN DELETE FROM _ww_dc WHERE convidados IS NOT NULL;
        ELSE DELETE FROM _ww_dc WHERE convidados IS DISTINCT FROM p_convidados; END IF;
    END IF;
    IF p_origem IS NOT NULL THEN DELETE FROM _ww_dc WHERE origem IS DISTINCT FROM p_origem; END IF;
    IF p_tipo IS NOT NULL THEN DELETE FROM _ww_dc WHERE tipo IS DISTINCT FROM p_tipo; END IF;
    -- consultor: dono no Active OU dono do card (Equipe conta por dono de card)
    IF p_consultor_id IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT COALESCE(
            t.consultor_id = p_consultor_id
            OR EXISTS (
                SELECT 1 FROM cards c2
                 WHERE c2.external_source = 'active_campaign' AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
                   AND c2.external_id IN (SELECT fc5.ac_deal_id FROM ww_ac_deal_funnel_cache fc5
                                           WHERE fc5.contact_id = t.contact_id AND fc5.is_ww)
                   AND (c2.dono_atual_id = p_consultor_id OR c2.sdr_owner_id = p_consultor_id
                        OR c2.vendas_owner_id = p_consultor_id OR c2.pos_owner_id = p_consultor_id)
            ), FALSE);
    END IF;

    -- campanha / medium: qualquer deal do casal no cache (server-side; antes era client-side)
    IF p_campaign IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM ww_ac_deal_funnel_cache fc
             WHERE fc.contact_id = t.contact_id AND fc.is_ww AND NULLIF(fc.utm_campaign, '') = p_campaign);
    END IF;
    IF p_medium IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM ww_ac_deal_funnel_cache fc
             WHERE fc.contact_id = t.contact_id AND fc.is_ww AND NULLIF(fc.utm_medium, '') = p_medium);
    END IF;

    -- motivo de perda (raw do Active, mesma fonte do ww2_loss_reasons); role recorta SDR/Closer
    IF p_motivo_perda IS NOT NULL OR p_motivo_role IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT EXISTS (
            SELECT 1 FROM ww_ac_deal_funnel_cache fc
             WHERE fc.contact_id = t.contact_id AND fc.is_ww
               AND (
                    (COALESCE(p_motivo_role, 'sdr') = 'sdr'
                     AND fc.motivo_perda_sdr_raw IS NOT NULL
                     AND (p_motivo_perda IS NULL OR fc.motivo_perda_sdr_raw = p_motivo_perda))
                 OR (COALESCE(p_motivo_role, 'closer') = 'closer'
                     AND fc.motivo_perda_closer_raw IS NOT NULL
                     AND (p_motivo_perda IS NULL OR fc.motivo_perda_closer_raw = p_motivo_perda))
               ));
    END IF;

    -- ── Barra (arrays) ──
    IF p_origins IS NOT NULL THEN DELETE FROM _ww_dc WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww_dc WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww_dc WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados_list IS NOT NULL THEN DELETE FROM _ww_dc WHERE convidados IS NULL OR convidados != ALL(p_convidados_list); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_dc WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww_dc t WHERE NOT COALESCE(
            t.consultor_id = ANY(p_consultor_ids)
            OR EXISTS (
                SELECT 1 FROM cards c2
                 WHERE c2.external_source = 'active_campaign' AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
                   AND c2.external_id IN (SELECT fc6.ac_deal_id FROM ww_ac_deal_funnel_cache fc6
                                           WHERE fc6.contact_id = t.contact_id AND fc6.is_ww)
                   AND (c2.dono_atual_id = ANY(p_consultor_ids) OR c2.sdr_owner_id = ANY(p_consultor_ids)
                        OR c2.vendas_owner_id = ANY(p_consultor_ids) OR c2.pos_owner_id = ANY(p_consultor_ids))
            ), FALSE);
    END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_dc WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_dc WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT COUNT(*) INTO v_total FROM _ww_dc;

    SELECT json_agg(row_to_json(t)) INTO v_rows FROM (
        SELECT d.contact_id, d.deal_title, d.tipo, d.lead_created_at,
               d.faixa, d.convidados, d.destino, d.origem, d.consultor_nome,
               d.canal_sdr, d.canal_closer,
               d.agendou_sdr_at, d.fez_sdr_at, d.agendou_closer_at, d.fez_closer_at, d.ganho_at,
               d.ganho, d.is_perdido,
               fc.ac_deal_id,
               NULLIF(fc.utm_campaign, '') AS campaign,
               NULLIF(fc.utm_medium, '')   AS medium,
               mot.motivo AS motivo_perda,
               cd.card_id, cd.valor_final, cd.contato_nome, cd.contato_telefone
          FROM _ww_dc d
          -- deal mais recente do casal: link "abrir no Active" + utm de exibição
          LEFT JOIN LATERAL (
              SELECT fc2.ac_deal_id, fc2.utm_campaign, fc2.utm_medium
                FROM ww_ac_deal_funnel_cache fc2
               WHERE fc2.contact_id = d.contact_id AND fc2.is_ww
               ORDER BY fc2.deal_created_at DESC NULLS LAST
               LIMIT 1
          ) fc ON TRUE
          -- motivo de perda mais recente registrado (exibição)
          LEFT JOIN LATERAL (
              SELECT COALESCE(fc3.motivo_perda_closer_raw, fc3.motivo_perda_sdr_raw) AS motivo
                FROM ww_ac_deal_funnel_cache fc3
               WHERE fc3.contact_id = d.contact_id AND fc3.is_ww
                 AND (fc3.motivo_perda_closer_raw IS NOT NULL OR fc3.motivo_perda_sdr_raw IS NOT NULL)
               ORDER BY fc3.deal_created_at DESC NULLS LAST
               LIMIT 1
          ) mot ON TRUE
          -- card do CRM (navegação /cards) + valor + contato — quando existir
          LEFT JOIN LATERAL (
              SELECT c2.id AS card_id, c2.valor_final, co.nome AS contato_nome, co.telefone AS contato_telefone
                FROM cards c2
                LEFT JOIN contatos co ON co.id = c2.pessoa_principal_id
               WHERE c2.external_source = 'active_campaign'
                 AND c2.org_id = v_org_id AND c2.deleted_at IS NULL
                 AND c2.external_id IN (SELECT fc4.ac_deal_id FROM ww_ac_deal_funnel_cache fc4
                                         WHERE fc4.contact_id = d.contact_id AND fc4.is_ww)
               ORDER BY c2.created_at DESC
               LIMIT 1
          ) cd ON TRUE
         ORDER BY CASE p_marco
                    WHEN 'ganho'         THEN d.ganho_at
                    WHEN 'fez_closer'    THEN d.fez_closer_at
                    WHEN 'marcou_closer' THEN d.agendou_closer_at
                    WHEN 'fez_sdr'       THEN d.fez_sdr_at
                    WHEN 'marcou_sdr'    THEN d.agendou_sdr_at
                    ELSE d.lead_created_at
                  END DESC NULLS LAST
         LIMIT p_limit OFFSET p_offset
    ) t;

    DROP TABLE _ww_dc;
    RETURN json_build_object('total', v_total, 'limit', p_limit, 'offset', p_offset, 'rows', COALESCE(v_rows, '[]'::JSON));
END $function$;

REVOKE EXECUTE ON FUNCTION public.ww_drill_casais(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_drill_casais(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], INT, INT) TO authenticated, service_role;

COMMENT ON FUNCTION public.ww_drill_casais IS
  'Drill-down Weddings sobre o universo ACTIVE (ww_funil_casal): lista os casais por trás de qualquer agregado, com marcos cumulativos (régua do ww_funil_conversao_v1), throughput por data do marco (régua da ww_serie_temporal), filtros de célula + barra, campanha/medium/motivo server-side e ac_deal_id em toda linha. v4 (20260612a — p_status_lead aberto|perdido; fases sem perdidos, régua do overview v8).';
