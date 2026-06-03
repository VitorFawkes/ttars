-- 20260603b — ww_v2_lead_ideal: filtros DE VERDADE (#6 reportado pelo Vitor).
--
-- BUG: a aba Perfil (Lead ideal × Pipeline) mostrava pills de origem/faixa/destino/convidados/
-- consultor, mas a RPC só aceitava datas → filtros decorativos. Agora a RPC aceita os 5 filtros
-- e os aplica aos DOIS lados (histórico = quem fechou; atual = quem entra), permitindo recortes
-- ("dentro de Nordeste, como o perfil de quem entra difere de quem fechou?").
--
-- VERIFICAÇÃO REBASE (TOP 5 #5): parte da 20260602n (def viva, lê ww_funil_casal). Só ADICIONA
-- 5 parâmetros (origins/consultor_ids/faixas/destinos/convidados) e os WHERE nos 2 temp tables.
-- Toda a lógica de comparação/lift/cruzamentos/top é idêntica. Nada revertido.

DROP FUNCTION IF EXISTS public.ww_v2_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT);

CREATE FUNCTION public.ww_v2_lead_ideal(
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
    p_convidados      TEXT[] DEFAULT NULL
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
    v_comparacoes JSON;
    v_cruzamentos JSON;
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

    -- HISTÓRICO: casais que FECHARAM (ww_funil_casal, ganho) — com filtros de segmento
    CREATE TEMP TABLE _ww_v2_pli_h ON COMMIT DROP AS
    SELECT faixa, destino, convidados
      FROM ww_funil_casal
     WHERE org_id = v_org_id AND ganho = TRUE
       AND (ganho_at IS NULL OR (ganho_at >= v_hist_start AND ganho_at <= v_hist_end))
       AND (p_origins IS NULL       OR origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR consultor_id = ANY(p_consultor_ids))
       AND (p_faixas IS NULL        OR faixa = ANY(p_faixas))
       AND (p_destinos IS NULL      OR destino = ANY(p_destinos))
       AND (p_convidados IS NULL    OR convidados = ANY(p_convidados));

    -- ATUAL: leads novos no período (ww_funil_casal) — com os MESMOS filtros de segmento
    CREATE TEMP TABLE _ww_v2_pli_a ON COMMIT DROP AS
    SELECT faixa, destino, convidados
      FROM ww_funil_casal
     WHERE org_id = v_org_id
       AND lead_created_at >= p_atual_start AND lead_created_at <= p_atual_end
       AND (p_origins IS NULL       OR origem = ANY(p_origins))
       AND (p_consultor_ids IS NULL OR consultor_id = ANY(p_consultor_ids))
       AND (p_faixas IS NULL        OR faixa = ANY(p_faixas))
       AND (p_destinos IS NULL      OR destino = ANY(p_destinos))
       AND (p_convidados IS NULL    OR convidados = ANY(p_convidados));

    SELECT COUNT(*) INTO v_total_hist  FROM _ww_v2_pli_h;
    SELECT COUNT(*) INTO v_total_atual FROM _ww_v2_pli_a;

    WITH dims AS (
      SELECT 'faixa' AS dim, faixa AS cat FROM _ww_v2_pli_h WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino', destino FROM _ww_v2_pli_h WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados', convidados FROM _ww_v2_pli_h WHERE convidados IS NOT NULL
    ),
    dims_a AS (
      SELECT 'faixa' AS dim, faixa AS cat FROM _ww_v2_pli_a WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino', destino FROM _ww_v2_pli_a WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados', convidados FROM _ww_v2_pli_a WHERE convidados IS NOT NULL
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

    SELECT json_build_object(
      'faixa_x_convidados', (
        WITH h AS (SELECT faixa AS x, convidados AS y, COUNT(*) AS qtd FROM _ww_v2_pli_h WHERE faixa IS NOT NULL AND convidados IS NOT NULL GROUP BY faixa, convidados),
             a AS (SELECT faixa AS x, convidados AS y, COUNT(*) AS qtd FROM _ww_v2_pli_a WHERE faixa IS NOT NULL AND convidados IS NOT NULL GROUP BY faixa, convidados),
             cells AS (SELECT DISTINCT x, y FROM (SELECT x, y FROM h UNION ALL SELECT x, y FROM a) z)
        SELECT COALESCE(json_agg(json_build_object(
          'x', cells.x, 'y', cells.y,
          'hist_qtd', COALESCE(h.qtd, 0),
          'hist_pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / v_total_hist, 1) END,
          'atual_qtd', COALESCE(a.qtd, 0),
          'atual_pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / v_total_atual, 1) END
        )), '[]'::JSON)
        FROM cells LEFT JOIN h ON h.x = cells.x AND h.y = cells.y LEFT JOIN a ON a.x = cells.x AND a.y = cells.y
      ),
      'faixa_x_destino', (
        WITH h AS (SELECT faixa AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_h WHERE faixa IS NOT NULL AND destino IS NOT NULL GROUP BY faixa, destino),
             a AS (SELECT faixa AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_a WHERE faixa IS NOT NULL AND destino IS NOT NULL GROUP BY faixa, destino),
             cells AS (SELECT DISTINCT x, y FROM (SELECT x, y FROM h UNION ALL SELECT x, y FROM a) z)
        SELECT COALESCE(json_agg(json_build_object(
          'x', cells.x, 'y', cells.y,
          'hist_qtd', COALESCE(h.qtd, 0),
          'hist_pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / v_total_hist, 1) END,
          'atual_qtd', COALESCE(a.qtd, 0),
          'atual_pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / v_total_atual, 1) END
        )), '[]'::JSON)
        FROM cells LEFT JOIN h ON h.x = cells.x AND h.y = cells.y LEFT JOIN a ON a.x = cells.x AND a.y = cells.y
      ),
      'convidados_x_destino', (
        WITH h AS (SELECT convidados AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_h WHERE convidados IS NOT NULL AND destino IS NOT NULL GROUP BY convidados, destino),
             a AS (SELECT convidados AS x, destino AS y, COUNT(*) AS qtd FROM _ww_v2_pli_a WHERE convidados IS NOT NULL AND destino IS NOT NULL GROUP BY convidados, destino),
             cells AS (SELECT DISTINCT x, y FROM (SELECT x, y FROM h UNION ALL SELECT x, y FROM a) z)
        SELECT COALESCE(json_agg(json_build_object(
          'x', cells.x, 'y', cells.y,
          'hist_qtd', COALESCE(h.qtd, 0),
          'hist_pct', CASE WHEN v_total_hist > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / v_total_hist, 1) END,
          'atual_qtd', COALESCE(a.qtd, 0),
          'atual_pct', CASE WHEN v_total_atual > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / v_total_atual, 1) END
        )), '[]'::JSON)
        FROM cells LEFT JOIN h ON h.x = cells.x AND h.y = cells.y LEFT JOIN a ON a.x = cells.x AND a.y = cells.y
      )
    ) INTO v_cruzamentos;

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
      'filtros_aplicados', json_build_object('origins',p_origins,'consultor_ids',p_consultor_ids,'faixas',p_faixas,'destinos',p_destinos,'convidados',p_convidados),
      'total_historico', v_total_hist,
      'total_atual', v_total_atual,
      'comparacoes', v_comparacoes,
      'cruzamentos', v_cruzamentos,
      'top_perfis_historico', v_top_perfis_hist,
      'top_perfis_atual', v_top_perfis_atual
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_v2_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, TEXT[], UUID[], TEXT[], TEXT[], TEXT[]) TO authenticated;
