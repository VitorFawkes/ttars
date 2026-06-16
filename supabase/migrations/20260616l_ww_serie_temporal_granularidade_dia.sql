-- 20260616l_ww_serie_temporal_granularidade_dia.sql
-- Gráfico "Ao longo do tempo": adiciona granularidade DIÁRIA (p_granularidade='day'),
-- além de semana/mês. Mantém o entrada_valida (régua Entrou DW = só SDR Weddings).
-- Base: definição VIVA de produção (2026-06-16).

CREATE OR REPLACE FUNCTION public.ww_serie_temporal(p_date_start timestamp with time zone DEFAULT (now() - '1 year'::interval), p_date_end timestamp with time zone DEFAULT now(), p_granularidade text DEFAULT 'month'::text, p_org_id uuid DEFAULT NULL::uuid, p_date_mode text DEFAULT 'throughput'::text, p_incluir_elopement boolean DEFAULT true, p_origins text[] DEFAULT NULL::text[], p_faixas text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_convidados text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_tipos text[] DEFAULT NULL::text[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_status_lead text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org   UUID := COALESCE(p_org_id, requesting_org_id());
    v_trunc TEXT := CASE WHEN p_granularidade = 'day' THEN 'day' WHEN p_granularidade = 'week' THEN 'week' ELSE 'month' END;
    v_step  INTERVAL := CASE WHEN p_granularidade = 'day' THEN INTERVAL '1 day' WHEN p_granularidade = 'week' THEN INTERVAL '1 week' ELSE INTERVAL '1 month' END;
    v_lblfmt TEXT := CASE WHEN p_granularidade IN ('day','week') THEN 'DD/MM' ELSE 'MM/YYYY' END;
    v_series JSON;
    v_tot_e INT; v_tot_ms INT; v_tot_s INT; v_tot_mc INT; v_tot_c INT; v_tot_g INT;
BEGIN
    CREATE TEMP TABLE _pool ON COMMIT DROP AS
    SELECT lead_created_at,
           agendou_sdr, agendou_sdr_at, fez_sdr, fez_sdr_at,
           agendou_closer, agendou_closer_at, fez_closer, fez_closer_at,
           ganho, ganho_at,
           -- 20260616k: DW só "entra" se passou pela esteira SDR Weddings (group 1) — mesma régua
           -- do ww2_overview/funil. Gateia SÓ o "entrou"; demais marcos seguem a realidade.
           (c.tipo <> 'DW' OR EXISTS (
              SELECT 1 FROM ww_ac_deal_funnel_cache fcv
               WHERE fcv.contact_id = c.contact_id AND fcv.is_ww AND fcv.pipeline_group_id = 1
           )) AS entrada_valida
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
        -- SAFRA: marcos CUMULATIVOS (mesma régua do ww_funil_conversao_v1 e do drill)
        WITH buckets AS (
            SELECT generate_series(date_trunc(v_trunc, p_date_start), date_trunc(v_trunc, p_date_end), v_step) AS b
        ),
        agg AS (
            SELECT date_trunc(v_trunc, lead_created_at) AS b,
                   COUNT(*) FILTER (WHERE entrada_valida) AS entrou,
                   COUNT(*) FILTER (WHERE agendou_sdr OR fez_sdr OR agendou_closer OR fez_closer OR ganho) AS marcou_sdr,
                   COUNT(*) FILTER (WHERE fez_sdr OR agendou_closer OR fez_closer OR ganho) AS fez_sdr,
                   COUNT(*) FILTER (WHERE agendou_closer OR fez_closer OR ganho) AS marcou_closer,
                   COUNT(*) FILTER (WHERE fez_closer OR ganho) AS fez_closer,
                   COUNT(*) FILTER (WHERE ganho) AS ganho
              FROM _pool
             WHERE lead_created_at BETWEEN p_date_start AND p_date_end
             GROUP BY 1
        )
        SELECT json_agg(json_build_object(
                   'periodo', to_char(bk.b, 'YYYY-MM-DD'),
                   'label',   to_char(bk.b, v_lblfmt),
                   'entrou',        COALESCE(a.entrou, 0),
                   'marcou_sdr',    COALESCE(a.marcou_sdr, 0),
                   'fez_sdr',       COALESCE(a.fez_sdr, 0),
                   'marcou_closer', COALESCE(a.marcou_closer, 0),
                   'fez_closer',    COALESCE(a.fez_closer, 0),
                   'ganho',         COALESCE(a.ganho, 0)
               ) ORDER BY bk.b)
          INTO v_series
          FROM buckets bk LEFT JOIN agg a ON a.b = bk.b;
    ELSE
        -- THROUGHPUT: cada marco pela própria data
        WITH buckets AS (
            SELECT generate_series(date_trunc(v_trunc, p_date_start), date_trunc(v_trunc, p_date_end), v_step) AS b
        ),
        ev AS (
            SELECT date_trunc(v_trunc, lead_created_at) b, 1 e, 0 ms, 0 s, 0 mc, 0 c, 0 g FROM _pool WHERE entrada_valida AND lead_created_at BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, agendou_sdr_at),    0,1,0,0,0,0 FROM _pool WHERE agendou_sdr    AND agendou_sdr_at    BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, fez_sdr_at),        0,0,1,0,0,0 FROM _pool WHERE fez_sdr        AND fez_sdr_at        BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, agendou_closer_at), 0,0,0,1,0,0 FROM _pool WHERE agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, fez_closer_at),     0,0,0,0,1,0 FROM _pool WHERE fez_closer     AND fez_closer_at     BETWEEN p_date_start AND p_date_end
            UNION ALL SELECT date_trunc(v_trunc, ganho_at),          0,0,0,0,0,1 FROM _pool WHERE ganho          AND ganho_at          BETWEEN p_date_start AND p_date_end
        ),
        agg AS (SELECT b, SUM(e) entrou, SUM(ms) marcou_sdr, SUM(s) fez_sdr, SUM(mc) marcou_closer, SUM(c) fez_closer, SUM(g) ganho FROM ev GROUP BY b)
        SELECT json_agg(json_build_object(
                   'periodo', to_char(bk.b, 'YYYY-MM-DD'),
                   'label',   to_char(bk.b, v_lblfmt),
                   'entrou',        COALESCE(a.entrou, 0),
                   'marcou_sdr',    COALESCE(a.marcou_sdr, 0),
                   'fez_sdr',       COALESCE(a.fez_sdr, 0),
                   'marcou_closer', COALESCE(a.marcou_closer, 0),
                   'fez_closer',    COALESCE(a.fez_closer, 0),
                   'ganho',         COALESCE(a.ganho, 0)
               ) ORDER BY bk.b)
          INTO v_series
          FROM buckets bk LEFT JOIN agg a ON a.b = bk.b;
    END IF;

    -- Totais do período (mesma régua de modo)
    IF p_date_mode = 'cohort' THEN
        SELECT COUNT(*) FILTER (WHERE entrada_valida),
               COUNT(*) FILTER (WHERE agendou_sdr OR fez_sdr OR agendou_closer OR fez_closer OR ganho),
               COUNT(*) FILTER (WHERE fez_sdr OR agendou_closer OR fez_closer OR ganho),
               COUNT(*) FILTER (WHERE agendou_closer OR fez_closer OR ganho),
               COUNT(*) FILTER (WHERE fez_closer OR ganho),
               COUNT(*) FILTER (WHERE ganho)
          INTO v_tot_e, v_tot_ms, v_tot_s, v_tot_mc, v_tot_c, v_tot_g
          FROM _pool WHERE lead_created_at BETWEEN p_date_start AND p_date_end;
    ELSE
        SELECT COUNT(*) FILTER (WHERE entrada_valida AND lead_created_at BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE agendou_sdr    AND agendou_sdr_at    BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE fez_sdr        AND fez_sdr_at        BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE agendou_closer AND agendou_closer_at BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE fez_closer     AND fez_closer_at     BETWEEN p_date_start AND p_date_end),
               COUNT(*) FILTER (WHERE ganho          AND ganho_at          BETWEEN p_date_start AND p_date_end)
          INTO v_tot_e, v_tot_ms, v_tot_s, v_tot_mc, v_tot_c, v_tot_g FROM _pool;
    END IF;

    DROP TABLE _pool;
    RETURN json_build_object(
        'granularidade', v_trunc,
        'date_mode', p_date_mode,
        'series', COALESCE(v_series, '[]'::JSON),
        'totais', json_build_object(
            'entrou', v_tot_e, 'marcou_sdr', v_tot_ms, 'fez_sdr', v_tot_s,
            'marcou_closer', v_tot_mc, 'fez_closer', v_tot_c, 'ganho', v_tot_g)
    );
END $function$
;
