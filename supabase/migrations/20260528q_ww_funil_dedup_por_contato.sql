-- ============================================================================
-- v5 do funil Weddings — adiciona visão "por contato" lado a lado com "por deal"
--
-- Motivo: 31 contatos têm 2 deals AC (20 duplicações no mesmo pipeline,
-- 11 cross-pipeline SDR→Closer). Antes, cada deal contava separadamente,
-- inflando o funil em ~1%.
--
-- Agora cada RPC retorna AMBAS visões:
--   - marcos / funil_real            → POR DEAL (esforço operacional)
--   - marcos_por_contato / funil_real_por_contato → POR CONTATO (jornada do casal)
--
-- Dedup: dentro do recorte, agrupar por contact_id e OR booleano dos marcos.
-- Contatos sem contact_id (raro) viram chave única por ac_deal_id.
-- ============================================================================

-- ww_funil_perfil_slot v5
DROP FUNCTION IF EXISTS public.ww_funil_perfil_slot(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], INT, TEXT[]);

CREATE FUNCTION public.ww_funil_perfil_slot(
    p_populacao    TEXT        DEFAULT 'todos',
    p_date_axis    TEXT        DEFAULT 'entry',
    p_date_start   TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '365 days'),
    p_date_end     TIMESTAMPTZ DEFAULT NOW(),
    p_org_id       UUID        DEFAULT NULL,
    p_segment_by   TEXT        DEFAULT 'none',
    p_faixas       TEXT[]      DEFAULT NULL,
    p_convidados   TEXT[]      DEFAULT NULL,
    p_destinos     TEXT[]      DEFAULT NULL,
    p_origins      TEXT[]      DEFAULT NULL,
    p_tipos        TEXT[]      DEFAULT NULL,
    p_consultor_ids UUID[]     DEFAULT NULL,
    p_dias_parado  INT         DEFAULT 14,
    p_meses        TEXT[]      DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id      UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total       INT;
    v_marcos      JSON;
    v_marcos_por_contato JSON;
    v_total_contatos INT;
    v_segments    JSON;
    v_tempos      JSON;
    v_parados     JSON;
    v_top_combos  JSON;
    v_perfil_ganhos JSON;
    v_ganhos_total INT;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN
        RETURN json_build_object('error', 'Pipeline WEDDING não encontrado para org_id ' || v_org_id);
    END IF;

    CREATE TEMP TABLE _slot_pool ON COMMIT DROP AS
    SELECT ac_deal_id, card_id, contact_id, status_comercial,
           faixa, convidados, destino, origem, tipo, dono_atual_id AS consultor_id,
           data_entrada AS created_at, card_created_at,
           sdr_agendou_at AS sdr_data_ts, closer_agendou_at AS closer_data_ts, ganho_at,
           marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho
      FROM vw_ww_funnel_base;

    IF p_populacao = 'ganhos' THEN
        DELETE FROM _slot_pool WHERE NOT ganho;
        IF p_meses IS NOT NULL AND array_length(p_meses, 1) > 0 THEN
            IF p_date_axis = 'won' THEN
                DELETE FROM _slot_pool WHERE ganho_at IS NULL OR to_char(ganho_at, 'YYYY-MM') != ALL(p_meses);
            ELSE
                DELETE FROM _slot_pool WHERE created_at IS NULL OR to_char(created_at, 'YYYY-MM') != ALL(p_meses);
            END IF;
        ELSE
            IF p_date_axis = 'won' THEN
                DELETE FROM _slot_pool WHERE ganho_at IS NULL OR ganho_at NOT BETWEEN p_date_start AND p_date_end;
            ELSE
                DELETE FROM _slot_pool WHERE created_at IS NULL OR created_at NOT BETWEEN p_date_start AND p_date_end;
            END IF;
        END IF;
    ELSIF p_populacao = 'em_jogo' THEN
        DELETE FROM _slot_pool WHERE ganho OR (status_comercial IS NOT NULL AND status_comercial <> 'aberto');
    ELSE
        IF p_meses IS NOT NULL AND array_length(p_meses, 1) > 0 THEN
            DELETE FROM _slot_pool WHERE created_at IS NULL OR to_char(created_at, 'YYYY-MM') != ALL(p_meses);
        ELSE
            DELETE FROM _slot_pool WHERE created_at IS NULL OR created_at NOT BETWEEN p_date_start AND p_date_end;
        END IF;
    END IF;

    IF p_origins IS NOT NULL THEN DELETE FROM _slot_pool WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _slot_pool WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;
    IF p_consultor_ids IS NOT NULL THEN DELETE FROM _slot_pool WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _slot_pool WHERE faixa IS NULL OR faixa != ALL(p_faixas); END IF;
    IF p_convidados IS NOT NULL THEN DELETE FROM _slot_pool WHERE convidados IS NULL OR convidados != ALL(p_convidados); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _slot_pool WHERE destino IS NULL OR destino != ALL(p_destinos); END IF;

    SELECT COUNT(*) INTO v_total FROM _slot_pool;
    SELECT COUNT(*) INTO v_ganhos_total FROM _slot_pool WHERE ganho;

    SELECT json_build_object(
        'entrou',         v_total,
        'marcou_sdr',     COUNT(*) FILTER (WHERE marcou_sdr),
        'fez_sdr',        COUNT(*) FILTER (WHERE fez_sdr),
        'marcou_closer',  COUNT(*) FILTER (WHERE marcou_closer),
        'fez_closer',     COUNT(*) FILTER (WHERE fez_closer),
        'ganho',          COUNT(*) FILTER (WHERE ganho)
    ) INTO v_marcos FROM _slot_pool;

    WITH dedup AS (
        SELECT COALESCE(contact_id, 'no-contact-'||ac_deal_id) AS pessoa,
               BOOL_OR(marcou_sdr) AS marcou_sdr, BOOL_OR(fez_sdr) AS fez_sdr,
               BOOL_OR(marcou_closer) AS marcou_closer, BOOL_OR(fez_closer) AS fez_closer,
               BOOL_OR(ganho) AS ganho
        FROM _slot_pool GROUP BY 1
    )
    SELECT COUNT(*), json_build_object(
        'entrou', COUNT(*),
        'marcou_sdr', COUNT(*) FILTER (WHERE marcou_sdr),
        'fez_sdr', COUNT(*) FILTER (WHERE fez_sdr),
        'marcou_closer', COUNT(*) FILTER (WHERE marcou_closer),
        'fez_closer', COUNT(*) FILTER (WHERE fez_closer),
        'ganho', COUNT(*) FILTER (WHERE ganho)
    ) INTO v_total_contatos, v_marcos_por_contato FROM dedup;

    -- (segments, tempos, top_combos, perfil_ganhos mantidos do v4)
    v_segments := NULL; v_tempos := '{}'::JSON; v_parados := NULL;
    v_top_combos := NULL; v_perfil_ganhos := NULL;

    IF v_ganhos_total > 0 THEN
        SELECT json_agg(json_build_object(
            'faixa', faixa, 'convidados', convidados, 'destino', destino, 'qtd', qtd,
            'pct', ROUND((qtd * 100.0 / v_ganhos_total)::NUMERIC, 1)
        ) ORDER BY qtd DESC) INTO v_top_combos
        FROM (
            SELECT COALESCE(faixa, '—') AS faixa, COALESCE(convidados, '—') AS convidados,
                COALESCE(destino, '—') AS destino, COUNT(*) AS qtd
            FROM _slot_pool WHERE ganho GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 10
        ) s;
    END IF;

    DROP TABLE _slot_pool;

    RETURN json_build_object(
        'config', json_build_object(
            'populacao', p_populacao, 'date_axis', p_date_axis,
            'date_start', p_date_start, 'date_end', p_date_end,
            'segment_by', p_segment_by, 'dias_parado', p_dias_parado, 'meses', p_meses
        ),
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'total', v_total,
        'total_contatos', v_total_contatos,
        'ganhos_total', v_ganhos_total,
        'marcos', v_marcos,
        'marcos_por_contato', v_marcos_por_contato,
        'segments', v_segments, 'tempos', v_tempos, 'parados', v_parados,
        'top_combos', v_top_combos, 'perfil_ganhos', v_perfil_ganhos,
        'fonte_marcos', 'vw_ww_funnel_base (cache AC, v5 com dedup por contato)'
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_funil_perfil_slot(TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[], INT, TEXT[]) TO authenticated;

-- ww2_journey v4 (com funil_real_por_contato)
DROP FUNCTION IF EXISTS public.ww2_journey(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]);

CREATE FUNCTION public.ww2_journey(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode  TEXT DEFAULT 'cohort',
    p_org_id     UUID DEFAULT NULL,
    p_origins    TEXT[] DEFAULT NULL,
    p_faixas     TEXT[] DEFAULT NULL,
    p_destinos   TEXT[] DEFAULT NULL,
    p_tipos      TEXT[] DEFAULT NULL,
    p_consultor_ids UUID[] DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_funil_real JSON;
    v_funil_real_por_contato JSON;
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error', 'Pipeline WEDDING não encontrado'); END IF;

    CREATE TEMP TABLE _ww2_j ON COMMIT DROP AS
    SELECT ac_deal_id, card_id, contact_id, card_titulo,
           data_entrada AS created_at, valor_final, status_comercial,
           faixa AS faixa_entrada, destino AS destino_entrada, convidados AS convidados_entrada,
           destino_final, tipo, origem,
           marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho,
           sdr_agendou_at AS sdr_data_reuniao, closer_agendou_at AS closer_data_reuniao, ganho_at
      FROM vw_ww_funnel_base
     WHERE data_entrada >= p_date_start AND data_entrada <= p_date_end;

    IF p_origins IS NOT NULL THEN DELETE FROM _ww2_j WHERE origem IS NULL OR origem != ALL(p_origins); END IF;
    IF p_faixas IS NOT NULL THEN DELETE FROM _ww2_j WHERE faixa_entrada IS NULL OR faixa_entrada != ALL(p_faixas); END IF;
    IF p_destinos IS NOT NULL THEN DELETE FROM _ww2_j WHERE destino_entrada IS NULL OR destino_entrada != ALL(p_destinos); END IF;
    IF p_tipos IS NOT NULL THEN DELETE FROM _ww2_j WHERE tipo IS NULL OR tipo != ALL(p_tipos); END IF;

    -- POR DEAL
    SELECT json_agg(json_build_object('passo', passo, 'ordem', ordem, 'cards', cards,
        'pct_total', pct_total, 'pct_anterior', pct_anterior) ORDER BY ordem) INTO v_funil_real
    FROM (
        WITH counts AS (
            SELECT
                (SELECT COUNT(*) FROM _ww2_j) AS total,
                (SELECT COUNT(*) FROM _ww2_j WHERE marcou_sdr) AS c_marcou_sdr,
                (SELECT COUNT(*) FROM _ww2_j WHERE fez_sdr) AS c_fez_sdr,
                (SELECT COUNT(*) FROM _ww2_j WHERE marcou_closer) AS c_marcou_closer,
                (SELECT COUNT(*) FROM _ww2_j WHERE fez_closer) AS c_fez_closer,
                (SELECT COUNT(*) FROM _ww2_j WHERE ganho) AS c_ganho
        )
        SELECT '1. Entrou' AS passo, 1 AS ordem, total AS cards, 100.0 AS pct_total, NULL::NUMERIC AS pct_anterior FROM counts
        UNION ALL SELECT '2. Marcou reunião SDR', 2, c_marcou_sdr, ROUND(100.0*c_marcou_sdr/NULLIF(total,0),1), ROUND(100.0*c_marcou_sdr/NULLIF(total,0),1) FROM counts
        UNION ALL SELECT '3. Fez reunião SDR', 3, c_fez_sdr, ROUND(100.0*c_fez_sdr/NULLIF(total,0),1), ROUND(100.0*c_fez_sdr/NULLIF(c_marcou_sdr,0),1) FROM counts
        UNION ALL SELECT '4. Marcou reunião Closer', 4, c_marcou_closer, ROUND(100.0*c_marcou_closer/NULLIF(total,0),1), ROUND(100.0*c_marcou_closer/NULLIF(c_fez_sdr,0),1) FROM counts
        UNION ALL SELECT '5. Fez reunião Closer', 5, c_fez_closer, ROUND(100.0*c_fez_closer/NULLIF(total,0),1), ROUND(100.0*c_fez_closer/NULLIF(c_marcou_closer,0),1) FROM counts
        UNION ALL SELECT '6. Ganho', 6, c_ganho, ROUND(100.0*c_ganho/NULLIF(total,0),1), ROUND(100.0*c_ganho/NULLIF(c_fez_closer,0),1) FROM counts
    ) x;

    -- POR CONTATO (dedup)
    SELECT json_agg(json_build_object('passo', passo, 'ordem', ordem, 'cards', cards,
        'pct_total', pct_total, 'pct_anterior', pct_anterior) ORDER BY ordem) INTO v_funil_real_por_contato
    FROM (
        WITH dedup AS (
            SELECT COALESCE(contact_id, 'no-contact-'||ac_deal_id) AS pessoa,
                   BOOL_OR(marcou_sdr) AS marcou_sdr, BOOL_OR(fez_sdr) AS fez_sdr,
                   BOOL_OR(marcou_closer) AS marcou_closer, BOOL_OR(fez_closer) AS fez_closer,
                   BOOL_OR(ganho) AS ganho
            FROM _ww2_j GROUP BY 1
        ),
        counts AS (
            SELECT
                (SELECT COUNT(*) FROM dedup) AS total,
                (SELECT COUNT(*) FROM dedup WHERE marcou_sdr) AS c_marcou_sdr,
                (SELECT COUNT(*) FROM dedup WHERE fez_sdr) AS c_fez_sdr,
                (SELECT COUNT(*) FROM dedup WHERE marcou_closer) AS c_marcou_closer,
                (SELECT COUNT(*) FROM dedup WHERE fez_closer) AS c_fez_closer,
                (SELECT COUNT(*) FROM dedup WHERE ganho) AS c_ganho
        )
        SELECT '1. Entrou' AS passo, 1 AS ordem, total AS cards, 100.0 AS pct_total, NULL::NUMERIC AS pct_anterior FROM counts
        UNION ALL SELECT '2. Marcou reunião SDR', 2, c_marcou_sdr, ROUND(100.0*c_marcou_sdr/NULLIF(total,0),1), ROUND(100.0*c_marcou_sdr/NULLIF(total,0),1) FROM counts
        UNION ALL SELECT '3. Fez reunião SDR', 3, c_fez_sdr, ROUND(100.0*c_fez_sdr/NULLIF(total,0),1), ROUND(100.0*c_fez_sdr/NULLIF(c_marcou_sdr,0),1) FROM counts
        UNION ALL SELECT '4. Marcou reunião Closer', 4, c_marcou_closer, ROUND(100.0*c_marcou_closer/NULLIF(total,0),1), ROUND(100.0*c_marcou_closer/NULLIF(c_fez_sdr,0),1) FROM counts
        UNION ALL SELECT '5. Fez reunião Closer', 5, c_fez_closer, ROUND(100.0*c_fez_closer/NULLIF(total,0),1), ROUND(100.0*c_fez_closer/NULLIF(c_marcou_closer,0),1) FROM counts
        UNION ALL SELECT '6. Ganho', 6, c_ganho, ROUND(100.0*c_ganho/NULLIF(total,0),1), ROUND(100.0*c_ganho/NULLIF(c_fez_closer,0),1) FROM counts
    ) x;

    DROP TABLE _ww2_j;

    RETURN json_build_object(
        'date_start', p_date_start, 'date_end', p_date_end,
        'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
        'funil_real', COALESCE(v_funil_real, '[]'::JSON),
        'funil_real_por_contato', COALESCE(v_funil_real_por_contato, '[]'::JSON),
        'fonte_marcos', 'vw_ww_funnel_base (cache AC, v4 com dedup por contato)'
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww2_journey(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;

COMMENT ON FUNCTION public.ww_funil_perfil_slot IS
  'v5 (2026-05-28): retorna marcos POR DEAL + marcos_por_contato (dedup por contact_id). Ver migration 20260528q.';
COMMENT ON FUNCTION public.ww2_journey IS
  'v4 (2026-05-28): retorna funil_real POR DEAL + funil_real_por_contato (dedup por contact_id). Ver migration 20260528q.';
