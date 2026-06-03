-- 20260603d — ww_serie_temporal: série por semana/mês p/ os gráficos novos (#3 e #7).
-- Conta, por bucket de tempo: leads (entrou), reuniões SDR (fez_sdr), reuniões Closer
-- (fez_closer) e vendas (ganho). Fonte: ww_funil_casal (Active). Dois modos:
--   cohort     = bucket pela data de criação do lead; métricas = daquela safra, alcançou (bool)
--   throughput = cada métrica no bucket da SUA data de evento (o que aconteceu no período)
-- Buckets vazios incluídos (generate_series) p/ o gráfico não ter buracos.
-- Função NOVA (sem rebase). Filtros: origem/faixa/destino/convidados/consultor + incluir_elopement.

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
    p_consultor_ids     UUID[] DEFAULT NULL
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

GRANT EXECUTE ON FUNCTION public.ww_serie_temporal(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, BOOLEAN, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;
