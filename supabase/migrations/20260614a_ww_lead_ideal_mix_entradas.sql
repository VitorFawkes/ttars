-- Lead Ideal × Pipeline (Weddings) — adiciona o "mix de leads": quem ENTRAVA antes × quem ENTRA agora.
--
-- Hoje a aba compara o perfil de QUEM FECHOU (referência) com o dos leads que entram agora.
-- Gestor pediu uma 2ª visão lado a lado: comparar a QUANTIDADE de leads que ENTRARAM no período
-- de referência (independente de fechar) com a quantidade que entra agora — cada lado como % do
-- total de leads do seu período (soma 100%).
--
-- Mudança ADITIVA e retrocompatível (lado "agora" reaproveita atual_qtd/atual_pct):
--   • novo conjunto _ww_v2_pli_he = leads que entraram na janela de referência (lead_created_at)
--   • cada item de `comparacoes` ganha historico_leads_qtd / historico_leads_pct / lift_entradas
--   • novo total_historico_leads no topo
-- Base: estado REAL de produção (pg_get_functiondef) — não migrations antigas (branch divergente).
-- Gerado por inserção cirúrgica sobre a def viva: linhas existentes byte-idênticas ao que está no ar.

CREATE OR REPLACE FUNCTION public.ww_v2_lead_ideal(p_atual_start timestamp with time zone DEFAULT (now() - '30 days'::interval), p_atual_end timestamp with time zone DEFAULT now(), p_org_id uuid DEFAULT NULL::uuid, p_historico_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_historico_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_historico_meses integer DEFAULT 12, p_min_amostra integer DEFAULT 2, p_origins text[] DEFAULT NULL::text[], p_consultor_ids uuid[] DEFAULT NULL::uuid[], p_faixas text[] DEFAULT NULL::text[], p_destinos text[] DEFAULT NULL::text[], p_convidados text[] DEFAULT NULL::text[], p_tipos text[] DEFAULT NULL::text[], p_sdr_canal text[] DEFAULT NULL::text[], p_closer_canal text[] DEFAULT NULL::text[], p_referencia text DEFAULT 'ganho'::text, p_cruz_x text DEFAULT 'faixa'::text, p_cruz_y text DEFAULT 'convidados'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_pipeline_id UUID;
    v_hist_start TIMESTAMPTZ;
    v_hist_end   TIMESTAMPTZ;
    v_total_hist INT := 0;
    v_total_atual INT := 0;
    v_total_hist_leads INT := 0;   -- NOVO: total de leads que ENTRARAM na janela de referência
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

    -- NOVO — leads que ENTRARAM na janela de referência (mesmos filtros do "atual", janela histórica).
    -- Universo = entrada (lead_created_at), independe de fechar/perder. É o lado esquerdo do "mix de leads".
    CREATE TEMP TABLE _ww_v2_pli_he ON COMMIT DROP AS
    SELECT faixa, destino, convidados, tipo, origem,
           _ww_norm_canal_strict(sdr_canal)    AS canal_sdr,
           _ww_norm_canal_strict(closer_canal) AS canal_closer
      FROM ww_funil_casal
     WHERE org_id = v_org_id
       AND lead_created_at >= v_hist_start AND lead_created_at <= v_hist_end
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
    SELECT COUNT(*) INTO v_total_hist_leads FROM _ww_v2_pli_he;   -- NOVO

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
    dims_he AS (  -- NOVO: leads que entraram na janela de referência
      SELECT 'faixa' AS dim, faixa AS cat FROM _ww_v2_pli_he WHERE faixa IS NOT NULL
      UNION ALL SELECT 'destino', destino FROM _ww_v2_pli_he WHERE destino IS NOT NULL
      UNION ALL SELECT 'convidados', convidados FROM _ww_v2_pli_he WHERE convidados IS NOT NULL
      UNION ALL SELECT 'tipo', tipo FROM _ww_v2_pli_he WHERE tipo IS NOT NULL
      UNION ALL SELECT 'origem', origem FROM _ww_v2_pli_he WHERE origem IS NOT NULL
      UNION ALL SELECT 'canal_sdr', canal_sdr FROM _ww_v2_pli_he WHERE canal_sdr IS NOT NULL
      UNION ALL SELECT 'canal_closer', canal_closer FROM _ww_v2_pli_he WHERE canal_closer IS NOT NULL
    ),
    tot_h AS (SELECT dim, COUNT(*) AS total FROM dims GROUP BY dim),
    tot_a AS (SELECT dim, COUNT(*) AS total FROM dims_a GROUP BY dim),
    tot_he AS (SELECT dim, COUNT(*) AS total FROM dims_he GROUP BY dim),  -- NOVO
    by_h  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims GROUP BY dim, cat),
    by_a  AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims_a GROUP BY dim, cat),
    by_he AS (SELECT dim, cat, COUNT(*) AS qtd FROM dims_he GROUP BY dim, cat),  -- NOVO
    cats AS (SELECT DISTINCT dim, cat FROM (SELECT dim, cat FROM by_h UNION ALL SELECT dim, cat FROM by_a UNION ALL SELECT dim, cat FROM by_he) z),  -- NOVO inclui mix
    rows AS (
      SELECT c.dim, c.cat,
             COALESCE(h.qtd, 0) AS historico_qtd,
             COALESCE(a.qtd, 0) AS atual_qtd,
             COALESCE(he.qtd, 0) AS historico_leads_qtd,   -- NOVO
             CASE WHEN th.total > 0 THEN ROUND(100.0 * COALESCE(h.qtd,0) / th.total, 1) END AS historico_pct,
             CASE WHEN ta.total > 0 THEN ROUND(100.0 * COALESCE(a.qtd,0) / ta.total, 1) END AS atual_pct,
             CASE WHEN the.total > 0 THEN ROUND(100.0 * COALESCE(he.qtd,0) / the.total, 1) END AS historico_leads_pct   -- NOVO
        FROM cats c
        LEFT JOIN by_h h ON h.dim=c.dim AND h.cat=c.cat
        LEFT JOIN by_a a ON a.dim=c.dim AND a.cat=c.cat
        LEFT JOIN by_he he ON he.dim=c.dim AND he.cat=c.cat   -- NOVO
        LEFT JOIN tot_h th ON th.dim=c.dim
        LEFT JOIN tot_a ta ON ta.dim=c.dim
        LEFT JOIN tot_he the ON the.dim=c.dim                 -- NOVO
    )
    SELECT COALESCE(json_agg(json_build_object('dimensao', dim, 'dados', dados)), '[]'::JSON) INTO v_comparacoes
    FROM (
      SELECT dim, json_agg(json_build_object(
          'categoria', cat,
          'historico_qtd', historico_qtd, 'historico_pct', historico_pct,
          'atual_qtd', atual_qtd, 'atual_pct', atual_pct,
          'historico_leads_qtd', historico_leads_qtd, 'historico_leads_pct', historico_leads_pct,   -- NOVO
          'lift', CASE WHEN historico_pct IS NULL OR historico_pct = 0 OR atual_pct IS NULL THEN NULL
                       ELSE ROUND((atual_pct / historico_pct)::numeric, 2) END,
          'delta_pp', CASE WHEN historico_pct IS NULL OR atual_pct IS NULL THEN NULL
                          ELSE ROUND((atual_pct - historico_pct)::numeric, 1) END,
          'lift_entradas', CASE WHEN historico_leads_pct IS NULL OR historico_leads_pct = 0 OR atual_pct IS NULL THEN NULL
                                ELSE ROUND((atual_pct / historico_leads_pct)::numeric, 2) END   -- NOVO: agora ÷ antes (mix)
        ) ORDER BY historico_qtd DESC, atual_qtd DESC) AS dados
        FROM rows WHERE historico_qtd >= v_min OR atual_qtd >= v_min OR historico_leads_qtd >= v_min   -- NOVO
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
    DROP TABLE _ww_v2_pli_he;   -- NOVO

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
      'total_historico_leads', v_total_hist_leads,   -- NOVO
      'comparacoes', v_comparacoes,
      'cruzamento', v_cruzamento,
      'top_perfis_historico', v_top_perfis_hist,
      'top_perfis_atual', v_top_perfis_atual
    );
END $function$;

-- Segurança (preserva ACL atual: authenticated + service_role, sem anon/PUBLIC).
REVOKE EXECUTE ON FUNCTION public.ww_v2_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ww_v2_lead_ideal(TIMESTAMPTZ, TIMESTAMPTZ, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT, TEXT[], UUID[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT[], TEXT, TEXT, TEXT) TO authenticated, service_role;
