-- ============================================================================
-- Analytics-Weddings — Onda 4: ww_perfil_compare
--
-- Responde a pergunta: "o tipo de lead que ENTRA agora continua sendo o tipo
-- que FECHA agora?"
--
-- Universos:
--   - Entrada:    leads criados no período (created_at)
--   - Fechamento: vendas com ww_closer_data_ganho dentro do período (independente
--                 de quando o lead entrou)
--
-- Para cada dimensão (faixa, destino, convidados, origem, tipo, utm_medium,
-- utm_campaign), retorna distribuição % de cada universo + lift por categoria.
-- Lift > 1 = categoria sobre-representada nos fechamentos (fecha mais que a média).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww_perfil_compare(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '180 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id     UUID DEFAULT NULL,
    p_min_amostra INT DEFAULT 2
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_total_entrada INT;
    v_total_fechamento INT;
    v_cobertura_entrada JSON;
    v_cobertura_fechamento JSON;
    v_comparacoes JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 2));
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    -- Universo ENTRADA: cards criados no período
    CREATE TEMP TABLE _ww_pc_e ON COMMIT DROP AS
    SELECT c.id,
           _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form')    AS destino,
           _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS convidados,
           _ww2_norm_origem(c.marketing_data) AS origem,
           _ww_norm_tipo(c.produto_data->>'ww_tipo_casamento') AS tipo,
           COALESCE(
             NULLIF(c.marketing_data->>'utm_medium',''),
             NULLIF(c.marketing_data->'card'->>'utm_medium','')
           ) AS utm_medium,
           COALESCE(
             NULLIF(c.marketing_data->>'utm_campaign',''),
             NULLIF(c.marketing_data->'card'->>'utm_campaign','')
           ) AS utm_campaign
      FROM cards c
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_date_start AND c.created_at <= p_date_end;

    -- Universo FECHAMENTO: cards com ww_closer_data_ganho no período (INDEPENDENTE de quando entrou)
    CREATE TEMP TABLE _ww_pc_f ON COMMIT DROP AS
    SELECT c.id,
           _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form')    AS destino,
           _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS convidados,
           _ww2_norm_origem(c.marketing_data) AS origem,
           _ww_norm_tipo(c.produto_data->>'ww_tipo_casamento') AS tipo,
           COALESCE(
             NULLIF(c.marketing_data->>'utm_medium',''),
             NULLIF(c.marketing_data->'card'->>'utm_medium','')
           ) AS utm_medium,
           COALESCE(
             NULLIF(c.marketing_data->>'utm_campaign',''),
             NULLIF(c.marketing_data->'card'->>'utm_campaign','')
           ) AS utm_campaign
      FROM cards c
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND NULLIF(c.produto_data->>'ww_closer_data_ganho','')::TIMESTAMPTZ >= p_date_start
       AND NULLIF(c.produto_data->>'ww_closer_data_ganho','')::TIMESTAMPTZ <= p_date_end;

    SELECT COUNT(*) INTO v_total_entrada FROM _ww_pc_e;
    SELECT COUNT(*) INTO v_total_fechamento FROM _ww_pc_f;

    SELECT json_build_object(
      'total', v_total_entrada,
      'com_faixa',     COUNT(*) FILTER (WHERE faixa IS NOT NULL),
      'com_destino',   COUNT(*) FILTER (WHERE destino IS NOT NULL),
      'com_convidados',COUNT(*) FILTER (WHERE convidados IS NOT NULL),
      'com_origem',    COUNT(*) FILTER (WHERE origem IS NOT NULL),
      'com_tipo',      COUNT(*) FILTER (WHERE tipo IS NOT NULL),
      'com_medium',    COUNT(*) FILTER (WHERE utm_medium IS NOT NULL),
      'com_campaign',  COUNT(*) FILTER (WHERE utm_campaign IS NOT NULL)
    ) INTO v_cobertura_entrada FROM _ww_pc_e;

    SELECT json_build_object(
      'total', v_total_fechamento,
      'com_faixa',     COUNT(*) FILTER (WHERE faixa IS NOT NULL),
      'com_destino',   COUNT(*) FILTER (WHERE destino IS NOT NULL),
      'com_convidados',COUNT(*) FILTER (WHERE convidados IS NOT NULL),
      'com_origem',    COUNT(*) FILTER (WHERE origem IS NOT NULL),
      'com_tipo',      COUNT(*) FILTER (WHERE tipo IS NOT NULL),
      'com_medium',    COUNT(*) FILTER (WHERE utm_medium IS NOT NULL),
      'com_campaign',  COUNT(*) FILTER (WHERE utm_campaign IS NOT NULL)
    ) INTO v_cobertura_fechamento FROM _ww_pc_f;

    -- Comparações por dimensão
    WITH dims AS (
      SELECT 'faixa'      AS dim, faixa        AS cat FROM _ww_pc_e WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino',     destino       FROM _ww_pc_e WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados',  convidados    FROM _ww_pc_e WHERE convidados IS NOT NULL
      UNION ALL SELECT 'origem',      origem        FROM _ww_pc_e WHERE origem IS NOT NULL
      UNION ALL SELECT 'tipo',        tipo          FROM _ww_pc_e WHERE tipo IS NOT NULL
      UNION ALL SELECT 'utm_medium',  utm_medium    FROM _ww_pc_e WHERE utm_medium IS NOT NULL
      UNION ALL SELECT 'utm_campaign',utm_campaign  FROM _ww_pc_e WHERE utm_campaign IS NOT NULL
    ),
    dims_f AS (
      SELECT 'faixa'      AS dim, faixa        AS cat FROM _ww_pc_f WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino',     destino       FROM _ww_pc_f WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados',  convidados    FROM _ww_pc_f WHERE convidados IS NOT NULL
      UNION ALL SELECT 'origem',      origem        FROM _ww_pc_f WHERE origem IS NOT NULL
      UNION ALL SELECT 'tipo',        tipo          FROM _ww_pc_f WHERE tipo IS NOT NULL
      UNION ALL SELECT 'utm_medium',  utm_medium    FROM _ww_pc_f WHERE utm_medium IS NOT NULL
      UNION ALL SELECT 'utm_campaign',utm_campaign  FROM _ww_pc_f WHERE utm_campaign IS NOT NULL
    ),
    tot_e AS (SELECT dim, COUNT(*) AS total FROM dims GROUP BY dim),
    tot_f AS (SELECT dim, COUNT(*) AS total FROM dims_f GROUP BY dim),
    by_e  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims GROUP BY dim, cat),
    by_f  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims_f GROUP BY dim, cat),
    -- Outer join pra categorias que aparecem em qualquer um dos dois universos
    cats AS (
      SELECT DISTINCT dim, cat FROM (
        SELECT dim, cat FROM by_e
        UNION ALL SELECT dim, cat FROM by_f
      ) z
    ),
    rows AS (
      SELECT c.dim, c.cat,
             COALESCE(e.qtd, 0) AS entrada_qtd,
             COALESCE(f.qtd, 0) AS fechou_qtd,
             CASE WHEN te.total > 0 THEN ROUND(100.0 * COALESCE(e.qtd,0) / te.total, 1) END AS entrada_pct,
             CASE WHEN tf.total > 0 THEN ROUND(100.0 * COALESCE(f.qtd,0) / tf.total, 1) END AS fechou_pct
        FROM cats c
        LEFT JOIN by_e e ON e.dim=c.dim AND e.cat=c.cat
        LEFT JOIN by_f f ON f.dim=c.dim AND f.cat=c.cat
        LEFT JOIN tot_e te ON te.dim=c.dim
        LEFT JOIN tot_f tf ON tf.dim=c.dim
    )
    SELECT COALESCE(json_agg(
      json_build_object(
        'dimensao', dim,
        'dados', dados
      )
    ), '[]'::JSON) INTO v_comparacoes
    FROM (
      SELECT dim, json_agg(
        json_build_object(
          'categoria', cat,
          'entrada_qtd', entrada_qtd,
          'entrada_pct', entrada_pct,
          'fechou_qtd', fechou_qtd,
          'fechou_pct', fechou_pct,
          'lift', CASE
                    WHEN entrada_pct IS NULL OR entrada_pct = 0 THEN NULL
                    WHEN fechou_pct IS NULL THEN NULL
                    ELSE ROUND((fechou_pct / entrada_pct)::numeric, 2)
                  END
        ) ORDER BY entrada_qtd DESC, fechou_qtd DESC
      ) AS dados
        FROM rows
       WHERE entrada_qtd >= v_min OR fechou_qtd >= 1
       GROUP BY dim
    ) g;

    DROP TABLE _ww_pc_e;
    DROP TABLE _ww_pc_f;

    RETURN json_build_object(
      'date_start', p_date_start, 'date_end', p_date_end,
      'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
      'min_amostra', v_min,
      'entrada', v_cobertura_entrada,
      'fechamento', v_cobertura_fechamento,
      'comparacoes', v_comparacoes
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_perfil_compare(TIMESTAMPTZ, TIMESTAMPTZ, UUID, INT) TO authenticated;
