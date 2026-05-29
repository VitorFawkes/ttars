-- ============================================================================
-- ww_funil_ranking_perfil — "Quais perfis mais viram casamento"
--
-- Ranqueia os perfis de lead (por UMA dimensão: faixa | convidados | destino)
-- pela TAXA DE FECHAMENTO (ganho / entrou) no período, para o gestor DESCOBRIR
-- o lead bom em vez de adivinhar o filtro.
--
-- ESPELHA EXATAMENTE o pool, a definição de "ganho" e os filtros de período
-- do ww_funil_conversao_v1 (migration 20260528a) — assim o número do ranking
-- ("R$100-200 mil fecha 48%") BATE com o que o funil mostra ao filtrar aquele
-- perfil, e os rótulos (strict) são os mesmos que o funil aceita no filtro.
--
-- Mostra TODOS os buckets com a amostra (entrou) — a UI marca "poucos casos".
-- Buckets NULL (lead sem aquele campo preenchido) ficam fora do ranking.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww_funil_ranking_perfil(
    p_date_start    TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end      TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode     TEXT        DEFAULT 'cohort',
    p_org_id        UUID        DEFAULT NULL,
    p_dimensao      TEXT        DEFAULT 'faixa',   -- 'faixa' | 'convidados' | 'destino'
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
    v_rows        JSON;
    v_total       INT := 0;
BEGIN
    SELECT id INTO v_pipeline_id
      FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN
        RETURN json_build_object('error', 'Pipeline WEDDING não encontrado para org_id ' || v_org_id);
    END IF;

    IF p_dimensao NOT IN ('faixa', 'convidados', 'destino') THEN
        p_dimensao := 'faixa';
    END IF;

    -- Pool idêntico ao ww_funil_conversao_v1 (mesmas normalizações strict).
    CREATE TEMP TABLE _ww_rank_pool ON COMMIT DROP AS
    SELECT
        c.id, c.created_at, c.updated_at, c.status_comercial,
        _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
        _ww2_norm_conv_strict (c.produto_data->>'ww_mkt_convidados_form') AS convidados,
        _ww2_norm_dest_strict (c.produto_data->>'ww_mkt_destino_form')   AS destino,
        _ww2_norm_origem(c.marketing_data) AS origem,
        NULLIF(c.produto_data->>'ww_tipo_casamento','') AS tipo,
        c.dono_atual_id AS consultor_id,
        NULLIF(c.produto_data->>'ww_sdr_data_reuniao','')      AS sdr_data_reuniao_raw,
        NULLIF(c.produto_data->>'ww_sdr_data_qualificacao','') AS sdr_data_qualif_raw,
        NULLIF(c.produto_data->>'ww_closer_data_reuniao','')   AS closer_data_reuniao_raw,
        NULLIF(c.produto_data->>'ww_closer_data_ganho','')     AS closer_data_ganho_raw
      FROM cards c
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT = 'WEDDING' AND c.org_id = v_org_id;

    ALTER TABLE _ww_rank_pool ADD COLUMN sdr_data_reuniao TIMESTAMPTZ;
    ALTER TABLE _ww_rank_pool ADD COLUMN sdr_data_qualif TIMESTAMPTZ;
    ALTER TABLE _ww_rank_pool ADD COLUMN closer_data_reuniao TIMESTAMPTZ;
    ALTER TABLE _ww_rank_pool ADD COLUMN closer_data_ganho TIMESTAMPTZ;
    ALTER TABLE _ww_rank_pool ADD COLUMN ganho BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww_rank_pool ADD COLUMN no_periodo BOOLEAN DEFAULT FALSE;

    UPDATE _ww_rank_pool SET
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
        ganho = status_comercial = 'ganho' OR closer_data_ganho_raw IS NOT NULL
    WHERE id IS NOT NULL;

    UPDATE _ww_rank_pool SET no_periodo =
        CASE WHEN p_date_mode = 'throughput' THEN
            (created_at BETWEEN p_date_start AND p_date_end)
         OR (sdr_data_reuniao BETWEEN p_date_start AND p_date_end)
         OR (sdr_data_qualif BETWEEN p_date_start AND p_date_end)
         OR (closer_data_reuniao BETWEEN p_date_start AND p_date_end)
         OR (closer_data_ganho BETWEEN p_date_start AND p_date_end)
         OR (status_comercial = 'ganho' AND updated_at BETWEEN p_date_start AND p_date_end)
        ELSE (created_at BETWEEN p_date_start AND p_date_end) END
    WHERE id IS NOT NULL;

    DELETE FROM _ww_rank_pool WHERE NOT no_periodo;

    -- Filtros globais (mesmos do funil)
    IF p_origins IS NOT NULL THEN
        DELETE FROM _ww_rank_pool WHERE origem IS NULL OR origem != ALL(p_origins);
    END IF;
    IF p_tipos IS NOT NULL THEN
        DELETE FROM _ww_rank_pool WHERE tipo IS NULL OR tipo != ALL(p_tipos);
    END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww_rank_pool WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids);
    END IF;

    SELECT COUNT(*) INTO v_total FROM _ww_rank_pool;

    -- Agrega por dimensão escolhida. taxa = ganho / entrou (lead bom = quem mais fecha).
    SELECT json_agg(row_to_json(r) ORDER BY r.taxa_pct DESC NULLS LAST, r.entrou DESC) INTO v_rows
    FROM (
        SELECT
            bucket,
            COUNT(*)                          AS entrou,
            COUNT(*) FILTER (WHERE ganho)     AS ganho,
            ROUND(100.0 * COUNT(*) FILTER (WHERE ganho) / NULLIF(COUNT(*), 0), 1) AS taxa_pct
        FROM (
            SELECT
                CASE p_dimensao
                    WHEN 'faixa'      THEN faixa
                    WHEN 'convidados' THEN convidados
                    ELSE destino
                END AS bucket,
                ganho
            FROM _ww_rank_pool
        ) z
        WHERE bucket IS NOT NULL
        GROUP BY bucket
    ) r;

    DROP TABLE _ww_rank_pool;

    RETURN json_build_object(
        'dimensao', p_dimensao,
        'periodo', json_build_object('date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode),
        'total_no_periodo', v_total,
        'rows', COALESCE(v_rows, '[]'::JSON)
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_funil_ranking_perfil(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT, TEXT[], TEXT[], UUID[]) TO authenticated;
