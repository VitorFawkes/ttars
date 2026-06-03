-- ============================================================================
-- ww_funil_ranking_combo — agora devolve as 6 ETAPAS do funil por perfil.
--
-- Antes (20260531c/d): por bucket retornava só entrou + ganho + taxa_pct.
-- Agora: por bucket retorna também as contagens CUMULATIVAS (monotônicas) dos
--   marcos intermediários (marcou_sdr, fez_sdr, marcou_closer, fez_closer) —
--   mesma lógica do ww_funil_conversao_v1 — pra montar a MATRIZ "Funil por
--   perfil" (perfil × etapa) numa única chamada. ADITIVO: entrou/ganho/taxa_pct
--   e a ordenação por taxa suavizada (k=15, shrinkage) seguem idênticos a 20260531d.
--
-- Pool agora faz LEFT JOIN em pipeline_stages/pipeline_phases + lê
-- ww_sdr_qualificado pra calcular os marcos exatamente como o funil v1.
--
-- DROP + CREATE (em vez de CREATE OR REPLACE): mesmo padrão de 20260531c, atômico
-- na transação da migration, GRANT refeito no fim. Releitura de 20260531c/d feita:
-- esta versão preserva TUDO daquelas (assinatura, pool base, parse de datas,
-- definição de ganho, no_periodo, filtros, p0/score, LIMIT 500) e só ADICIONA.
-- ============================================================================

DROP FUNCTION IF EXISTS public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[]);

CREATE FUNCTION public.ww_funil_ranking_combo(
    p_date_start    TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end      TIMESTAMPTZ DEFAULT NOW(),
    p_date_mode     TEXT        DEFAULT 'cohort',
    p_org_id        UUID        DEFAULT NULL,
    p_dimensoes     TEXT[]      DEFAULT ARRAY['faixa'],
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
    v_dims        TEXT[];
    v_p0          NUMERIC := 0;
    v_base_total  INT := 0;
    v_base_ganho  INT := 0;
BEGIN
    SELECT id INTO v_pipeline_id
      FROM pipelines WHERE produto::TEXT = 'WEDDING' AND org_id = v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN
        RETURN json_build_object('error', 'Pipeline WEDDING não encontrado para org_id ' || v_org_id);
    END IF;

    SELECT ARRAY(SELECT DISTINCT d FROM unnest(COALESCE(p_dimensoes, ARRAY['faixa'])) d
                 WHERE d IN ('faixa', 'convidados', 'destino'))
      INTO v_dims;
    IF v_dims IS NULL OR array_length(v_dims, 1) IS NULL THEN
        v_dims := ARRAY['faixa'];
    END IF;

    -- Pool idêntico ao ww_funil_conversao_v1 (mesmas normalizações strict) +
    -- JOIN de stages/phases pros marcos intermediários do funil.
    CREATE TEMP TABLE _ww_combo_pool ON COMMIT DROP AS
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
        NULLIF(c.produto_data->>'ww_sdr_data_reuniao','')      AS sdr_data_reuniao_raw,
        NULLIF(c.produto_data->>'ww_sdr_qualificado','')       AS sdr_qualificado_raw,
        NULLIF(c.produto_data->>'ww_sdr_data_qualificacao','') AS sdr_data_qualif_raw,
        NULLIF(c.produto_data->>'ww_closer_data_reuniao','')   AS closer_data_reuniao_raw,
        NULLIF(c.produto_data->>'ww_closer_data_ganho','')     AS closer_data_ganho_raw
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT = 'WEDDING' AND c.org_id = v_org_id;

    ALTER TABLE _ww_combo_pool ADD COLUMN sdr_data_reuniao TIMESTAMPTZ;
    ALTER TABLE _ww_combo_pool ADD COLUMN sdr_data_qualif TIMESTAMPTZ;
    ALTER TABLE _ww_combo_pool ADD COLUMN closer_data_reuniao TIMESTAMPTZ;
    ALTER TABLE _ww_combo_pool ADD COLUMN closer_data_ganho TIMESTAMPTZ;
    ALTER TABLE _ww_combo_pool ADD COLUMN marcou_sdr BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww_combo_pool ADD COLUMN fez_sdr BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww_combo_pool ADD COLUMN marcou_closer BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww_combo_pool ADD COLUMN fez_closer BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww_combo_pool ADD COLUMN ganho BOOLEAN DEFAULT FALSE;
    ALTER TABLE _ww_combo_pool ADD COLUMN no_periodo BOOLEAN DEFAULT FALSE;

    UPDATE _ww_combo_pool SET
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
        fez_sdr       = sdr_qualificado_raw IS NOT NULL OR sdr_data_qualif_raw IS NOT NULL OR phase_slug IN ('closer','pos_venda'),
        marcou_closer = closer_data_reuniao_raw IS NOT NULL OR phase_slug IN ('closer','pos_venda'),
        fez_closer    = (phase_slug = 'closer' AND COALESCE(stage_ordem, 0) >= 2) OR phase_slug = 'pos_venda' OR status_comercial = 'ganho' OR closer_data_ganho_raw IS NOT NULL,
        ganho         = status_comercial = 'ganho' OR closer_data_ganho_raw IS NOT NULL
    WHERE id IS NOT NULL;

    UPDATE _ww_combo_pool SET no_periodo =
        CASE WHEN p_date_mode = 'throughput' THEN
            (created_at BETWEEN p_date_start AND p_date_end)
         OR (sdr_data_reuniao BETWEEN p_date_start AND p_date_end)
         OR (sdr_data_qualif BETWEEN p_date_start AND p_date_end)
         OR (closer_data_reuniao BETWEEN p_date_start AND p_date_end)
         OR (closer_data_ganho BETWEEN p_date_start AND p_date_end)
         OR (status_comercial = 'ganho' AND updated_at BETWEEN p_date_start AND p_date_end)
        ELSE (created_at BETWEEN p_date_start AND p_date_end) END
    WHERE id IS NOT NULL;

    DELETE FROM _ww_combo_pool WHERE NOT no_periodo;

    IF p_origins IS NOT NULL THEN
        DELETE FROM _ww_combo_pool WHERE origem IS NULL OR origem != ALL(p_origins);
    END IF;
    IF p_tipos IS NOT NULL THEN
        DELETE FROM _ww_combo_pool WHERE tipo IS NULL OR tipo != ALL(p_tipos);
    END IF;
    IF p_consultor_ids IS NOT NULL THEN
        DELETE FROM _ww_combo_pool WHERE consultor_id IS NULL OR consultor_id != ALL(p_consultor_ids);
    END IF;

    SELECT COUNT(*) INTO v_total FROM _ww_combo_pool;

    SELECT COUNT(*), COUNT(*) FILTER (WHERE ganho)
      INTO v_base_total, v_base_ganho
      FROM _ww_combo_pool
     WHERE (NOT ('faixa'      = ANY(v_dims)) OR faixa      IS NOT NULL)
       AND (NOT ('convidados' = ANY(v_dims)) OR convidados IS NOT NULL)
       AND (NOT ('destino'    = ANY(v_dims)) OR destino    IS NOT NULL);
    v_p0 := CASE WHEN v_base_total > 0 THEN v_base_ganho::NUMERIC / v_base_total ELSE 0 END;

    -- Agrega por combinação das dimensões; retorna as 6 contagens CUMULATIVAS
    -- (monotônicas) do funil por bucket — cada marco = OR dele + todos os
    -- posteriores → marcou_sdr ≥ fez_sdr ≥ marcou_closer ≥ fez_closer ≥ ganho.
    SELECT json_agg(
             json_build_object(
               'faixa', faixa, 'convidados', convidados, 'destino', destino, 'label', label,
               'entrou', entrou, 'marcou_sdr', m_sdr, 'fez_sdr', f_sdr,
               'marcou_closer', m_cl, 'fez_closer', f_cl, 'ganho', ganho, 'taxa_pct', taxa_pct
             ) ORDER BY score DESC, entrou DESC
           )
      INTO v_rows
    FROM (
        SELECT
            g_faixa AS faixa, g_conv AS convidados, g_dest AS destino,
            concat_ws(' · ', g_faixa, g_conv, g_dest) AS label,
            entrou, m_sdr, f_sdr, m_cl, f_cl, ganho,
            ROUND(100.0 * ganho / NULLIF(entrou, 0), 1) AS taxa_pct,
            (ganho + 15 * v_p0) / (entrou + 15) AS score
        FROM (
            SELECT g_faixa, g_conv, g_dest,
                   COUNT(*)                                                                              AS entrou,
                   COUNT(*) FILTER (WHERE marcou_sdr OR fez_sdr OR marcou_closer OR fez_closer OR ganho) AS m_sdr,
                   COUNT(*) FILTER (WHERE fez_sdr OR marcou_closer OR fez_closer OR ganho)               AS f_sdr,
                   COUNT(*) FILTER (WHERE marcou_closer OR fez_closer OR ganho)                          AS m_cl,
                   COUNT(*) FILTER (WHERE fez_closer OR ganho)                                           AS f_cl,
                   COUNT(*) FILTER (WHERE ganho)                                                         AS ganho
            FROM (
                SELECT
                    CASE WHEN 'faixa'      = ANY(v_dims) THEN faixa      END AS g_faixa,
                    CASE WHEN 'convidados' = ANY(v_dims) THEN convidados END AS g_conv,
                    CASE WHEN 'destino'    = ANY(v_dims) THEN destino    END AS g_dest,
                    marcou_sdr, fez_sdr, marcou_closer, fez_closer, ganho
                FROM _ww_combo_pool
                WHERE (NOT ('faixa'      = ANY(v_dims)) OR faixa      IS NOT NULL)
                  AND (NOT ('convidados' = ANY(v_dims)) OR convidados IS NOT NULL)
                  AND (NOT ('destino'    = ANY(v_dims)) OR destino    IS NOT NULL)
            ) sel
            GROUP BY g_faixa, g_conv, g_dest
        ) grp
        ORDER BY score DESC, entrou DESC
        LIMIT 500
    ) r;

    DROP TABLE _ww_combo_pool;

    RETURN json_build_object(
        'dimensoes', v_dims,
        'periodo', json_build_object('date_start', p_date_start, 'date_end', p_date_end, 'date_mode', p_date_mode),
        'total_no_periodo', v_total,
        'rows', COALESCE(v_rows, '[]'::JSON)
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_funil_ranking_combo(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID, TEXT[], TEXT[], TEXT[], UUID[]) TO authenticated;
