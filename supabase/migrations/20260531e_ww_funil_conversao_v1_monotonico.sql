-- ============================================================================
-- ww_funil_conversao_v1 — FUNIL DE VERDADE (monotônico).
--
-- ANTES: cada marco era contado de forma independente (flag própria), então um
-- lead podia "Fez SDR" sem ter "Marcou reunião SDR" registrado → etapa posterior
-- com MAIS gente que a anterior → "passagem 105%" → confunde o gestor.
--
-- AGORA: cada etapa conta quem chegou PELO MENOS até ali (a flag dela OU qualquer
-- marco posterior). As contagens só diminuem → passagem sempre ≤ 100% → leitura
-- de funil clara. Só mudaram os dois blocos de contagem (baseline e filtrado);
-- o pool, marcos e filtros são idênticos ao 20260528a.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww_funil_conversao_v1(
    p_date_start    TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end      TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode     TEXT        DEFAULT 'cohort',
    p_org_id        UUID        DEFAULT NULL,
    p_faixas        TEXT[]      DEFAULT NULL,
    p_convidados    TEXT[]      DEFAULT NULL,
    p_destinos      TEXT[]      DEFAULT NULL,
    p_origins       TEXT[]      DEFAULT NULL,
    p_tipos         TEXT[]      DEFAULT NULL,
    p_consultor_ids UUID[]      DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id      UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_baseline    JSON;
    v_filtrado    JSON;
    v_ac_sync     JSON;
    v_baseline_total INT := 0;
    v_filtrado_total INT := 0;
    v_total_distinct_faixas INT := 0;
    v_total_distinct_convidados INT := 0;
    v_total_distinct_destinos INT := 0;
BEGIN
    SELECT id INTO v_pipeline_id
      FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN
        RETURN json_build_object('error', 'Pipeline WEDDING não encontrado para org_id ' || v_org_id);
    END IF;

    CREATE TEMP TABLE _ww_funil_pool ON COMMIT DROP AS
    SELECT
        c.id, c.created_at, c.updated_at, c.status_comercial,
        _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
        _ww2_norm_conv_strict (c.produto_data->>'ww_mkt_convidados_form') AS convidados,
        _ww2_norm_dest_strict (c.produto_data->>'ww_mkt_destino_form')   AS destino,
        _ww2_norm_origem(c.marketing_data) AS origem,
        NULLIF(c.produto_data->>'ww_tipo_casamento','') AS tipo,
        c.dono_atual_id AS consultor_id,
        ph.slug AS phase_slug,
        s.ordem AS stage_ordem,
        s.is_won AS stage_is_won,
        s.fase AS stage_fase,
        NULLIF(c.produto_data->>'ww_sdr_data_reuniao','')   AS sdr_data_reuniao_raw,
        NULLIF(c.produto_data->>'ww_sdr_qualificado','')    AS sdr_qualificado_raw,
        NULLIF(c.produto_data->>'ww_sdr_data_qualificacao','') AS sdr_data_qualif_raw,
        NULLIF(c.produto_data->>'ww_closer_data_reuniao','') AS closer_data_reuniao_raw,
        NULLIF(c.produto_data->>'ww_closer_data_ganho','')   AS closer_data_ganho_raw
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT = 'WEDDING' AND c.org_id = v_org_id;

    ALTER TABLE _ww_funil_pool ADD COLUMN sdr_data_reuniao TIMESTAMPTZ;
    ALTER TABLE _ww_funil_pool ADD COLUMN sdr_data_qualif TIMESTAMPTZ;
    ALTER TABLE _ww_funil_pool ADD COLUMN closer_data_reuniao TIMESTAMPTZ;
    ALTER TABLE _ww_funil_pool ADD COLUMN closer_data_ganho TIMESTAMPTZ;
    ALTER TABLE _ww_funil_pool ADD COLUMN marcou_sdr BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww_funil_pool ADD COLUMN fez_sdr BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww_funil_pool ADD COLUMN marcou_closer BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww_funil_pool ADD COLUMN fez_closer BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww_funil_pool ADD COLUMN ganho BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww_funil_pool ADD COLUMN no_periodo BOOLEAN DEFAULT FALSE;

    UPDATE _ww_funil_pool SET
        sdr_data_reuniao = CASE WHEN sdr_data_reuniao_raw ~ '^\d{4}-\d{2}-\d{2}' THEN
              (CASE WHEN sdr_data_reuniao_raw ~ 'T' THEN sdr_data_reuniao_raw::TIMESTAMPTZ
                    ELSE (sdr_data_reuniao_raw || 'T00:00:00Z')::TIMESTAMPTZ END) ELSE NULL END,
        sdr_data_qualif = CASE WHEN sdr_data_qualif_raw ~ '^\d{4}-\d{2}-\d{2}' THEN
              (CASE WHEN sdr_data_qualif_raw ~ 'T' THEN sdr_data_qualif_raw::TIMESTAMPTZ
                    ELSE (sdr_data_qualif_raw || 'T00:00:00Z')::TIMESTAMPTZ END) ELSE NULL END,
        closer_data_reuniao = CASE WHEN closer_data_reuniao_raw ~ '^\d{4}-\d{2}-\d{2}' THEN
              (CASE WHEN closer_data_reuniao_raw ~ 'T' THEN closer_data_reuniao_raw::TIMESTAMPTZ
                    ELSE (closer_data_reuniao_raw || 'T00:00:00Z')::TIMESTAMPTZ END) ELSE NULL END,
        closer_data_ganho = CASE WHEN closer_data_ganho_raw ~ '^\d{4}-\d{2}-\d{2}' THEN
              (CASE WHEN closer_data_ganho_raw ~ 'T' THEN closer_data_ganho_raw::TIMESTAMPTZ
                    ELSE (closer_data_ganho_raw || 'T00:00:00Z')::TIMESTAMPTZ END) ELSE NULL END,
        marcou_sdr    = sdr_data_reuniao_raw IS NOT NULL,
        fez_sdr       = sdr_qualificado_raw IS NOT NULL
                     OR sdr_data_qualif_raw IS NOT NULL
                     OR phase_slug IN ('closer','pos_venda'),
        marcou_closer = closer_data_reuniao_raw IS NOT NULL
                     OR phase_slug IN ('closer','pos_venda'),
        fez_closer    = (phase_slug = 'closer' AND COALESCE(stage_ordem, 0) >= 2)
                     OR phase_slug = 'pos_venda'
                     OR status_comercial = 'ganho'
                     OR closer_data_ganho_raw IS NOT NULL,
        ganho         = status_comercial = 'ganho'
                     OR closer_data_ganho_raw IS NOT NULL
    WHERE id IS NOT NULL;

    UPDATE _ww_funil_pool SET no_periodo =
        CASE WHEN p_date_mode = 'throughput' THEN
            (created_at BETWEEN p_date_start AND p_date_end)
         OR (sdr_data_reuniao BETWEEN p_date_start AND p_date_end)
         OR (sdr_data_qualif BETWEEN p_date_start AND p_date_end)
         OR (closer_data_reuniao BETWEEN p_date_start AND p_date_end)
         OR (closer_data_ganho BETWEEN p_date_start AND p_date_end)
         OR (status_comercial = 'ganho' AND updated_at BETWEEN p_date_start AND p_date_end)
        ELSE (created_at BETWEEN p_date_start AND p_date_end) END
    WHERE id IS NOT NULL;

    DELETE FROM _ww_funil_pool WHERE NOT no_periodo;

    IF p_origins IS NOT NULL THEN
        DELETE FROM _ww_funil_pool WHERE origem IS NULL OR origem != ALL(p_origins);
    END IF;
    IF p_tipos IS NOT NULL THEN
        DELETE FROM _ww_funil_pool WHERE tipo IS NULL OR tipo != ALL(p_tipos);
    END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww_funil_pool WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids);
    END IF;

    -- ── BASELINE (contagem CUMULATIVA = chegou pelo menos até a etapa) ──────
    SELECT COUNT(*) INTO v_baseline_total FROM _ww_funil_pool;
    SELECT json_build_object(
        'entrou',         v_baseline_total,
        'marcou_sdr',     COUNT(*) FILTER (WHERE marcou_sdr OR fez_sdr OR marcou_closer OR fez_closer OR ganho),
        'fez_sdr',        COUNT(*) FILTER (WHERE fez_sdr OR marcou_closer OR fez_closer OR ganho),
        'marcou_closer',  COUNT(*) FILTER (WHERE marcou_closer OR fez_closer OR ganho),
        'fez_closer',     COUNT(*) FILTER (WHERE fez_closer OR ganho),
        'ganho',          COUNT(*) FILTER (WHERE ganho)
    ) INTO v_baseline FROM _ww_funil_pool;

    -- ── FILTRADO ────────────────────────────────────────────────────────────
    CREATE TEMP TABLE _ww_funil_filtrado ON COMMIT DROP AS SELECT * FROM _ww_funil_pool;
    IF p_faixas IS NOT NULL THEN
        DELETE FROM _ww_funil_filtrado WHERE faixa IS NULL OR faixa != ALL(p_faixas);
    END IF;
    IF p_convidados IS NOT NULL THEN
        DELETE FROM _ww_funil_filtrado WHERE convidados IS NULL OR convidados != ALL(p_convidados);
    END IF;
    IF p_destinos IS NOT NULL THEN
        DELETE FROM _ww_funil_filtrado WHERE destino IS NULL OR destino != ALL(p_destinos);
    END IF;

    SELECT COUNT(*) INTO v_filtrado_total FROM _ww_funil_filtrado;
    SELECT json_build_object(
        'entrou',         v_filtrado_total,
        'marcou_sdr',     COUNT(*) FILTER (WHERE marcou_sdr OR fez_sdr OR marcou_closer OR fez_closer OR ganho),
        'fez_sdr',        COUNT(*) FILTER (WHERE fez_sdr OR marcou_closer OR fez_closer OR ganho),
        'marcou_closer',  COUNT(*) FILTER (WHERE marcou_closer OR fez_closer OR ganho),
        'fez_closer',     COUNT(*) FILTER (WHERE fez_closer OR ganho),
        'ganho',          COUNT(*) FILTER (WHERE ganho)
    ) INTO v_filtrado FROM _ww_funil_filtrado;

    SELECT
      (SELECT COUNT(*) FROM (SELECT DISTINCT faixa FROM _ww_funil_pool WHERE faixa IS NOT NULL) x),
      (SELECT COUNT(*) FROM (SELECT DISTINCT convidados FROM _ww_funil_pool WHERE convidados IS NOT NULL) x),
      (SELECT COUNT(*) FROM (SELECT DISTINCT destino FROM _ww_funil_pool WHERE destino IS NOT NULL) x)
    INTO v_total_distinct_faixas, v_total_distinct_convidados, v_total_distinct_destinos;

    SELECT json_build_object(
        'last_event_at', MAX(processed_at),
        'minutes_ago', CASE WHEN MAX(processed_at) IS NOT NULL
               THEN EXTRACT(EPOCH FROM (NOW() - MAX(processed_at)))/60.0 ELSE NULL END,
        'status', CASE
            WHEN MAX(processed_at) IS NULL THEN 'unknown'
            WHEN NOW() - MAX(processed_at) < INTERVAL '10 minutes' THEN 'recent'
            WHEN NOW() - MAX(processed_at) < INTERVAL '60 minutes' THEN 'stale'
            ELSE 'very_stale' END
    ) INTO v_ac_sync
    FROM integration_events
   WHERE entity_type = 'deal' AND processed_at IS NOT NULL
     AND created_at > NOW() - INTERVAL '24 hours';

    DROP TABLE _ww_funil_pool;
    DROP TABLE _ww_funil_filtrado;

    RETURN json_build_object(
        'periodo', json_build_object('date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode),
        'pipeline_id', v_pipeline_id,
        'org_id', v_org_id,
        'filtros_aplicados', json_build_object(
            'faixas', p_faixas, 'convidados', p_convidados, 'destinos', p_destinos,
            'origins', p_origins, 'tipos', p_tipos, 'consultor_ids', p_consultor_ids),
        'ac_sync', v_ac_sync,
        'baseline', v_baseline,
        'filtrado', v_filtrado,
        'baseline_total', v_baseline_total,
        'filtrado_total', v_filtrado_total,
        'distincts_disponiveis', json_build_object(
            'faixas', v_total_distinct_faixas, 'convidados', v_total_distinct_convidados, 'destinos', v_total_distinct_destinos),
        'tem_filtro_preenchimento',
            (p_faixas IS NOT NULL AND array_length(p_faixas, 1) > 0)
         OR (p_convidados IS NOT NULL AND array_length(p_convidados, 1) > 0)
         OR (p_destinos IS NOT NULL AND array_length(p_destinos, 1) > 0)
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_funil_conversao_v1(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;
