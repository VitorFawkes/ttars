-- 20260610c — Analytics Weddings: filtros por aba HONESTOS
--
-- Pedido do Vitor: filtros por aba que façam sentido pra cada uma. Auditoria achou
-- filtros que MENTEM (aparecem na barra mas o banco ignora em parte da tela):
--
-- 1) ww_serie_temporal + p_tipos — o corte DW×Elopement passa a valer no gráfico
--    "ao longo do tempo" da Visão Geral (antes o filtro Tipo não mudava esse gráfico).
-- 2) ww_drift_combos + p_origins — o filtro de origem passa a valer nos heatmaps
--    de Entrada×Realidade (antes só a metade de cima da aba respeitava origem).
-- 3) ww2_loss_reasons —
--    a) faixa passa do orçamento REAL (_ww_ac_faixa_from_valor(real_orcamento_parsed),
--       cobertura ~30 casais) para a faixa DECLARADA no site
--       (_ww2_norm_faixa_strict(faixa_raw), ~89%) — MESMO espaço de rótulos das opções
--       do filtro (antes o filtro de faixa em Perdas zerava silencioso: rótulo nunca casava);
--    b) p_destinos (já existia na assinatura) passa a ser respeitado de fato;
--    c) + p_sdr_canal — tipo de reunião (Vídeo/WhatsApp/Telefone/Presencial) em Perdas.
--
-- Bases vivas conferidas via pg_get_functiondef DIRETO NA PRODUÇÃO em 2026-06-10
-- (TOP-5 #5; arquivos-fonte: serie 20260603d, combos 20260603a, loss 20260530c).
-- Assinaturas mudam (param novo no fim) → DROP + CREATE pra não criar overload.
-- Grants no padrão 20260610a: authenticated + service_role, NUNCA anon/PUBLIC.

-- ═══════════════ 1) ww_serie_temporal + p_tipos ═══════════════
DROP FUNCTION IF EXISTS public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]);

CREATE OR REPLACE FUNCTION public.ww_serie_temporal(
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
    p_tipos             TEXT[] DEFAULT NULL
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
       AND (p_convidados IS NULL    OR c.convidados = ANY(p_convidados));

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

REVOKE EXECUTE ON FUNCTION public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[]) TO authenticated, service_role;

-- ═══════════════ 2) ww_drift_combos + p_origins ═══════════════
DROP FUNCTION IF EXISTS public.ww_drift_combos(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[]);

CREATE OR REPLACE FUNCTION public.ww_drift_combos(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_date_mode  TEXT DEFAULT 'cohort',
    p_tipos      TEXT[] DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total_leads INT; v_total_fechados INT;
    v_top_entrada JSON;
    v_combos_fechados JSON;
    v_matriz_faixa_conv JSON;
    v_matriz_faixa_destino JSON;
    v_matriz_destino_conv JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    -- Conversão é SEMPRE por safra: universo = quem ENTROU no período (data_entrada).
    CREATE TEMP TABLE _ww_dc ON COMMIT DROP AS
    SELECT v.faixa   AS faixa_e,
           v.destino AS dest_e,
           v.convidados AS conv_e,
           COALESCE(v.ganho, FALSE) AS fechou,
           v.ganho_at
      FROM vw_ww_funnel_base v
     WHERE v.data_entrada >= p_date_start AND v.data_entrada <= p_date_end
       AND (p_tipos IS NULL   OR v.tipo = ANY(p_tipos))
       AND (p_origins IS NULL OR v.origem = ANY(p_origins));

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_leads, v_total_fechados FROM _ww_dc;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa_e, 'destino', dest_e, 'convidados', conv_e, 'qtd', qtd,
      'pct', CASE WHEN v_total_leads > 0 THEN ROUND(100.0 * qtd / v_total_leads, 1) END
    ) ORDER BY qtd DESC), '[]'::JSON) INTO v_top_entrada
    FROM (
      SELECT faixa_e, dest_e, conv_e, COUNT(*) AS qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, dest_e, conv_e ORDER BY COUNT(*) DESC LIMIT 10
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'faixa', faixa_e, 'destino', dest_e, 'convidados', conv_e,
      'fechou', fechou_qtd, 'entrou', entrou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    ) ORDER BY fechou_qtd DESC), '[]'::JSON) INTO v_combos_fechados
    FROM (
      SELECT faixa_e, dest_e, conv_e,
             COUNT(*) FILTER (WHERE fechou) AS fechou_qtd,
             COUNT(*) AS entrou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, dest_e, conv_e
      HAVING COUNT(*) FILTER (WHERE fechou) > 0
       ORDER BY COUNT(*) FILTER (WHERE fechou) DESC LIMIT 10
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', faixa_e, 'y', conv_e, 'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_faixa_conv
    FROM (
      SELECT faixa_e, conv_e, COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND conv_e IS NOT NULL
       GROUP BY faixa_e, conv_e
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', faixa_e, 'y', dest_e, 'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_faixa_destino
    FROM (
      SELECT faixa_e, dest_e, COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE faixa_e IS NOT NULL AND dest_e IS NOT NULL
       GROUP BY faixa_e, dest_e
    ) g;

    SELECT COALESCE(json_agg(json_build_object(
      'x', conv_e, 'y', dest_e, 'entrou', entrou_qtd, 'fechou', fechou_qtd,
      'taxa_pct', CASE WHEN entrou_qtd > 0 THEN ROUND(100.0 * fechou_qtd / entrou_qtd, 1) END
    )), '[]'::JSON) INTO v_matriz_destino_conv
    FROM (
      SELECT conv_e, dest_e, COUNT(*) AS entrou_qtd, COUNT(*) FILTER (WHERE fechou) AS fechou_qtd
        FROM _ww_dc WHERE conv_e IS NOT NULL AND dest_e IS NOT NULL
       GROUP BY conv_e, dest_e
    ) g;

    DROP TABLE _ww_dc;
    RETURN json_build_object(
      'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', 'cohort',
      'total_leads', v_total_leads, 'total_fechados', v_total_fechados,
      'top_combos_entrada', v_top_entrada,
      'top_combos_fechados', v_combos_fechados,
      'matriz_faixa_conv', v_matriz_faixa_conv,
      'matriz_faixa_destino', v_matriz_faixa_destino,
      'matriz_destino_conv', v_matriz_destino_conv,
      'fonte_marcos', 'vw_ww_funnel_base (cache AC) — conversão sempre por safra + filtros tipo/origem'
    );
END $function$;

REVOKE EXECUTE ON FUNCTION public.ww_drift_combos(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_drift_combos(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[], TEXT[]) TO authenticated, service_role;

-- ═══════════════ 3) ww2_loss_reasons: faixa declarada + destino + canal ═══════════════
DROP FUNCTION IF EXISTS public.ww2_loss_reasons(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]);

CREATE OR REPLACE FUNCTION public.ww2_loss_reasons(
    p_date_start    TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end      TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode     TEXT DEFAULT 'cohort',
    p_org_id        UUID DEFAULT NULL,
    p_origins       TEXT[] DEFAULT NULL,
    p_faixas        TEXT[] DEFAULT NULL,
    p_destinos      TEXT[] DEFAULT NULL,
    p_tipos         TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL,
    p_sdr_canal     TEXT[] DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_sdr JSON; v_closer JSON; v_motivo_faixa JSON; v_tendencia JSON;
BEGIN
    CREATE TEMP TABLE _ww2_l ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.motivo_perda_sdr_raw AS motivo_sdr,
           c.motivo_perda_closer_raw AS motivo_closer,
           -- faixa DECLARADA no site (cobertura ~89%), mesmo espaço de rótulos do filtro.
           -- Antes: _ww_ac_faixa_from_valor(real_orcamento_parsed) (~30 casais) → filtro zerava.
           _ww2_norm_faixa_strict(c.faixa_raw) AS faixa,
           _ww2_norm_dest_strict(c.destino_raw) AS destino,
           -- sdr_canal no cache é TEXT[] → ::TEXT vira '{Vídeo}', formato que o normalizador já trata
           _ww_norm_canal_strict(c.sdr_canal::TEXT) AS canal_sdr,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo
      FROM ww_ac_deal_funnel_cache c
     WHERE c.is_ww
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end;

    IF p_origins   IS NOT NULL THEN DELETE FROM _ww2_l WHERE origem != ALL(p_origins); END IF;
    IF p_faixas    IS NOT NULL THEN DELETE FROM _ww2_l WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos  IS NOT NULL THEN DELETE FROM _ww2_l WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_tipos     IS NOT NULL THEN DELETE FROM _ww2_l WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww2_l WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;

    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_sdr
    FROM (SELECT motivo_sdr AS motivo, COUNT(*) AS qtd FROM _ww2_l WHERE motivo_sdr IS NOT NULL GROUP BY motivo_sdr ORDER BY COUNT(*) DESC LIMIT 12) x;

    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_closer
    FROM (SELECT motivo_closer AS motivo, COUNT(*) AS qtd FROM _ww2_l WHERE motivo_closer IS NOT NULL GROUP BY motivo_closer ORDER BY COUNT(*) DESC LIMIT 12) x;

    SELECT json_agg(json_build_object('motivo', motivo, 'faixa', faixa, 'qtd', qtd)) INTO v_motivo_faixa
    FROM (SELECT motivo_closer AS motivo, faixa, COUNT(*) AS qtd
          FROM _ww2_l WHERE motivo_closer IS NOT NULL AND faixa IS NOT NULL
          GROUP BY motivo_closer, faixa ORDER BY COUNT(*) DESC LIMIT 40) x;

    WITH top_motivos AS (
        SELECT motivo_closer AS motivo FROM _ww2_l WHERE motivo_closer IS NOT NULL
        GROUP BY motivo_closer ORDER BY COUNT(*) DESC LIMIT 5
    )
    SELECT json_agg(json_build_object('mes', mes, 'motivo', motivo, 'qtd', qtd) ORDER BY mes, qtd DESC) INTO v_tendencia
    FROM (SELECT TO_CHAR(DATE_TRUNC('month', l.entrada_at), 'YYYY-MM') AS mes,
                 l.motivo_closer AS motivo, COUNT(*) AS qtd
          FROM _ww2_l l
         WHERE l.motivo_closer IN (SELECT motivo FROM top_motivos)
         GROUP BY DATE_TRUNC('month', l.entrada_at), l.motivo_closer) x;

    DROP TABLE _ww2_l;
    RETURN json_build_object(
        'motivos_sdr', COALESCE(v_sdr, '[]'::JSON),
        'motivos_closer', COALESCE(v_closer, '[]'::JSON),
        'motivo_faixa', COALESCE(v_motivo_faixa, '[]'::JSON),
        'tendencia', COALESCE(v_tendencia, '[]'::JSON),
        'fonte', 'ww_ac_deal_funnel_cache (universo AC + faixa/destino declarados strict + canal)'
    );
END $function$;

REVOKE EXECUTE ON FUNCTION public.ww2_loss_reasons(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww2_loss_reasons(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[]) TO authenticated, service_role;
