-- ════════════════════════════════════════════════════════════════════════════
-- 20260630b — Diretoria/Operação: filtro por tipo de casamento (DW · Elopement)
-- ────────────────────────────────────────────────────────────────────────────
-- Adiciona p_tipo ('DW' | 'Elopement' | NULL=todos) a ww_diretoria_overview e
-- ww_diretoria_tempos. A classificação normalizada segue EXATAMENTE a lógica de
-- v_tipo da view ww_funil_casal_native (ILIKE elopement/elopment, ou título que
-- começa com "elopement" quando o campo está vazio → 'Elopement'; senão 'DW').
-- Partes que leem a view filtram pela coluna `tipo`; partes que leem cards usam
-- o mesmo CASE inline (ou a coluna tipo da view via join).
--
-- REBASE SEGURO (SQL_SOP): corpo das duas funções copiado de pg_get_functiondef
-- VIVO em 30/06 — já contém TODAS as correções incrementais (overview 20260626a→b;
-- tempos 20260626c→e). A ÚNICA diferença é: +parâmetro p_tipo e +linhas de filtro
-- por tipo. Nenhuma correção anterior foi revertida.
-- DROP + CREATE (não CREATE OR REPLACE) é OBRIGATÓRIO aqui: a assinatura ganha um
-- parâmetro, e CREATE OR REPLACE não altera a lista de parâmetros (criaria um
-- overload ambíguo no PostgREST). Sem dependências de banco nessas funções (só o
-- frontend as chama), então o DROP é seguro.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS ww_diretoria_overview(uuid, timestamptz, timestamptz, integer);

CREATE FUNCTION public.ww_diretoria_overview(
  p_org_id     uuid        DEFAULT NULL::uuid,
  p_date_start timestamptz DEFAULT NULL::timestamptz,
  p_date_end   timestamptz DEFAULT NULL::timestamptz,
  p_max_deals  integer     DEFAULT 1500,
  p_tipo       text        DEFAULT NULL::text
) RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id      uuid        := COALESCE(p_org_id, requesting_org_id());
  v_pipeline_id uuid;
  v_end         timestamptz := COALESCE(p_date_end, now());
  v_start       timestamptz := COALESCE(p_date_start, date_trunc('month', now()));
  v_span        interval;
  v_prev_start  timestamptz;
  v_fases       json;
BEGIN
  SELECT id INTO v_pipeline_id
    FROM pipelines
   WHERE produto::text = 'WEDDING' AND org_id = v_org_id
   LIMIT 1;
  IF v_pipeline_id IS NULL THEN
    RETURN json_build_object('error', 'Pipeline WEDDING não encontrado');
  END IF;

  v_span       := v_end - v_start;
  v_prev_start := v_start - v_span;

  WITH macro_def(key, label, sub, ord) AS (
    VALUES
      ('sdr',          'SDR',          'Pré-venda',  1),
      ('closer',       'Closer',       'Fechamento', 2),
      ('planejamento', 'Planejamento', 'Pós-venda',  3),
      ('producao',     'Produção',     'Execução',   4)
  ),
  stage_macro AS (
    SELECT s.id AS stage_id, s.nome AS stage_name,
           CASE
             WHEN ph.slug = 'sdr'                                  THEN 'sdr'
             WHEN ph.slug = 'closer'                               THEN 'closer'
             WHEN ph.slug = 'pos_venda' AND s.nome ILIKE 'produ%'  THEN 'producao'
             WHEN ph.slug = 'pos_venda'                            THEN 'planejamento'
             ELSE NULL
           END AS macro
      FROM pipeline_stages s
      JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE s.pipeline_id = v_pipeline_id
       AND COALESCE(s.is_lost, false) = false
  ),
  deals AS (
    SELECT sm.macro,
           c.id        AS card_id,
           c.titulo,
           COALESCE(c.valor_final, c.valor_estimado, 0)::numeric AS valor,
           sm.stage_name,
           COALESCE(NULLIF(c.produto_data->>'ww_destino', ''),            NULLIF(c.produto_data->>'ww_mkt_destino_form', ''))   AS destino,
           COALESCE(NULLIF(c.produto_data->>'ww_orcamento_faixa', ''),    NULLIF(c.produto_data->>'ww_mkt_orcamento_form', '')) AS faixa,
           COALESCE(NULLIF(c.produto_data->>'ww_convidados_refinado', ''),NULLIF(c.produto_data->>'ww_mkt_convidados_form', ''))AS convidados,
           NULLIF(c.produto_data->>'ww_tipo_casamento', '') AS tipo,
           NULLIF(c.produto_data->>'ww_data_casamento', '') AS data_casamento,
           pr.nome      AS responsavel,
           c.created_at AS entrou_at
      FROM cards c
      JOIN stage_macro sm ON sm.stage_id = c.pipeline_stage_id
      LEFT JOIN profiles pr ON pr.id = c.dono_atual_id
     WHERE c.deleted_at  IS NULL
       AND c.archived_at IS NULL
       AND c.produto::text = 'WEDDING'
       AND c.org_id = v_org_id
       AND sm.macro IS NOT NULL
       AND c.test_agent_id IS NULL
       AND c.titulo NOT ILIKE '%teste%'
       AND c.titulo NOT ILIKE '%audit%'
       AND NOT (c.external_id IS NULL AND (c.titulo ILIKE '%(via sofia)%' OR lower(btrim(c.titulo)) = 'mcqueen'))
       -- 20260630b: filtro por tipo (mesma classificação de v_tipo da view native)
       AND (p_tipo IS NULL OR
            (CASE
               WHEN COALESCE(c.produto_data->>'ww_tipo_casamento','') ILIKE '%elopement%'
                 OR COALESCE(c.produto_data->>'ww_tipo_casamento','') ILIKE '%elopment%' THEN 'Elopement'
               WHEN COALESCE(c.produto_data->>'ww_tipo_casamento','') = '' AND c.titulo ILIKE 'elopement%' THEN 'Elopement'
               ELSE 'DW'
             END) = p_tipo)
  ),
  deals_ranked AS (
    SELECT d.*,
           row_number() OVER (PARTITION BY d.macro ORDER BY d.valor DESC NULLS LAST, d.card_id) AS rn
      FROM deals d
  ),
  snap AS (
    SELECT macro,
           COUNT(*)::int                    AS count,
           COALESCE(SUM(valor), 0)::numeric AS valor_total,
           COALESCE(
             json_agg(
               json_build_object(
                 'card_id',        card_id,
                 'titulo',         titulo,
                 'valor',          valor,
                 'stage_name',     stage_name,
                 'destino',        destino,
                 'faixa',          faixa,
                 'convidados',     convidados,
                 'tipo',           tipo,
                 'data_casamento', data_casamento,
                 'responsavel',    responsavel,
                 'entrou_at',      entrou_at
               )
               ORDER BY valor DESC NULLS LAST, card_id
             ) FILTER (WHERE rn <= p_max_deals),
             '[]'::json
           ) AS deals
      FROM deals_ranked
     GROUP BY macro
  ),
  -- 20260630b: FUNIL POR COORTE. Antes dividia contagens INDEPENDENTES por etapa
  -- (quem ENTROU em cada etapa no período, grupos diferentes) → o "% seguiram" não
  -- acompanhava as MESMAS pessoas. Agora fixa a coorte = leads criados no período e
  -- mede quantos DELES alcançaram cada etapa seguinte. reached_* é monotônico (cada
  -- um inclui os de jusante), então os estágios AFUNILAM: sdr ≥ closer ≥ planej ≥ prod.
  fluxo AS (
    SELECT
      COUNT(*) FILTER (WHERE coorte_now)                     AS sdr_now,
      COUNT(*) FILTER (WHERE coorte_now AND reached_closer)  AS closer_now,
      COUNT(*) FILTER (WHERE coorte_now AND reached_planej)  AS planej_now,
      COUNT(*) FILTER (WHERE coorte_now AND reached_prod)    AS prod_now,
      COUNT(*) FILTER (WHERE coorte_prev)                    AS sdr_prev,
      COUNT(*) FILTER (WHERE coorte_prev AND reached_closer) AS closer_prev,
      COUNT(*) FILTER (WHERE coorte_prev AND reached_planej) AS planej_prev,
      COUNT(*) FILTER (WHERE coorte_prev AND reached_prod)   AS prod_prev
    FROM (
      SELECT
        (lead_created_at >= v_start      AND lead_created_at < v_end)   AS coorte_now,
        (lead_created_at >= v_prev_start AND lead_created_at < v_start) AS coorte_prev,
        (entrou_producao_at IS NOT NULL)                                                AS reached_prod,
        (entrou_planejamento_at IS NOT NULL OR entrou_producao_at IS NOT NULL OR ganho) AS reached_planej,
        (COALESCE(fez_closer, false) OR COALESCE(agendou_closer, false)
           OR entrou_closer_at IS NOT NULL OR entrou_planejamento_at IS NOT NULL
           OR entrou_producao_at IS NOT NULL OR ganho)                                  AS reached_closer
      FROM ww_funil_casal_native
      WHERE org_id = v_org_id
        AND (p_tipo IS NULL OR tipo = p_tipo)   -- 20260630b: filtro por tipo
    ) x
  ),
  metrics AS (
    SELECT md.key, md.label, md.sub, md.ord,
           COALESCE(s.count, 0)          AS count,
           COALESCE(s.valor_total, 0)    AS valor_total,
           COALESCE(s.deals, '[]'::json) AS deals,
           CASE md.key
             WHEN 'sdr'          THEN f.sdr_now
             WHEN 'closer'       THEN f.closer_now
             WHEN 'planejamento' THEN f.planej_now
             WHEN 'producao'     THEN f.prod_now
           END AS entrou_periodo,
           CASE md.key
             WHEN 'sdr'          THEN f.sdr_prev
             WHEN 'closer'       THEN f.closer_prev
             WHEN 'planejamento' THEN f.planej_prev
             WHEN 'producao'     THEN f.prod_prev
           END AS entrou_periodo_prev,
           CASE md.key
             WHEN 'sdr'          THEN CASE WHEN f.sdr_now    > 0 THEN ROUND(100.0 * f.closer_now / f.sdr_now,    1) END
             WHEN 'closer'       THEN CASE WHEN f.closer_now > 0 THEN ROUND(100.0 * f.planej_now / f.closer_now, 1) END
             WHEN 'planejamento' THEN CASE WHEN f.planej_now > 0 THEN ROUND(100.0 * f.prod_now   / f.planej_now, 1) END
             ELSE NULL
           END AS conversao_proxima_pct
      FROM macro_def md
      LEFT JOIN snap s ON s.macro = md.key
      CROSS JOIN fluxo f
  )
  SELECT json_agg(
           json_build_object(
             'key',                  key,
             'label',                label,
             'sub',                  sub,
             'count',                count,
             'valor_total',          valor_total,
             'deals',                deals,
             'entrou_periodo',       entrou_periodo,
             'entrou_periodo_prev',  entrou_periodo_prev,
             'tendencia_pct',        CASE WHEN entrou_periodo_prev > 0
                                          THEN ROUND(100.0 * (entrou_periodo - entrou_periodo_prev) / entrou_periodo_prev, 0)
                                          ELSE NULL END,
             'conversao_proxima_pct', conversao_proxima_pct
           ) ORDER BY ord
         ) INTO v_fases
    FROM metrics;

  RETURN json_build_object(
    'org_id',      v_org_id,
    'pipeline_id', v_pipeline_id,
    'periodo',     json_build_object(
                     'date_start', v_start, 'date_end', v_end,
                     'prev_start', v_prev_start, 'prev_end', v_start
                   ),
    'fases',       COALESCE(v_fases, '[]'::json)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION ww_diretoria_overview(uuid, timestamptz, timestamptz, integer, text) TO authenticated;


-- ── ww_diretoria_tempos + p_tipo (rebase de 20260626e vivo + filtro) ─────────
DROP FUNCTION IF EXISTS ww_diretoria_tempos(uuid, timestamptz, timestamptz);

CREATE FUNCTION ww_diretoria_tempos(
  p_org_id     uuid        DEFAULT NULL,
  p_date_start timestamptz DEFAULT NULL,
  p_date_end   timestamptz DEFAULT NULL,
  p_tipo       text        DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid        := COALESCE(p_org_id, requesting_org_id());
  v_pipeline_id uuid;
  v_end         timestamptz := COALESCE(p_date_end, now());
  v_start       timestamptz := COALESCE(p_date_start, date_trunc('month', now()));
  v_span        interval;
  v_prev_start  timestamptz;
  v_prev_fech   numeric;
  v_velocidade  json;
  v_dwell_sc    json;
  v_dwell_pv    json;
  v_dwell       json;
  v_aging_sc    json;
  v_aging_pv    json;
  v_aging       json;
BEGIN
  SELECT id INTO v_pipeline_id
    FROM pipelines
   WHERE produto::text = 'WEDDING' AND org_id = v_org_id
   LIMIT 1;
  IF v_pipeline_id IS NULL THEN
    RETURN json_build_object('error', 'Pipeline WEDDING não encontrado');
  END IF;

  v_span       := v_end - v_start;
  v_prev_start := v_start - v_span;

  SELECT ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (ganho_at - lead_created_at)) / 86400.0))::numeric, 1)
    INTO v_prev_fech
    FROM ww_funil_casal_native
   WHERE org_id = v_org_id AND ganho AND ganho_at IS NOT NULL
     AND ganho_at >= lead_created_at
     AND (p_tipo IS NULL OR tipo = p_tipo)
     AND lead_created_at >= v_prev_start AND lead_created_at < v_start;

  WITH d AS (
    SELECT
      CASE WHEN fez_sdr_at    IS NOT NULL AND fez_sdr_at    >= lead_created_at THEN EXTRACT(EPOCH FROM (fez_sdr_at    - lead_created_at)) / 86400.0 END AS lead_sdr,
      CASE WHEN fez_closer_at IS NOT NULL AND fez_closer_at >= lead_created_at THEN EXTRACT(EPOCH FROM (fez_closer_at - lead_created_at)) / 86400.0 END AS lead_closer,
      CASE WHEN ganho AND ganho_at IS NOT NULL AND ganho_at >= lead_created_at THEN EXTRACT(EPOCH FROM (ganho_at - lead_created_at)) / 86400.0 END AS lead_ganho,
      CASE WHEN ganho AND ganho_at IS NOT NULL AND fez_closer_at IS NOT NULL AND ganho_at >= fez_closer_at THEN EXTRACT(EPOCH FROM (ganho_at - fez_closer_at)) / 86400.0 END AS closer_ganho,
      CASE WHEN ganho AND ganho_at IS NOT NULL AND fez_sdr_at    IS NOT NULL AND ganho_at >= fez_sdr_at    THEN EXTRACT(EPOCH FROM (ganho_at - fez_sdr_at))    / 86400.0 END AS sdr_ganho
      FROM ww_funil_casal_native
     WHERE org_id = v_org_id
       AND (p_tipo IS NULL OR tipo = p_tipo)
       AND lead_created_at >= v_start AND lead_created_at < v_end
  )
  SELECT
    json_build_object(
      'lead_para_sdr', json_build_object(
        'amostra',      COUNT(lead_sdr),
        'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lead_sdr))::numeric, 1),
        'p75_dias',     ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY lead_sdr))::numeric, 1)),
      'lead_para_closer', json_build_object(
        'amostra',      COUNT(lead_closer),
        'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lead_closer))::numeric, 1),
        'p75_dias',     ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY lead_closer))::numeric, 1)),
      'lead_para_fechamento', json_build_object(
        'amostra',           COUNT(lead_ganho),
        'mediana_dias',      ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lead_ganho))::numeric, 1),
        'p75_dias',          ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY lead_ganho))::numeric, 1),
        'mediana_prev_dias', v_prev_fech),
      'closer_para_fechamento', json_build_object(
        'amostra',      COUNT(closer_ganho),
        'mediana_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY closer_ganho))::numeric, 1),
        'p75_dias',     ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY closer_ganho))::numeric, 1))
    ),
    json_build_array(
      json_build_object('key', 'sdr', 'label', 'SDR',
        'amostra',      COUNT(lead_sdr),
        'p25_dias',     ROUND((PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY lead_sdr))::numeric, 1),
        'mediana_dias', ROUND((PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY lead_sdr))::numeric, 1),
        'p75_dias',     ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY lead_sdr))::numeric, 1),
        'p90_dias',     ROUND((PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY lead_sdr))::numeric, 1),
        'sem_dados',    COUNT(lead_sdr) = 0),
      json_build_object('key', 'closer', 'label', 'Closer',
        'amostra',      COUNT(sdr_ganho),
        'p25_dias',     ROUND((PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY sdr_ganho))::numeric, 1),
        'mediana_dias', ROUND((PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY sdr_ganho))::numeric, 1),
        'p75_dias',     ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY sdr_ganho))::numeric, 1),
        'p90_dias',     ROUND((PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY sdr_ganho))::numeric, 1),
        'sem_dados',    COUNT(sdr_ganho) = 0)
    )
  INTO v_velocidade, v_dwell_sc
  FROM d;

  WITH pv AS (
    SELECT
      CASE WHEN s.nome ILIKE 'produ%' THEN 'producao' ELSE 'planejamento' END AS macro,
      c.id AS card_id, c.titulo, pr.nome AS responsavel,
      CASE WHEN s.nome ILIKE 'produ%' THEN n.entrou_producao_at ELSE n.entrou_planejamento_at END AS entrou_at
    FROM cards c
    JOIN pipeline_stages s  ON s.id = c.pipeline_stage_id
    JOIN pipeline_phases ph ON ph.id = s.phase_id
    LEFT JOIN ww_funil_casal_native n ON n.contact_id = c.id::text
    LEFT JOIN profiles pr ON pr.id = c.dono_atual_id
    WHERE c.deleted_at  IS NULL
      AND c.archived_at IS NULL
      AND c.produto::text = 'WEDDING'
      AND c.org_id = v_org_id
      AND s.pipeline_id = v_pipeline_id
      AND ph.slug = 'pos_venda'
      AND COALESCE(s.is_lost, false) = false
      AND c.test_agent_id IS NULL
      AND c.titulo NOT ILIKE '%teste%'
      AND c.titulo NOT ILIKE '%audit%'
      AND NOT (c.external_id IS NULL AND (c.titulo ILIKE '%(via sofia)%' OR lower(btrim(c.titulo)) = 'mcqueen'))
      AND (p_tipo IS NULL OR n.tipo = p_tipo)   -- 20260630b: filtro por tipo (coluna da view)
  ),
  pv2 AS (
    SELECT *,
           CASE WHEN entrou_at IS NOT NULL
                THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - entrou_at)) / 86400.0))::int END AS dias
      FROM pv
  ),
  ranked AS (
    SELECT *, row_number() OVER (PARTITION BY macro ORDER BY dias DESC NULLS LAST, card_id) AS rn
      FROM pv2 WHERE dias IS NOT NULL
  ),
  stats AS (
    SELECT macro,
           COUNT(*)::int                              AS total,
           COUNT(dias)::int                           AS com_tempo,
           ROUND((PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY dias))::numeric, 0) AS p25,
           ROUND((PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY dias))::numeric, 0) AS mediana,
           ROUND((PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY dias))::numeric, 0) AS p75,
           ROUND((PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY dias))::numeric, 0) AS p90,
           COUNT(*) FILTER (WHERE dias <= 7)              AS b_ate7,
           COUNT(*) FILTER (WHERE dias BETWEEN 8 AND 30)  AS b8_30,
           COUNT(*) FILTER (WHERE dias BETWEEN 31 AND 60) AS b31_60,
           COUNT(*) FILTER (WHERE dias > 60)              AS b_mais60
      FROM pv2 GROUP BY macro
  ),
  macros AS (
    SELECT * FROM (VALUES ('planejamento','Planejamento'), ('producao','Produção')) AS m(macro, label)
  )
  SELECT
    json_agg(json_build_object(
      'key', m.macro, 'label', m.label,
      'count_aberto', COALESCE(st.total, 0),
      'amostra',      COALESCE(st.com_tempo, 0),
      'p25_dias',     st.p25, 'mediana_dias', st.mediana, 'p75_dias', st.p75, 'p90_dias', st.p90,
      'sem_dados',    COALESCE(st.total, 0) = 0
    ) ORDER BY CASE m.macro WHEN 'planejamento' THEN 1 ELSE 2 END),
    json_agg(json_build_object(
      'key', m.macro, 'label', m.label,
      'amostra',             COALESCE(st.total, 0),
      'com_tempo',           COALESCE(st.com_tempo, 0),
      'mediana_aberto_dias', st.mediana,
      'buckets', CASE WHEN COALESCE(st.com_tempo,0) > 0 THEN json_build_object(
                   'ate_7', st.b_ate7, 'd8_30', st.b8_30, 'd31_60', st.b31_60, 'mais_60', st.b_mais60) END,
      'top_parados', COALESCE((SELECT json_agg(json_build_object('card_id', card_id, 'titulo', titulo, 'dias', dias, 'responsavel', responsavel) ORDER BY dias DESC)
                                 FROM ranked r WHERE r.macro = m.macro AND r.rn <= 5), '[]'::json),
      'sem_dados', COALESCE(st.total, 0) = 0
    ) ORDER BY CASE m.macro WHEN 'planejamento' THEN 1 ELSE 2 END)
  INTO v_dwell_pv, v_aging_pv
  FROM macros m
  LEFT JOIN stats st ON st.macro = m.macro;

  WITH stage_macro AS (
    SELECT s.id AS stage_id,
           CASE WHEN ph.slug = 'sdr' THEN 'sdr' WHEN ph.slug = 'closer' THEN 'closer' ELSE NULL END AS macro
      FROM pipeline_stages s
      JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE s.pipeline_id = v_pipeline_id
       AND COALESCE(s.is_lost, false) = false
       AND ph.slug IN ('sdr', 'closer')
  ),
  open_cards AS (
    SELECT sm.macro,
           c.id AS card_id,
           c.titulo,
           GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - c.created_at)) / 86400.0))::int AS dias,
           pr.nome AS responsavel
      FROM cards c
      JOIN stage_macro sm ON sm.stage_id = c.pipeline_stage_id
      LEFT JOIN profiles pr ON pr.id = c.dono_atual_id
     WHERE c.deleted_at  IS NULL
       AND c.archived_at IS NULL
       AND c.produto::text = 'WEDDING'
       AND c.org_id = v_org_id
       AND sm.macro IS NOT NULL
       AND c.test_agent_id IS NULL
       AND c.titulo NOT ILIKE '%teste%'
       AND c.titulo NOT ILIKE '%audit%'
       AND NOT (c.external_id IS NULL AND (c.titulo ILIKE '%(via sofia)%' OR lower(btrim(c.titulo)) = 'mcqueen'))
       -- 20260630b: filtro por tipo (mesma classificação de v_tipo da view native)
       AND (p_tipo IS NULL OR
            (CASE
               WHEN COALESCE(c.produto_data->>'ww_tipo_casamento','') ILIKE '%elopement%'
                 OR COALESCE(c.produto_data->>'ww_tipo_casamento','') ILIKE '%elopment%' THEN 'Elopement'
               WHEN COALESCE(c.produto_data->>'ww_tipo_casamento','') = '' AND c.titulo ILIKE 'elopement%' THEN 'Elopement'
               ELSE 'DW'
             END) = p_tipo)
  ),
  ranked AS (
    SELECT *, row_number() OVER (PARTITION BY macro ORDER BY dias DESC, card_id) AS rn FROM open_cards
  )
  SELECT json_build_array(
    json_build_object('key', 'sdr', 'label', 'SDR',
      'amostra',             COUNT(*) FILTER (WHERE macro = 'sdr'),
      'mediana_aberto_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias) FILTER (WHERE macro = 'sdr'))::numeric, 0),
      'buckets', json_build_object(
        'ate_7',   COUNT(*) FILTER (WHERE macro = 'sdr' AND dias <= 7),
        'd8_30',   COUNT(*) FILTER (WHERE macro = 'sdr' AND dias BETWEEN 8 AND 30),
        'd31_60',  COUNT(*) FILTER (WHERE macro = 'sdr' AND dias BETWEEN 31 AND 60),
        'mais_60', COUNT(*) FILTER (WHERE macro = 'sdr' AND dias > 60)),
      'top_parados', COALESCE((SELECT json_agg(json_build_object('card_id', card_id, 'titulo', titulo, 'dias', dias, 'responsavel', responsavel) ORDER BY dias DESC)
                                 FROM ranked WHERE macro = 'sdr' AND rn <= 5), '[]'::json),
      'sem_dados', COUNT(*) FILTER (WHERE macro = 'sdr') = 0),
    json_build_object('key', 'closer', 'label', 'Closer',
      'amostra',             COUNT(*) FILTER (WHERE macro = 'closer'),
      'mediana_aberto_dias', ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias) FILTER (WHERE macro = 'closer'))::numeric, 0),
      'buckets', json_build_object(
        'ate_7',   COUNT(*) FILTER (WHERE macro = 'closer' AND dias <= 7),
        'd8_30',   COUNT(*) FILTER (WHERE macro = 'closer' AND dias BETWEEN 8 AND 30),
        'd31_60',  COUNT(*) FILTER (WHERE macro = 'closer' AND dias BETWEEN 31 AND 60),
        'mais_60', COUNT(*) FILTER (WHERE macro = 'closer' AND dias > 60)),
      'top_parados', COALESCE((SELECT json_agg(json_build_object('card_id', card_id, 'titulo', titulo, 'dias', dias, 'responsavel', responsavel) ORDER BY dias DESC)
                                 FROM ranked WHERE macro = 'closer' AND rn <= 5), '[]'::json),
      'sem_dados', COUNT(*) FILTER (WHERE macro = 'closer') = 0)
  ) INTO v_aging_sc
  FROM open_cards;

  v_dwell := (COALESCE(v_dwell_sc, '[]'::json)::jsonb || COALESCE(v_dwell_pv, '[]'::json)::jsonb)::json;
  v_aging := (COALESCE(v_aging_sc, '[]'::json)::jsonb || COALESCE(v_aging_pv, '[]'::json)::jsonb)::json;

  RETURN json_build_object(
    'org_id',      v_org_id,
    'pipeline_id', v_pipeline_id,
    'periodo',     json_build_object('date_start', v_start, 'date_end', v_end, 'prev_start', v_prev_start, 'prev_end', v_start),
    'velocidade',  v_velocidade,
    'dwell',       v_dwell,
    'aging',       v_aging
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ww_diretoria_tempos(uuid, timestamptz, timestamptz, text) TO authenticated;
