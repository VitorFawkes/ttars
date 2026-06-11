-- 20260611a — Analytics Weddings: tipo de reunião (canal SDR/Closer) em TODAS as abas
--             + breakdowns novos pra análise de cenários (Diretor de Vendas)
--
-- Pedido do Vitor (2026-06-11): todas as abas com filtro de tipo de reunião feita pelo
-- SDR e pelo Closer, + mais análises visuais/filtros inteligentes por aba.
--
-- ⚠️ SUPERSEDE a 20260610c_ww_filtros_por_aba.sql (aplicada SÓ no staging, nunca promovida;
--    arquivo deletado do disco — vive no git em 901035cb). Este arquivo CONTÉM todas as
--    mudanças dela (serie_temporal+p_tipos; drift_combos+p_origins; loss_reasons faixa
--    declarada+destinos+canal) e adiciona por cima. Promover SÓ este arquivo deixa prod
--    igual ao staging.
--
-- O que muda (bases vivas conferidas via pg_get_functiondef DIRETO NA PRODUÇÃO em
-- 2026-06-11 — TOP-5 #5; staging tem as versões 20260610c das 3 primeiras):
--
--   1) ww_serie_temporal      + p_sdr_canal/p_closer_canal      (Visão geral: gráfico tempo)
--   2) ww_drift_combos        + p_sdr_canal/p_closer_canal      (Entrada×Realidade: heatmaps)
--   3) ww2_loss_reasons       + p_closer_canal/p_convidados + p_consultor_ids passa a VALER
--                             + saída motivo_canal (SDR) e motivo_canal_closer  (Perdas)
--   4) ww_qualidade_lead      + p_closer_canal + saídas por_canal_sdr/por_canal_closer
--                             ("conversão por tipo de reunião")               (Qualidade)
--   5) ww2_overview           + p_convidados/p_sdr_canal/p_closer_canal       (Visão geral)
--   6) ww2_marketing          + p_sdr_canal/p_closer_canal                    (Marketing)
--   7) ww_marketing_qualidade + p_sdr_canal/p_closer_canal + saída origem_x_faixa
--                             (faixa DECLARADA strict — qual origem traz qual bolso)
--   8) ww_v2_drift_venda      + p_sdr_canal/p_closer_canal                    (Entrada×Realidade)
--   9) ww_funil_conversao_v1  + p_sdr_canal/p_closer_canal (filtro de contexto, como origem)
--  10) ww_funil_ranking_combo + p_sdr_canal/p_closer_canal + dimensões canal_sdr/canal_closer
--                             (FunilMatriz "Ver por tipo de reunião")    (Funil comparado)
--  11) ww_v2_lead_ideal       + canal_closer como dimensão de comparação e eixo de cruzamento
--                             (assinatura NÃO muda — CREATE OR REPLACE)        (Lead ideal)
--
-- Semântica do canal: _ww_norm_canal_strict (20260608a) → Vídeo/WhatsApp/Telefone/Presencial;
--   "não teve"/vazio → NULL. Filtrar por canal = só casais que FIZERAM a reunião por aquele
--   canal (quem não fez reunião sai do recorte). Fontes: ww_funil_casal.sdr_canal TEXT cru
--   '{Vídeo}' / closer_canal TEXT; cache+view sdr_canal TEXT[] (precisa ::TEXT) / closer_canal TEXT.
--   Cobertura closer_canal: fraca em 2025 (campo criado nov/2025), boa em 2026 (168 casais).
--
-- Assinaturas mudam (params novos no fim) → DROP + CREATE pra não criar overload.
-- DROPs cobrem a assinatura de PROD e a de STAGING (20260610c) onde divergem.
-- Grants: authenticated + service_role; REVOKE PUBLIC/anon (padrão pós-1ce6765c).

-- ═══════════════ 0) Limpeza de sobrecargas ancestrais (staging tinha resíduos; IF EXISTS = inócuo em prod) ═══════════════
-- Sem isso, chamada RPC sem os params opcionais casa com DUAS assinaturas → PGRST203 (ambiguidade).
DROP FUNCTION IF EXISTS public.ww_drift_combos(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT);
DROP FUNCTION IF EXISTS public.ww_marketing_qualidade(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], INTEGER);
DROP FUNCTION IF EXISTS public.ww_v2_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER);

-- ═══════════════ 1) ww_serie_temporal + canal ═══════════════
DROP FUNCTION IF EXISTS public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]);          -- prod
DROP FUNCTION IF EXISTS public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[]); -- staging 20260610c

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
    p_closer_canal      TEXT[] DEFAULT NULL
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
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal));

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

REVOKE EXECUTE ON FUNCTION public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]) TO authenticated, service_role;

-- ═══════════════ 2) ww_drift_combos + canal ═══════════════
DROP FUNCTION IF EXISTS public.ww_drift_combos(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[]);         -- prod
DROP FUNCTION IF EXISTS public.ww_drift_combos(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[], TEXT[]); -- staging 20260610c

CREATE FUNCTION public.ww_drift_combos(
    p_date_start    TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end      TIMESTAMPTZ DEFAULT NOW(),
    p_org_id        UUID DEFAULT NULL,
    p_date_mode     TEXT DEFAULT 'cohort',
    p_tipos         TEXT[] DEFAULT NULL,
    p_origins       TEXT[] DEFAULT NULL,
    p_sdr_canal     TEXT[] DEFAULT NULL,
    p_closer_canal  TEXT[] DEFAULT NULL
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
       AND (p_tipos IS NULL        OR v.tipo = ANY(p_tipos))
       AND (p_origins IS NULL      OR v.origem = ANY(p_origins))
       AND (p_sdr_canal IS NULL    OR _ww_norm_canal_strict(v.sdr_canal::TEXT) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL OR _ww_norm_canal_strict(v.closer_canal) = ANY(p_closer_canal));

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
      'fonte_marcos', 'vw_ww_funnel_base (cache AC) — conversão sempre por safra + filtros tipo/origem/canal'
    );
END $function$;

REVOKE EXECUTE ON FUNCTION public.ww_drift_combos(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_drift_combos(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[]) TO authenticated, service_role;

-- ═══════════════ 3) ww2_loss_reasons: canal closer + convidados + consultor VALENDO + motivo×canal ═══════════════
DROP FUNCTION IF EXISTS public.ww2_loss_reasons(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]);         -- prod
DROP FUNCTION IF EXISTS public.ww2_loss_reasons(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[]); -- staging 20260610c

CREATE FUNCTION public.ww2_loss_reasons(
    p_date_start    TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end      TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode     TEXT DEFAULT 'cohort',
    p_org_id        UUID DEFAULT NULL,
    p_origins       TEXT[] DEFAULT NULL,
    p_faixas        TEXT[] DEFAULT NULL,
    p_destinos      TEXT[] DEFAULT NULL,
    p_tipos         TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL,
    p_sdr_canal     TEXT[] DEFAULT NULL,
    p_closer_canal  TEXT[] DEFAULT NULL,
    p_convidados    TEXT[] DEFAULT NULL
) RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
    v_sdr JSON; v_closer JSON; v_motivo_faixa JSON; v_tendencia JSON;
    v_motivo_canal JSON; v_motivo_canal_closer JSON;
BEGIN
    CREATE TEMP TABLE _ww2_l ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.motivo_perda_sdr_raw AS motivo_sdr,
           c.motivo_perda_closer_raw AS motivo_closer,
           -- faixa DECLARADA no site (cobertura ~89%), mesmo espaço de rótulos do filtro.
           _ww2_norm_faixa_strict(c.faixa_raw) AS faixa,
           _ww2_norm_dest_strict(c.destino_raw) AS destino,
           _ww2_norm_conv_strict(c.convidados_raw) AS convidados,
           -- sdr_canal no cache é TEXT[] → ::TEXT vira '{Vídeo}', formato que o normalizador já trata
           _ww_norm_canal_strict(c.sdr_canal::TEXT) AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           c.consultor_id,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo
      FROM ww_ac_deal_funnel_cache c
     WHERE c.is_ww
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end;

    IF p_origins       IS NOT NULL THEN DELETE FROM _ww2_l WHERE origem != ALL(p_origins); END IF;
    IF p_faixas        IS NOT NULL THEN DELETE FROM _ww2_l WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos      IS NOT NULL THEN DELETE FROM _ww2_l WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados    IS NOT NULL THEN DELETE FROM _ww2_l WHERE convidados IS NULL OR convidados != ALL(p_convidados); END IF;
    IF p_tipos         IS NOT NULL THEN DELETE FROM _ww2_l WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal     IS NOT NULL THEN DELETE FROM _ww2_l WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal  IS NOT NULL THEN DELETE FROM _ww2_l WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _ww2_l WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;

    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_sdr
    FROM (SELECT motivo_sdr AS motivo, COUNT(*) AS qtd FROM _ww2_l WHERE motivo_sdr IS NOT NULL GROUP BY motivo_sdr ORDER BY COUNT(*) DESC LIMIT 12) x;

    SELECT json_agg(json_build_object('motivo', motivo, 'qtd', qtd) ORDER BY qtd DESC) INTO v_closer
    FROM (SELECT motivo_closer AS motivo, COUNT(*) AS qtd FROM _ww2_l WHERE motivo_closer IS NOT NULL GROUP BY motivo_closer ORDER BY COUNT(*) DESC LIMIT 12) x;

    SELECT json_agg(json_build_object('motivo', motivo, 'faixa', faixa, 'qtd', qtd)) INTO v_motivo_faixa
    FROM (SELECT motivo_closer AS motivo, faixa, COUNT(*) AS qtd
          FROM _ww2_l WHERE motivo_closer IS NOT NULL AND faixa IS NOT NULL
          GROUP BY motivo_closer, faixa ORDER BY COUNT(*) DESC LIMIT 40) x;

    -- Motivo × tipo de reunião: só casais que FIZERAM a reunião (canal preenchido).
    -- SDR: motivo de perda do SDR × canal da 1ª reunião.
    SELECT json_agg(json_build_object('motivo', motivo, 'canal', canal, 'qtd', qtd)) INTO v_motivo_canal
    FROM (SELECT motivo_sdr AS motivo, canal_sdr AS canal, COUNT(*) AS qtd
          FROM _ww2_l WHERE motivo_sdr IS NOT NULL AND canal_sdr IS NOT NULL
          GROUP BY motivo_sdr, canal_sdr ORDER BY COUNT(*) DESC LIMIT 60) x;

    -- Closer: motivo de perda do Closer × canal da reunião de fechamento (cobertura boa só 2026+).
    SELECT json_agg(json_build_object('motivo', motivo, 'canal', canal, 'qtd', qtd)) INTO v_motivo_canal_closer
    FROM (SELECT motivo_closer AS motivo, canal_closer AS canal, COUNT(*) AS qtd
          FROM _ww2_l WHERE motivo_closer IS NOT NULL AND canal_closer IS NOT NULL
          GROUP BY motivo_closer, canal_closer ORDER BY COUNT(*) DESC LIMIT 60) x;

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
        'motivo_canal', COALESCE(v_motivo_canal, '[]'::JSON),
        'motivo_canal_closer', COALESCE(v_motivo_canal_closer, '[]'::JSON),
        'tendencia', COALESCE(v_tendencia, '[]'::JSON),
        'fonte', 'ww_ac_deal_funnel_cache (universo AC + faixa/destino/convidados declarados strict + canal SDR/Closer + consultor)'
    );
END $function$;

REVOKE EXECUTE ON FUNCTION public.ww2_loss_reasons(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww2_loss_reasons(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]) TO authenticated, service_role;

-- ═══════════════ 4) ww_qualidade_lead + p_closer_canal + conversão por canal ═══════════════
DROP FUNCTION IF EXISTS public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer);         -- legado pré-20260608a
DROP FUNCTION IF EXISTS public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer, text[]); -- prod 20260608a

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
    p_closer_canal text[] DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_total_entraram INT := 0; v_total_fecharam INT := 0;
    v_taxa_geral NUMERIC;
    v_por_faixa JSON; v_por_convidados JSON;
    v_por_canal_sdr JSON; v_por_canal_closer JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 3));
    v_cob JSON;
    v_acc_labels TEXT[]; v_acc_e INT; v_acc_f INT; v_acc_v NUMERIC[];
    v_out JSONB[]; r RECORD;
BEGIN
    CREATE TEMP TABLE _ww_ql ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           _ww_ac_faixa_from_valor(c.real_orcamento_parsed) AS faixa,
           _ww_ac_convidados_bucket(c.real_convidados_parsed) AS conv_bucket,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo,
           _ww_norm_canal_strict(c.sdr_canal::text) AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           (c.ganho_at IS NOT NULL) AS fechou,
           c.real_orcamento_parsed AS valor_pac
    FROM ww_ac_deal_funnel_cache c
    WHERE c.is_ww
      AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
      AND CASE
        WHEN p_date_mode = 'throughput' THEN c.ganho_at BETWEEN p_date_start AND p_date_end
        ELSE COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end
      END;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_ql WHERE origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_ql WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_ql WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_entraram, v_total_fecharam FROM _ww_ql;
    v_taxa_geral := CASE WHEN v_total_entraram > 0 THEN 100.0 * v_total_fecharam / v_total_entraram END;

    SELECT json_build_object(
        'com_faixa', COUNT(*) FILTER (WHERE faixa IS NOT NULL),
        'com_destino', 0,
        'com_convidados', COUNT(*) FILTER (WHERE conv_bucket IS NOT NULL)
    ) INTO v_cob FROM _ww_ql;

    -- ── por_faixa: merge dinâmico ──
    v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
    v_out := ARRAY[]::JSONB[];
    FOR r IN
        SELECT faixa,
            CASE faixa
                WHEN 'Até R$50 mil' THEN 1 WHEN 'R$50-80 mil' THEN 2 WHEN 'R$80-100 mil' THEN 3
                WHEN 'R$100-200 mil' THEN 4 WHEN 'R$200-500 mil' THEN 5 WHEN 'Mais de R$500 mil' THEN 6 ELSE 99
            END AS ordem,
            COUNT(*)::INT AS entraram, COUNT(*) FILTER (WHERE fechou)::INT AS fecharam,
            COALESCE(array_remove(array_agg(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000), NULL), ARRAY[]::NUMERIC[]) AS valores
        FROM _ww_ql WHERE faixa IS NOT NULL GROUP BY faixa ORDER BY ordem
    LOOP
        v_acc_labels := v_acc_labels || r.faixa; v_acc_e := v_acc_e + r.entraram; v_acc_f := v_acc_f + r.fecharam; v_acc_v := v_acc_v || r.valores;
        IF v_acc_e >= v_min THEN
            v_out := v_out || jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v));
            v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
        END IF;
    END LOOP;
    IF v_acc_e > 0 THEN
        IF array_length(v_out, 1) IS NULL THEN
            v_out := ARRAY[jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v))];
        ELSE
            v_out[array_length(v_out, 1)] := jsonb_build_object(
                'labels', (v_out[array_length(v_out, 1)]->'labels') || to_jsonb(v_acc_labels),
                'entraram', (v_out[array_length(v_out, 1)]->>'entraram')::int + v_acc_e,
                'fecharam', (v_out[array_length(v_out, 1)]->>'fecharam')::int + v_acc_f,
                'valores',  (v_out[array_length(v_out, 1)]->'valores') || to_jsonb(v_acc_v));
        END IF;
    END IF;
    SELECT COALESCE(json_agg(json_build_object(
        'categoria', _ww_ac_join_faixa_labels(ARRAY(SELECT jsonb_array_elements_text(m->'labels'))),
        'entraram', (m->>'entraram')::int, 'fecharam', (m->>'fecharam')::int,
        'taxa_pct', CASE WHEN (m->>'entraram')::int > 0 THEN ROUND(100.0 * (m->>'fecharam')::numeric / (m->>'entraram')::numeric, 1) END,
        'ticket_medio', ROUND(COALESCE(_ww_ac_arr_avg(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x)), 0)::numeric, 0),
        'ticket_p25', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.25), 0)::numeric, 0),
        'ticket_p75', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.75), 0)::numeric, 0),
        'ticket_amostra', jsonb_array_length(m->'valores')
    ) ORDER BY (m->>'entraram')::int DESC), '[]'::json) INTO v_por_faixa FROM unnest(v_out) m;

    -- ── por_convidados: mesma lógica ──
    v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
    v_out := ARRAY[]::JSONB[];
    FOR r IN
        SELECT conv_bucket AS faixa,
            CASE conv_bucket
                WHEN 'Até 50' THEN 1 WHEN '50-100' THEN 2 WHEN '100-150' THEN 3
                WHEN '150-200' THEN 4 WHEN '200-300' THEN 5 WHEN 'Mais de 300' THEN 6 ELSE 99
            END AS ordem,
            COUNT(*)::INT AS entraram, COUNT(*) FILTER (WHERE fechou)::INT AS fecharam,
            COALESCE(array_remove(array_agg(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000), NULL), ARRAY[]::NUMERIC[]) AS valores
        FROM _ww_ql WHERE conv_bucket IS NOT NULL GROUP BY conv_bucket ORDER BY ordem
    LOOP
        v_acc_labels := v_acc_labels || r.faixa; v_acc_e := v_acc_e + r.entraram; v_acc_f := v_acc_f + r.fecharam; v_acc_v := v_acc_v || r.valores;
        IF v_acc_e >= v_min THEN
            v_out := v_out || jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v));
            v_acc_labels := ARRAY[]::TEXT[]; v_acc_e := 0; v_acc_f := 0; v_acc_v := ARRAY[]::NUMERIC[];
        END IF;
    END LOOP;
    IF v_acc_e > 0 THEN
        IF array_length(v_out, 1) IS NULL THEN
            v_out := ARRAY[jsonb_build_object('labels', to_jsonb(v_acc_labels), 'entraram', v_acc_e, 'fecharam', v_acc_f, 'valores', to_jsonb(v_acc_v))];
        ELSE
            v_out[array_length(v_out, 1)] := jsonb_build_object(
                'labels', (v_out[array_length(v_out, 1)]->'labels') || to_jsonb(v_acc_labels),
                'entraram', (v_out[array_length(v_out, 1)]->>'entraram')::int + v_acc_e,
                'fecharam', (v_out[array_length(v_out, 1)]->>'fecharam')::int + v_acc_f,
                'valores',  (v_out[array_length(v_out, 1)]->'valores') || to_jsonb(v_acc_v));
        END IF;
    END IF;
    SELECT COALESCE(json_agg(json_build_object(
        'categoria', _ww_ac_join_conv_labels(ARRAY(SELECT jsonb_array_elements_text(m->'labels'))),
        'entraram', (m->>'entraram')::int, 'fecharam', (m->>'fecharam')::int,
        'taxa_pct', CASE WHEN (m->>'entraram')::int > 0 THEN ROUND(100.0 * (m->>'fecharam')::numeric / (m->>'entraram')::numeric, 1) END,
        'ticket_medio', ROUND(COALESCE(_ww_ac_arr_avg(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x)), 0)::numeric, 0),
        'ticket_p25', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.25), 0)::numeric, 0),
        'ticket_p75', ROUND(COALESCE(_ww_ac_arr_quantile(ARRAY(SELECT (x)::numeric FROM jsonb_array_elements_text(m->'valores') x), 0.75), 0)::numeric, 0),
        'ticket_amostra', jsonb_array_length(m->'valores')
    ) ORDER BY (m->>'entraram')::int DESC), '[]'::json) INTO v_por_convidados FROM unnest(v_out) m;

    -- ── NOVO: conversão por tipo de reunião (universo = quem FEZ a reunião; canal preenchido) ──
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

    DROP TABLE _ww_ql;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'min_amostra', v_min,
        'total_entraram', v_total_entraram, 'total_fecharam', v_total_fecharam,
        'taxa_conversao_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
        'cobertura', v_cob, 'por_faixa', v_por_faixa, 'por_destino', '[]'::JSON,
        'por_convidados', v_por_convidados, 'outros_amostra_pequena', NULL,
        'por_canal_sdr', v_por_canal_sdr, 'por_canal_closer', v_por_canal_closer,
        'heatmap_faixa_destino', '[]'::JSON, 'cruzamentos', NULL,
        'evolucao_mensal_por_faixa', NULL, 'comparacao_entrada_vs_fechamento', NULL,
        'fonte_marcos', 'ww_ac_deal_funnel_cache (universo AC + consolidação dinâmica + filtro tipo + canal SDR/Closer)'
    );
END $$;

REVOKE EXECUTE ON FUNCTION public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_qualidade_lead(timestamptz, timestamptz, uuid, text[], text, uuid, text[], integer, text[], text[]) TO authenticated, service_role;

-- ═══════════════ 5) ww2_overview + convidados + canal ═══════════════
DROP FUNCTION IF EXISTS public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]); -- prod 20260602r

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
    p_closer_canal TEXT[] DEFAULT NULL
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
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_pool ON COMMIT DROP AS
    SELECT ac_deal_id, card_id, data_entrada AS created_at, status_comercial, valor_final,
           sdr_owner_id, vendas_owner_id, pos_owner_id, dono_atual_id,
           faixa, convidados, destino, tipo, origem,
           _ww_norm_canal_strict(sdr_canal::TEXT) AS canal_sdr,
           _ww_norm_canal_strict(closer_canal) AS canal_closer,
           marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho,
           sdr_agendou_at, closer_agendou_at, ganho_at
      FROM vw_ww_funnel_base;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_pool WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_pool WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_pool WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;
    IF p_convidados IS NOT NULL THEN DELETE FROM _ww2_pool WHERE convidados IS NULL OR convidados != ALL(p_convidados); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_pool WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww2_pool WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww2_pool WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww2_pool
         WHERE (sdr_owner_id IS NULL OR sdr_owner_id != ALL(p_consultor_ids))
            AND (vendas_owner_id IS NULL OR vendas_owner_id != ALL(p_consultor_ids))
            AND (pos_owner_id IS NULL OR pos_owner_id != ALL(p_consultor_ids))
            AND (dono_atual_id IS NULL OR dono_atual_id != ALL(p_consultor_ids));
    END IF;

    IF p_date_mode = 'throughput' THEN
        WITH base AS (
            SELECT
                COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end) AS leads,
                COUNT(*) FILTER (WHERE created_at >= v_prev_start AND created_at <  v_prev_end) AS leads_prev,
                COUNT(*) FILTER (WHERE fez_sdr AND sdr_agendou_at BETWEEN p_date_start AND p_date_end) AS reunioes,
                COUNT(*) FILTER (WHERE fez_sdr AND sdr_agendou_at BETWEEN v_prev_start AND v_prev_end) AS reunioes_prev,
                COUNT(*) FILTER (WHERE marcou_closer AND closer_agendou_at BETWEEN p_date_start AND p_date_end) AS propostas,
                COUNT(*) FILTER (WHERE marcou_closer AND closer_agendou_at BETWEEN v_prev_start AND v_prev_end) AS propostas_prev,
                COUNT(*) FILTER (WHERE ganho AND ganho_at BETWEEN p_date_start AND p_date_end) AS fechados,
                COUNT(*) FILTER (WHERE ganho AND ganho_at BETWEEN v_prev_start AND v_prev_end) AS fechados_prev
            FROM _ww2_pool
        )
        SELECT json_build_object(
            'mode', 'throughput',
            'leads', leads, 'leads_prev', leads_prev,
            'reunioes', reunioes, 'reunioes_prev', reunioes_prev,
            'propostas', propostas, 'propostas_prev', propostas_prev,
            'fechados', fechados, 'fechados_prev', fechados_prev
        ) INTO v_kpis FROM base;
    ELSE
        WITH cohort AS (
            SELECT * FROM _ww2_pool WHERE created_at >= p_date_start AND created_at <= p_date_end
        ),
        cohort_prev AS (
            SELECT * FROM _ww2_pool WHERE created_at >= v_prev_start AND created_at < v_prev_end
        )
        SELECT json_build_object(
            'mode', 'cohort',
            'leads',          (SELECT COUNT(*) FROM cohort),
            'leads_prev',     (SELECT COUNT(*) FROM cohort_prev),
            'reunioes',       (SELECT COUNT(*) FROM cohort WHERE fez_sdr),
            'reunioes_prev',  (SELECT COUNT(*) FROM cohort_prev WHERE fez_sdr),
            'propostas',      (SELECT COUNT(*) FROM cohort WHERE marcou_closer),
            'propostas_prev', (SELECT COUNT(*) FROM cohort_prev WHERE marcou_closer),
            'fechados',       (SELECT COUNT(*) FROM cohort WHERE ganho),
            'fechados_prev',  (SELECT COUNT(*) FROM cohort_prev WHERE ganho),
            'ticket_medio',   (SELECT ROUND(COALESCE(AVG(valor_final) FILTER (WHERE ganho AND valor_final > 0), 0)::NUMERIC, 0) FROM cohort),
            'receita',        (SELECT ROUND(COALESCE(SUM(valor_final) FILTER (WHERE ganho), 0)::NUMERIC, 0) FROM cohort)
        ) INTO v_kpis;
    END IF;

    -- FUNIL — 100% Active: deals da vw_ww_funnel_base por marco.
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
               COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end
                                  AND NOT ganho AND NOT marcou_closer AND NOT fez_closer)::INT AS leads_count
          FROM _ww2_pool
        UNION ALL
        SELECT 'Closer', 2, 'closer', NULL::UUID, NULL::TEXT, 1, TRUE, FALSE, FALSE,
               COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end
                                  AND NOT ganho AND (marcou_closer OR fez_closer))::INT
          FROM _ww2_pool
        UNION ALL
        SELECT 'Pós-Venda', 3, 'pos_venda', NULL::UUID, NULL::TEXT, 1, TRUE, TRUE, FALSE,
               COUNT(*) FILTER (WHERE created_at >= p_date_start AND created_at <= p_date_end
                                  AND ganho)::INT
          FROM _ww2_pool
    ) sc;

    v_conv := '[]'::JSON;
    v_alertas := '[]'::JSON;

    DROP TABLE _ww2_pool;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode,
        'prev_start', v_prev_start, 'prev_end', v_prev_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'kpis', v_kpis,
        'funnel', COALESCE(v_funnel, '[]'::JSON),
        'conversoes', v_conv,
        'alertas', v_alertas,
        'fonte_marcos', 'vw_ww_funnel_base (cache AC, v5 — funil por marco Active + convidados/canal)'
    );
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww2_overview(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[], TEXT[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.ww2_overview IS
  'Overview Weddings — KPIs + funil 100% Active (vw_ww_funnel_base / cache AC). v5: + filtros convidados e canal SDR/Closer.';

-- ═══════════════ 6) ww2_marketing + canal ═══════════════
DROP FUNCTION IF EXISTS public.ww2_marketing(timestamptz, timestamptz, text, uuid, text[], text[], text[], text[], uuid[]); -- prod 20260603g

CREATE FUNCTION public.ww2_marketing(
    p_date_start timestamp with time zone DEFAULT (now() - '30 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_date_mode text DEFAULT 'cohort',
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_faixas text[] DEFAULT NULL,
    p_destinos text[] DEFAULT NULL,
    p_tipos text[] DEFAULT NULL,
    p_consultor_ids uuid[] DEFAULT NULL,
    p_sdr_canal text[] DEFAULT NULL,
    p_closer_canal text[] DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_por_origem JSON; v_por_campaign JSON; v_por_medium JSON; v_funil_origem JSON;
BEGIN
    CREATE TEMP TABLE _ww2_m ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           c.sdr_agendou_at AS qualif_at,
           c.real_orcamento_parsed AS valor_pac,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           COALESCE(NULLIF(c.utm_campaign, ''), 'Desconhecida') AS campaign,
           COALESCE(NULLIF(c.utm_medium, ''), 'Desconhecido') AS medium,
           _ww_ac_faixa_from_valor(c.real_orcamento_parsed) AS faixa,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo,
           _ww_norm_canal_strict(c.sdr_canal::TEXT) AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           (c.ganho_at IS NOT NULL) AS fechado
      FROM ww_ac_deal_funnel_cache c
     WHERE c.is_ww
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end;

    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_m WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_tipos  IS NOT NULL THEN DELETE FROM _ww2_m WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww2_m WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww2_m WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT json_agg(json_build_object(
        'origem', origem, 'leads', leads, 'qualificados', qualif, 'fechados', fechados,
        'taxa_qualif', taxa_q, 'taxa_fechamento', taxa_f, 'ticket_medio', ticket,
        'tempo_qualif_medio_dias', tempo_q
    ) ORDER BY leads DESC) INTO v_por_origem
    FROM (SELECT origem,
                 COUNT(*) AS leads,
                 COUNT(*) FILTER (WHERE qualif_at IS NOT NULL) AS qualif,
                 COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE qualif_at IS NOT NULL)/COUNT(*),1) ELSE 0 END AS taxa_q,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa_f,
                 ROUND(COALESCE(AVG(valor_pac) FILTER (WHERE fechado AND valor_pac>0), 0)::NUMERIC, 0) AS ticket,
                 ROUND(AVG(EXTRACT(EPOCH FROM (qualif_at - entrada_at))/86400) FILTER (WHERE qualif_at IS NOT NULL AND qualif_at >= entrada_at)::NUMERIC, 1) AS tempo_q
          FROM _ww2_m
         WHERE (p_origins IS NULL OR origem = ANY(p_origins))
         GROUP BY origem) x;

    SELECT json_agg(json_build_object('campaign', campaign, 'leads', leads, 'fechados', fechados, 'taxa', taxa) ORDER BY leads DESC) INTO v_por_campaign
    FROM (SELECT campaign, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados,
                 CASE WHEN COUNT(*)>0 THEN ROUND(100.0*COUNT(*) FILTER (WHERE fechado)/COUNT(*),1) ELSE 0 END AS taxa
          FROM _ww2_m WHERE campaign != 'Desconhecida' GROUP BY campaign ORDER BY COUNT(*) DESC LIMIT 15) x;

    SELECT json_agg(json_build_object('medium', medium, 'leads', leads, 'fechados', fechados) ORDER BY leads DESC) INTO v_por_medium
    FROM (SELECT medium, COUNT(*) AS leads, COUNT(*) FILTER (WHERE fechado) AS fechados
          FROM _ww2_m WHERE medium != 'Desconhecido' GROUP BY medium ORDER BY COUNT(*) DESC LIMIT 10) x;

    SELECT json_agg(json_build_object('origem', origem, 'novo', novo, 'qualificado', qualif, 'fechado', fechado)) INTO v_funil_origem
    FROM (SELECT origem,
                 COUNT(*) AS novo,
                 COUNT(*) FILTER (WHERE qualif_at IS NOT NULL) AS qualif,
                 COUNT(*) FILTER (WHERE fechado) AS fechado
          FROM _ww2_m GROUP BY origem ORDER BY COUNT(*) DESC LIMIT 5) x;

    DROP TABLE _ww2_m;
    RETURN json_build_object(
        'por_origem', COALESCE(v_por_origem, '[]'::JSON),
        'por_campaign', COALESCE(v_por_campaign, '[]'::JSON),
        'por_medium', COALESCE(v_por_medium, '[]'::JSON),
        'funil_origem', COALESCE(v_funil_origem, '[]'::JSON),
        'fonte', 'ww_ac_deal_funnel_cache (universo AC + filtro tipo + canal SDR/Closer)'
    );
END $$;

REVOKE EXECUTE ON FUNCTION public.ww2_marketing(timestamptz, timestamptz, text, uuid, text[], text[], text[], text[], uuid[], text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww2_marketing(timestamptz, timestamptz, text, uuid, text[], text[], text[], text[], uuid[], text[], text[]) TO authenticated, service_role;

-- ═══════════════ 7) ww_marketing_qualidade + canal + origem × faixa declarada ═══════════════
DROP FUNCTION IF EXISTS public.ww_marketing_qualidade(timestamptz, timestamptz, uuid, text[], integer, text);         -- legado
DROP FUNCTION IF EXISTS public.ww_marketing_qualidade(timestamptz, timestamptz, uuid, text[], integer, text, text[]); -- prod 20260603g

CREATE FUNCTION public.ww_marketing_qualidade(
    p_date_start timestamp with time zone DEFAULT (now() - '180 days'::interval),
    p_date_end timestamp with time zone DEFAULT now(),
    p_org_id uuid DEFAULT NULL,
    p_origins text[] DEFAULT NULL,
    p_min_amostra integer DEFAULT 2,
    p_date_mode text DEFAULT 'cohort',
    p_tipos text[] DEFAULT NULL,
    p_sdr_canal text[] DEFAULT NULL,
    p_closer_canal text[] DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
    v_total_leads INT := 0; v_total_fechados INT := 0; v_taxa_geral NUMERIC;
    v_por_origem JSON; v_por_campaign JSON; v_dropoff_por_origem JSON;
    v_origem_x_faixa JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 2));
BEGIN
    CREATE TEMP TABLE _ww_mq ON COMMIT DROP AS
    SELECT c.ac_deal_id,
           COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) AS entrada_at,
           c.ganho_at,
           _ww_ac_norm_origem(COALESCE(c.utm_source, c.origem_conversao)) AS origem,
           NULLIF(c.utm_medium, '')   AS utm_medium,
           NULLIF(c.utm_campaign, '') AS utm_campaign,
           _ww_tipo_combinado(c.is_elopement_pipeline, c.tipo_casamento) AS tipo,
           -- faixa DECLARADA no site (cobertura ~87%) — pro cruzamento origem × bolso
           _ww2_norm_faixa_strict(c.faixa_raw) AS faixa_decl,
           _ww_norm_canal_strict(c.sdr_canal::TEXT) AS canal_sdr,
           _ww_norm_canal_strict(c.closer_canal) AS canal_closer,
           (c.ganho_at IS NOT NULL) AS fechou,
           (c.sdr_agendou_at IS NOT NULL) AS marcou_sdr,
           (c.closer_agendou_at IS NOT NULL) AS marcou_closer,
           c.sdr_fez AS fez_sdr,
           c.closer_fez AS fez_closer,
           c.real_orcamento_parsed AS valor_pac
      FROM ww_ac_deal_funnel_cache c
     WHERE c.is_ww
       AND COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) IS NOT NULL
       AND CASE
         WHEN p_date_mode = 'throughput' THEN c.ganho_at BETWEEN p_date_start AND p_date_end
         ELSE COALESCE(c.sdr_agendou_at, c.closer_agendou_at, c.ganho_at) BETWEEN p_date_start AND p_date_end
       END;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_mq WHERE origem != ALL(p_origins); END IF;
    IF p_tipos   IS NOT NULL THEN DELETE FROM _ww_mq WHERE tipo != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_mq WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_mq WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total_leads, v_total_fechados FROM _ww_mq;
    v_taxa_geral := CASE WHEN v_total_leads > 0 THEN 100.0 * v_total_fechados / v_total_leads END;

    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'leads_total', leads, 'qualificados', qualif, 'fechados', fechados,
      'taxa_qualif_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * qualif / leads, 1) END,
      'taxa_fechamento_pct', CASE WHEN leads > 0 THEN ROUND(100.0 * fechados / leads, 1) END,
      'lift_vs_geral', CASE WHEN v_taxa_geral IS NULL OR v_taxa_geral = 0 OR leads = 0 THEN NULL
                            ELSE ROUND(((100.0 * fechados / leads) / v_taxa_geral)::numeric, 2) END,
      'ticket_medio', ROUND(ticket::NUMERIC, 0),
      'pct_email_valido', NULL, 'pct_tel_valido', NULL
    ) ORDER BY leads DESC), '[]'::JSON) INTO v_por_origem
    FROM (SELECT origem, COUNT(*) AS leads,
             COUNT(*) FILTER (WHERE fez_sdr OR fechou) AS qualif,
             COUNT(*) FILTER (WHERE fechou) AS fechados,
             AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket
        FROM _ww_mq WHERE origem IS NOT NULL GROUP BY origem HAVING COUNT(*) >= v_min) g;

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
             COUNT(*) FILTER (WHERE fechou) AS fechou,
             AVG(valor_pac) FILTER (WHERE fechou AND valor_pac >= 5000) AS ticket
        FROM _ww_mq WHERE origem IS NOT NULL AND utm_campaign IS NOT NULL
        GROUP BY origem, utm_campaign, utm_medium HAVING COUNT(*) >= v_min) g;

    SELECT COALESCE(json_agg(json_build_object(
      'origem', origem, 'entrada', entrada,
      'sdr', sdr_count, 'closer', closer_count, 'pos_venda', pos_count, 'fechado', fechado_count,
      'drop_entrada_sdr', CASE WHEN entrada > 0 THEN ROUND(100.0 * (entrada - sdr_count) / entrada, 1) END,
      'drop_sdr_closer',  CASE WHEN sdr_count > 0 THEN ROUND(100.0 * (sdr_count - closer_count) / sdr_count, 1) END,
      'drop_closer_fechado', CASE WHEN closer_count > 0 THEN ROUND(100.0 * (closer_count - fechado_count) / closer_count, 1) END
    ) ORDER BY entrada DESC), '[]'::JSON) INTO v_dropoff_por_origem
    FROM (SELECT origem,
             COUNT(*) AS entrada,
             COUNT(*) FILTER (WHERE marcou_sdr OR fechou) AS sdr_count,
             COUNT(*) FILTER (WHERE marcou_closer OR fechou) AS closer_count,
             COUNT(*) FILTER (WHERE fez_closer OR fechou) AS pos_count,
             COUNT(*) FILTER (WHERE fechou) AS fechado_count
        FROM _ww_mq WHERE origem IS NOT NULL GROUP BY origem HAVING COUNT(*) >= v_min) g;

    -- ── NOVO: origem × faixa declarada (qual origem traz qual bolso, e qual combinação fecha) ──
    SELECT COALESCE(json_agg(json_build_object(
      'x', origem, 'y', faixa_decl, 'entrou', e, 'fechou', f,
      'taxa_pct', CASE WHEN e > 0 THEN ROUND(100.0 * f / e, 1) END
    )), '[]'::JSON) INTO v_origem_x_faixa
    FROM (SELECT origem, faixa_decl, COUNT(*) AS e, COUNT(*) FILTER (WHERE fechou) AS f
            FROM _ww_mq WHERE origem IS NOT NULL AND faixa_decl IS NOT NULL
           GROUP BY origem, faixa_decl HAVING COUNT(*) >= v_min) g;

    DROP TABLE _ww_mq;
    RETURN json_build_object(
      'date_start', p_date_start, 'date_end', p_date_end,
      'date_mode', p_date_mode, 'org_id', p_org_id,
      'total_leads', v_total_leads, 'total_fechados', v_total_fechados,
      'taxa_geral_pct', CASE WHEN v_taxa_geral IS NOT NULL THEN ROUND(v_taxa_geral, 1) END,
      'por_origem', v_por_origem, 'por_campaign', v_por_campaign,
      'dropoff_por_origem', v_dropoff_por_origem,
      'origem_x_faixa', v_origem_x_faixa,
      'fonte_marcos', 'ww_ac_deal_funnel_cache (universo AC + filtro tipo + canal + origem×faixa declarada)'
    );
END $$;

REVOKE EXECUTE ON FUNCTION public.ww_marketing_qualidade(timestamptz, timestamptz, uuid, text[], integer, text, text[], text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_marketing_qualidade(timestamptz, timestamptz, uuid, text[], integer, text, text[], text[], text[]) TO authenticated, service_role;

-- ═══════════════ 8) ww_v2_drift_venda + canal ═══════════════
DROP FUNCTION IF EXISTS public.ww_v2_drift_venda(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT, TEXT[]); -- prod v6

CREATE FUNCTION public.ww_v2_drift_venda(
    p_date_start    TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end      TIMESTAMPTZ DEFAULT NOW(),
    p_org_id        UUID DEFAULT NULL,
    p_origins       TEXT[] DEFAULT NULL,
    p_date_mode     TEXT DEFAULT 'cohort',
    p_tipos         TEXT[] DEFAULT NULL,
    p_sdr_canal     TEXT[] DEFAULT NULL,
    p_closer_canal  TEXT[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total INT; v_total_fechados INT;
    v_inv_json JSON; v_dest_json JSON; v_conv_json JSON;
    v_vendas_lista JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING nao encontrado'); END IF;

    CREATE TEMP TABLE _ww_v2_dv ON COMMIT DROP AS
    SELECT v.ac_deal_id AS id,
           v.card_titulo AS titulo,
           v.ac_deal_id,
           v.ganho_at AS data_venda,
           v.ganho AS fechou,
           v.faixa AS faixa_e,
           v.destino AS dest_e,
           v.convidados AS conv_e,
           CASE
             WHEN NOT v.ganho THEN NULL
             WHEN v.real_orcamento_parsed IS NULL THEN NULL
             WHEN v.real_orcamento_parsed < 50000 THEN 'Até R$50 mil'
             WHEN v.real_orcamento_parsed < 80000 THEN 'R$50-80 mil'
             WHEN v.real_orcamento_parsed < 100000 THEN 'R$80-100 mil'
             WHEN v.real_orcamento_parsed < 200000 THEN 'R$100-200 mil'
             WHEN v.real_orcamento_parsed < 500000 THEN 'R$200-500 mil'
             ELSE '+R$500 mil'
           END AS faixa_v,
           CASE WHEN v.ganho THEN v.destino_final ELSE NULL END AS dest_v,
           CASE WHEN v.ganho THEN v.real_convidados_parsed ELSE NULL END AS num_convidados_real,
           CASE
             WHEN NOT v.ganho THEN NULL
             WHEN v.real_convidados_parsed IS NULL THEN NULL
             WHEN v.real_convidados_parsed <= 2 THEN 'Apenas o casal'
             WHEN v.real_convidados_parsed <= 20 THEN 'Ate 20'
             WHEN v.real_convidados_parsed <= 50 THEN '20-50'
             WHEN v.real_convidados_parsed <= 80 THEN '50-80'
             WHEN v.real_convidados_parsed <= 100 THEN '80-100'
             ELSE '+100'
           END AS conv_r,
           v.valor_final AS valor_final,
           NULL::TEXT AS monde_venda,
           v.origem,
           v.tipo AS tipo_casamento,
           _ww_norm_canal_strict(v.sdr_canal::TEXT) AS canal_sdr,
           _ww_norm_canal_strict(v.closer_canal) AS canal_closer,
           v.card_titulo AS contato_nome,
           v.contact_id AS contato_external_id
    FROM vw_ww_funnel_base v
    WHERE CASE
      WHEN p_date_mode = 'throughput' THEN (v.ganho_at BETWEEN p_date_start AND p_date_end)
      ELSE (v.data_entrada >= p_date_start AND v.data_entrada <= p_date_end)
    END;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE tipo_casamento IS NULL OR tipo_casamento != ALL(p_tipos); END IF;
    IF p_sdr_canal IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE canal_sdr IS NULL OR canal_sdr != ALL(p_sdr_canal); END IF;
    IF p_closer_canal IS NOT NULL THEN DELETE FROM _ww_v2_dv WHERE canal_closer IS NULL OR canal_closer != ALL(p_closer_canal); END IF;
    SELECT COUNT(*), COUNT(*) FILTER (WHERE fechou) INTO v_total, v_total_fechados FROM _ww_v2_dv;

    WITH dados AS (SELECT faixa_e, fechou, faixa_v FROM _ww_v2_dv),
    cobertura AS (SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
                         COUNT(*) FILTER (WHERE faixa_e IS NOT NULL) AS com_entrada,
                         COUNT(*) FILTER (WHERE faixa_v IS NOT NULL) AS com_realidade,
                         COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL) AS com_ambos FROM dados),
    drift AS (SELECT
          COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_e) = _ww_faixa_ordem(faixa_v)) AS manteve,
          COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) > _ww_faixa_ordem(faixa_e)) AS subiu,
          COUNT(*) FILTER (WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL AND _ww_faixa_ordem(faixa_v) < _ww_faixa_ordem(faixa_e)) AS desceu FROM dados),
    matriz AS (SELECT faixa_e, faixa_v, COUNT(*) AS qtd FROM dados WHERE faixa_e IS NOT NULL AND faixa_v IS NOT NULL GROUP BY faixa_e, faixa_v)
    SELECT json_build_object('cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON))
    INTO v_inv_json;

    WITH dados AS (SELECT dest_e, dest_v, fechou FROM _ww_v2_dv),
    cobertura AS (SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
                         COUNT(*) FILTER (WHERE dest_e IS NOT NULL) AS com_entrada,
                         COUNT(*) FILTER (WHERE dest_v IS NOT NULL) AS com_vendido,
                         COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL) AS com_ambos FROM dados),
    drift AS (SELECT COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e = dest_v) AS manteve,
                     COUNT(*) FILTER (WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e != dest_v) AS mudou FROM dados),
    matriz AS (SELECT dest_e, dest_v, COUNT(*) AS qtd FROM dados WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL GROUP BY dest_e, dest_v),
    top_migracoes AS (SELECT dest_e AS de, dest_v AS para, COUNT(*) AS qtd FROM dados
         WHERE dest_e IS NOT NULL AND dest_v IS NOT NULL AND dest_e != dest_v
         GROUP BY dest_e, dest_v ORDER BY COUNT(*) DESC LIMIT 8)
    SELECT json_build_object('cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON),
        'top_migracoes', COALESCE((SELECT json_agg(row_to_json(t)) FROM top_migracoes t), '[]'::JSON))
    INTO v_dest_json;

    WITH dados AS (SELECT conv_e, fechou, conv_r, num_convidados_real FROM _ww_v2_dv),
    cobertura AS (SELECT COUNT(*) AS total_leads, COUNT(*) FILTER (WHERE fechou) AS total_fechados,
                         COUNT(*) FILTER (WHERE conv_e IS NOT NULL) AS com_entrada,
                         COUNT(*) FILTER (WHERE conv_r IS NOT NULL) AS com_realidade,
                         COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL) AS com_ambos,
                         COUNT(*) FILTER (WHERE num_convidados_real IS NOT NULL) AS com_numero_exato FROM dados),
    drift AS (SELECT
          COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_e) = _ww_conv_ordem(conv_r)) AS manteve,
          COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_r) > _ww_conv_ordem(conv_e)) AS subiu,
          COUNT(*) FILTER (WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL AND _ww_conv_ordem(conv_r) < _ww_conv_ordem(conv_e)) AS desceu FROM dados),
    matriz AS (SELECT conv_e, conv_r, COUNT(*) AS qtd FROM dados WHERE conv_e IS NOT NULL AND conv_r IS NOT NULL GROUP BY conv_e, conv_r)
    SELECT json_build_object('cobertura', (SELECT row_to_json(c) FROM cobertura c),
        'drift', (SELECT row_to_json(d) FROM drift d),
        'matriz', COALESCE((SELECT json_agg(row_to_json(m)) FROM matriz m), '[]'::JSON))
    INTO v_conv_json;

    SELECT json_agg(json_build_object('card_id', id, 'titulo', titulo, 'data_venda', data_venda,
        'num_convidados', num_convidados_real, 'tipo_casamento', tipo_casamento,
        'monde_venda', monde_venda, 'destino_vendido', dest_v, 'origem', origem,
        'valor_final', valor_final, 'consultor_nome', NULL::TEXT,
        'contato_nome', contato_nome, 'contato_external_id', contato_external_id,
        'ac_deal_id', ac_deal_id) ORDER BY data_venda DESC NULLS LAST, id) INTO v_vendas_lista
    FROM (SELECT * FROM _ww_v2_dv WHERE fechou LIMIT 200) sub;

    DROP TABLE _ww_v2_dv;
    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id, 'date_mode', p_date_mode,
        'fonte_v2', 'vw_ww_funnel_base (cache AC canonico, universe unico + canal SDR/Closer)',
        'total_leads', v_total, 'total_fechados', v_total_fechados, 'total_vendas', v_total_fechados,
        'investimento', v_inv_json, 'destino', v_dest_json, 'convidados', v_conv_json,
        'breakdown_tipo', '[]'::JSON, 'vendas_lista', COALESCE(v_vendas_lista, '[]'::JSON),
        'drift_por_consultor', '[]'::JSON, 'drift_por_mes', '[]'::JSON
    );
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww_v2_drift_venda(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT, TEXT[], TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_v2_drift_venda(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT[], TEXT, TEXT[], TEXT[], TEXT[]) TO authenticated, service_role;

-- ═══════════════ 9) ww_funil_conversao_v1 + canal (filtro de contexto, como origem/tipo) ═══════════════
DROP FUNCTION IF EXISTS public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[]); -- prod 20260603h

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
    p_closer_canal TEXT[] DEFAULT NULL
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
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal));

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

REVOKE EXECUTE ON FUNCTION public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[]) TO authenticated, service_role;

-- ═══════════════ 10) ww_funil_ranking_combo + canal como FILTRO e como DIMENSÃO ═══════════════
DROP FUNCTION IF EXISTS public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[]); -- prod 20260603h

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
    p_closer_canal TEXT[] DEFAULT NULL
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
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(c.closer_canal) = ANY(p_closer_canal));

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

REVOKE EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[], TEXT[], TEXT[]) TO authenticated, service_role;

-- ═══════════════ 11) ww_v2_lead_ideal: canal_closer como dimensão e eixo (assinatura igual) ═══════════════
-- Base: 20260608a (def viva em prod). Só MUDA: dims/dims_a ganham canal_closer; cruzamento
-- livre ganha 'canal_closer' na allowlist. CREATE OR REPLACE (mesma assinatura, sem DROP).
CREATE OR REPLACE FUNCTION public.ww_v2_lead_ideal(
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
    p_tipos           TEXT[] DEFAULT NULL,
    p_sdr_canal       TEXT[] DEFAULT NULL,
    p_closer_canal    TEXT[] DEFAULT NULL,
    p_referencia      TEXT DEFAULT 'ganho',
    p_cruz_x          TEXT DEFAULT 'faixa',
    p_cruz_y          TEXT DEFAULT 'convidados'
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
    v_perdido BOOLEAN := (lower(COALESCE(p_referencia,'ganho')) = 'perdido');
    v_comparacoes JSON;
    v_cruzamento JSON;
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

    -- Referência: quem FECHOU (ganho_at na janela) ou quem PERDEU (is_perdido, por data de entrada).
    CREATE TEMP TABLE _ww_v2_pli_h ON COMMIT DROP AS
    SELECT faixa, destino, convidados, tipo, origem,
           _ww_norm_canal_strict(sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(closer_canal) AS canal_closer
      FROM ww_funil_casal
     WHERE org_id = v_org_id
       AND (CASE WHEN v_perdido
                 THEN is_perdido = TRUE AND (lead_created_at >= v_hist_start AND lead_created_at <= v_hist_end)
                 ELSE ganho = TRUE AND (ganho_at IS NULL OR (ganho_at >= v_hist_start AND ganho_at <= v_hist_end)) END)
       AND (p_origins IS NULL       OR origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR consultor_id = ANY(p_consultor_ids))
       AND (p_faixas IS NULL        OR faixa = ANY(p_faixas))
       AND (p_destinos IS NULL      OR destino = ANY(p_destinos))
       AND (p_convidados IS NULL    OR convidados = ANY(p_convidados))
       AND (p_tipos IS NULL         OR tipo = ANY(p_tipos))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(closer_canal) = ANY(p_closer_canal));

    CREATE TEMP TABLE _ww_v2_pli_a ON COMMIT DROP AS
    SELECT faixa, destino, convidados, tipo, origem,
           _ww_norm_canal_strict(sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(closer_canal) AS canal_closer
      FROM ww_funil_casal
     WHERE org_id = v_org_id
       AND lead_created_at >= p_atual_start AND lead_created_at <= p_atual_end
       AND (p_origins IS NULL       OR origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR consultor_id = ANY(p_consultor_ids))
       AND (p_faixas IS NULL        OR faixa = ANY(p_faixas))
       AND (p_destinos IS NULL      OR destino = ANY(p_destinos))
       AND (p_convidados IS NULL    OR convidados = ANY(p_convidados))
       AND (p_tipos IS NULL         OR tipo = ANY(p_tipos))
       AND (p_sdr_canal IS NULL     OR _ww_norm_canal_strict(sdr_canal) = ANY(p_sdr_canal))
       AND (p_closer_canal IS NULL  OR _ww_norm_canal_strict(closer_canal) = ANY(p_closer_canal));

    SELECT COUNT(*) INTO v_total_hist  FROM _ww_v2_pli_h;
    SELECT COUNT(*) INTO v_total_atual FROM _ww_v2_pli_a;

    -- Comparação por dimensão (faixa/convidados/destino/tipo/origem/canal_sdr/canal_closer)
    WITH dims AS (
      SELECT 'faixa' AS dim, faixa AS cat FROM _ww_v2_pli_h WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino', destino FROM _ww_v2_pli_h WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados', convidados FROM _ww_v2_pli_h WHERE convidados IS NOT NULL
      UNION ALL SELECT 'tipo', tipo FROM _ww_v2_pli_h WHERE tipo IS NOT NULL
      UNION ALL SELECT 'origem', origem FROM _ww_v2_pli_h WHERE origem IS NOT NULL
      UNION ALL SELECT 'canal_sdr', canal_sdr FROM _ww_v2_pli_h WHERE canal_sdr IS NOT NULL
      UNION ALL SELECT 'canal_closer', canal_closer FROM _ww_v2_pli_h WHERE canal_closer IS NOT NULL
    ),
    dims_a AS (
      SELECT 'faixa' AS dim, faixa AS cat FROM _ww_v2_pli_a WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino', destino FROM _ww_v2_pli_a WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados', convidados FROM _ww_v2_pli_a WHERE convidados IS NOT NULL
      UNION ALL SELECT 'tipo', tipo FROM _ww_v2_pli_a WHERE tipo IS NOT NULL
      UNION ALL SELECT 'origem', origem FROM _ww_v2_pli_a WHERE origem IS NOT NULL
      UNION ALL SELECT 'canal_sdr', canal_sdr FROM _ww_v2_pli_a WHERE canal_sdr IS NOT NULL
      UNION ALL SELECT 'canal_closer', canal_closer FROM _ww_v2_pli_a WHERE canal_closer IS NOT NULL
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

    -- Cruzamento LIVRE: dois eixos escolhidos (allowlist via CASE; valor inválido → NULL → some)
    WITH hx AS (
      SELECT
        CASE p_cruz_x WHEN 'faixa' THEN faixa WHEN 'convidados' THEN convidados WHEN 'destino' THEN destino
                      WHEN 'origem' THEN origem WHEN 'canal_sdr' THEN canal_sdr WHEN 'canal_closer' THEN canal_closer WHEN 'tipo' THEN tipo END AS x,
        CASE p_cruz_y WHEN 'faixa' THEN faixa WHEN 'convidados' THEN convidados WHEN 'destino' THEN destino
                      WHEN 'origem' THEN origem WHEN 'canal_sdr' THEN canal_sdr WHEN 'canal_closer' THEN canal_closer WHEN 'tipo' THEN tipo END AS y
        FROM _ww_v2_pli_h
    ),
    ax AS (
      SELECT
        CASE p_cruz_x WHEN 'faixa' THEN faixa WHEN 'convidados' THEN convidados WHEN 'destino' THEN destino
                      WHEN 'origem' THEN origem WHEN 'canal_sdr' THEN canal_sdr WHEN 'canal_closer' THEN canal_closer WHEN 'tipo' THEN tipo END AS x,
        CASE p_cruz_y WHEN 'faixa' THEN faixa WHEN 'convidados' THEN convidados WHEN 'destino' THEN destino
                      WHEN 'origem' THEN origem WHEN 'canal_sdr' THEN canal_sdr WHEN 'canal_closer' THEN canal_closer WHEN 'tipo' THEN tipo END AS y
        FROM _ww_v2_pli_a
    ),
    h AS (SELECT x, y, COUNT(*) AS qtd FROM hx WHERE x IS NOT NULL AND y IS NOT NULL GROUP BY x, y),
    a AS (SELECT x, y, COUNT(*) AS qtd FROM ax WHERE x IS NOT NULL AND y IS NOT NULL GROUP BY x, y),
    cells AS (SELECT DISTINCT x, y FROM (SELECT x, y FROM h UNION ALL SELECT x, y FROM a) z)
    SELECT COALESCE(json_agg(json_build_object(
        'x', cells.x, 'y', cells.y,
        'hist_qtd', COALESCE(h.qtd, 0),
        'hist_pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / v_total_hist, 1) END,
        'atual_qtd', COALESCE(a.qtd, 0),
        'atual_pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / v_total_atual, 1) END
      )), '[]'::JSON) INTO v_cruzamento
    FROM cells LEFT JOIN h ON h.x = cells.x AND h.y = cells.y LEFT JOIN a ON a.x = cells.x AND a.y = cells.y;

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
      'referencia', CASE WHEN v_perdido THEN 'perdido' ELSE 'ganho' END,
      'cruz_x', p_cruz_x, 'cruz_y', p_cruz_y,
      'filtros_aplicados', json_build_object('origins',p_origins,'consultor_ids',p_consultor_ids,'faixas',p_faixas,'destinos',p_destinos,'convidados',p_convidados,'tipos',p_tipos,'sdr_canal',p_sdr_canal,'closer_canal',p_closer_canal),
      'total_historico', v_total_hist,
      'total_atual', v_total_atual,
      'comparacoes', v_comparacoes,
      'cruzamento', v_cruzamento,
      'top_perfis_historico', v_top_perfis_hist,
      'top_perfis_atual', v_top_perfis_atual
    );
END $func$;

REVOKE EXECUTE ON FUNCTION public.ww_v2_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ww_v2_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT, TEXT, TEXT) TO authenticated, service_role;
