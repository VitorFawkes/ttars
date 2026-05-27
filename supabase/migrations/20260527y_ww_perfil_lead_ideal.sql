-- ============================================================================
-- Analytics-Weddings — Correção Onda 4: ww_perfil_lead_ideal
--
-- Pergunta que responde:
--   "O perfil de lead que historicamente FECHA contrato é o mesmo perfil dos
--    leads que estão ENTRANDO agora?"
--
-- Compara duas janelas temporais DISTINTAS:
--   - Histórico: leads que fecharam nos últimos N meses (referência)
--     Para cada um, olha a info que ELE preencheu NO MOMENTO DE ENTRAR
--     (investimento declarado, convidados declarados, destino declarado).
--   - Atual: leads que ENTRARAM no período do filtro da página.
--
-- 3 dimensões: investimento (faixa), convidados, destino.
--
-- Lift = atual_pct / historico_pct (acima de 1 = pipeline tem mais dessa
-- categoria do que historicamente; abaixo de 1 = menos dessa categoria).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww_perfil_lead_ideal(
    p_atual_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '30 days'),
    p_atual_end   TIMESTAMPTZ DEFAULT NOW(),
    p_org_id      UUID DEFAULT NULL,
    p_historico_meses INT DEFAULT 12,
    p_min_amostra INT DEFAULT 2
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_hist_start TIMESTAMPTZ;
    v_total_hist INT := 0;
    v_total_atual INT := 0;
    v_comparacoes JSON;
    v_min INT := GREATEST(1, COALESCE(p_min_amostra, 2));
    v_meses INT := GREATEST(0, COALESCE(p_historico_meses, 12));
BEGIN
    SELECT id INTO v_pipeline_id FROM pipelines WHERE produto::TEXT='WEDDING' AND org_id=v_org_id LIMIT 1;
    IF v_pipeline_id IS NULL THEN RETURN json_build_object('error','pipeline WEDDING não encontrado'); END IF;

    -- Janela do histórico: últimos N meses de fechamentos. Se p_historico_meses=0,
    -- significa "todo o histórico" (não aplica limite inferior).
    IF v_meses = 0 THEN
      v_hist_start := '1970-01-01'::timestamptz;
    ELSE
      v_hist_start := NOW() - (v_meses || ' months')::interval;
    END IF;

    -- ── HISTÓRICO: leads que fecharam dentro da janela de referência
    -- Filtro: ww_closer_data_ganho dentro da janela.
    -- Lê info da ENTRADA (form do site preenchido lá atrás).
    CREATE TEMP TABLE _ww_pli_h ON COMMIT DROP AS
    SELECT _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form')    AS destino,
           _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS convidados
      FROM cards c
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND NULLIF(c.produto_data->>'ww_closer_data_ganho','')::TIMESTAMPTZ >= v_hist_start;

    -- ── ATUAL: leads criados no período do filtro
    CREATE TEMP TABLE _ww_pli_a ON COMMIT DROP AS
    SELECT _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa,
           _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form')    AS destino,
           _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS convidados
      FROM cards c
     WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
       AND c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
       AND c.created_at >= p_atual_start AND c.created_at <= p_atual_end;

    SELECT COUNT(*) INTO v_total_hist FROM _ww_pli_h;
    SELECT COUNT(*) INTO v_total_atual FROM _ww_pli_a;

    -- Coberturas por dimensão
    WITH dims AS (
      SELECT 'faixa'      AS dim, faixa        AS cat FROM _ww_pli_h WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino',     destino       FROM _ww_pli_h WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados',  convidados    FROM _ww_pli_h WHERE convidados IS NOT NULL
    ),
    dims_a AS (
      SELECT 'faixa'      AS dim, faixa        AS cat FROM _ww_pli_a WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino',     destino       FROM _ww_pli_a WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados',  convidados    FROM _ww_pli_a WHERE convidados IS NOT NULL
    ),
    tot_h AS (SELECT dim, COUNT(*) AS total FROM dims GROUP BY dim),
    tot_a AS (SELECT dim, COUNT(*) AS total FROM dims_a GROUP BY dim),
    by_h  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims GROUP BY dim, cat),
    by_a  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims_a GROUP BY dim, cat),
    cats AS (
      SELECT DISTINCT dim, cat FROM (
        SELECT dim, cat FROM by_h
        UNION ALL SELECT dim, cat FROM by_a
      ) z
    ),
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
          'historico_qtd', historico_qtd,
          'historico_pct', historico_pct,
          'atual_qtd', atual_qtd,
          'atual_pct', atual_pct,
          -- Lift > 1 = pipeline atual tem MAIS dessa categoria que o histórico
          -- Lift < 1 = pipeline atual tem MENOS dessa categoria que o histórico
          'lift', CASE
                    WHEN historico_pct IS NULL OR historico_pct = 0 THEN NULL
                    WHEN atual_pct IS NULL THEN NULL
                    ELSE ROUND((atual_pct / historico_pct)::numeric, 2)
                  END,
          -- Delta pp = atual_pct - historico_pct (diferença em pontos percentuais)
          'delta_pp', CASE
                        WHEN historico_pct IS NULL OR atual_pct IS NULL THEN NULL
                        ELSE ROUND((atual_pct - historico_pct)::numeric, 1)
                      END
        ) ORDER BY historico_qtd DESC, atual_qtd DESC
      ) AS dados
        FROM rows
       WHERE historico_qtd >= v_min OR atual_qtd >= v_min
       GROUP BY dim
    ) g;

    DROP TABLE _ww_pli_h;
    DROP TABLE _ww_pli_a;

    RETURN json_build_object(
      'atual_start', p_atual_start, 'atual_end', p_atual_end,
      'historico_start', v_hist_start, 'historico_end', NOW(),
      'historico_meses', v_meses,
      'pipeline_id', v_pipeline_id, 'org_id', v_org_id,
      'min_amostra', v_min,
      'total_historico', v_total_hist,
      'total_atual', v_total_atual,
      'comparacoes', v_comparacoes
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_perfil_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, INT, INT) TO authenticated;
