-- ════════════════════════════════════════════════════════════════════════════
-- 20260626e — Diretoria · Tempos: Planejamento e Produção saem do "sem dados"
-- ────────────────────────────────────────────────────────────────────────────
-- Antes: planejamento/producao vinham hard-coded 'sem_dados', true (não havia
-- carimbo de entrada confiável). A migration 20260626d passou a carimbar
-- entrou_planejamento_at/entrou_producao_at na view native (forward via
-- activities + backfill parcial do Active). Agora a RPC mostra:
--   • QUANTIDADE AGORA  → nº de casais abertos na fase (sempre, fonte = cards).
--   • DURAÇÃO (futuro)  → tempo NA FASE HOJE = now() - entrou_fase, p/ quem tem
--                         carimbo. Cresce conforme os casais avançam. Sem
--                         carimbo = contado no total mas fora da distribuição
--                         (nada de número inventado).
-- SDR e Closer ficam IDÊNTICOS (dwell por coorte de lead_created_at; aging por
-- created_at). Pós-venda usa ocupação da etapa atual (semântica correta: tempo
-- longo no pós-venda é esperado — não entra no "gargalo" da operação).
-- Read-only · SECURITY DEFINER · isolado por org (pipeline por org+produto).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ww_diretoria_tempos(
  p_org_id     uuid        DEFAULT NULL,
  p_date_start timestamptz DEFAULT NULL,
  p_date_end   timestamptz DEFAULT NULL
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
  v_dwell_sc    json;   -- dwell SDR+Closer (coorte, view)
  v_dwell_pv    json;   -- dwell Planejamento+Produção (ocupação atual)
  v_dwell       json;
  v_aging_sc    json;   -- aging SDR+Closer (abertos por created_at)
  v_aging_pv    json;   -- aging Planejamento+Produção (abertos por entrou_fase)
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

  -- ── Mediana do ciclo completo no período ANTERIOR (para a seta de tendência) ──
  SELECT ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP (
            ORDER BY EXTRACT(EPOCH FROM (ganho_at - lead_created_at)) / 86400.0))::numeric, 1)
    INTO v_prev_fech
    FROM ww_funil_casal_native
   WHERE org_id = v_org_id AND ganho AND ganho_at IS NOT NULL
     AND ganho_at >= lead_created_at
     AND lead_created_at >= v_prev_start AND lead_created_at < v_start;

  -- ── Velocidade + dwell SDR/Closer (view native, coorte por lead_created_at) ──
  WITH d AS (
    SELECT
      CASE WHEN fez_sdr_at    IS NOT NULL AND fez_sdr_at    >= lead_created_at THEN EXTRACT(EPOCH FROM (fez_sdr_at    - lead_created_at)) / 86400.0 END AS lead_sdr,
      CASE WHEN fez_closer_at IS NOT NULL AND fez_closer_at >= lead_created_at THEN EXTRACT(EPOCH FROM (fez_closer_at - lead_created_at)) / 86400.0 END AS lead_closer,
      CASE WHEN ganho AND ganho_at IS NOT NULL AND ganho_at >= lead_created_at THEN EXTRACT(EPOCH FROM (ganho_at - lead_created_at)) / 86400.0 END AS lead_ganho,
      CASE WHEN ganho AND ganho_at IS NOT NULL AND fez_closer_at IS NOT NULL AND ganho_at >= fez_closer_at THEN EXTRACT(EPOCH FROM (ganho_at - fez_closer_at)) / 86400.0 END AS closer_ganho,
      CASE WHEN ganho AND ganho_at IS NOT NULL AND fez_sdr_at    IS NOT NULL AND ganho_at >= fez_sdr_at    THEN EXTRACT(EPOCH FROM (ganho_at - fez_sdr_at))    / 86400.0 END AS sdr_ganho
      FROM ww_funil_casal_native
     WHERE org_id = v_org_id
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

  -- ── Pós-venda: ocupação da etapa ATUAL (fonte cards + carimbo da view) ───────
  -- macro = produção se a etapa começa com "Produ…", senão planejamento.
  -- dias = now() - entrou_fase (NULL se ainda sem carimbo → fora da distribuição).
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
  macros AS (  -- garante as 2 fases mesmo com 0 casais
    SELECT * FROM (VALUES ('planejamento','Planejamento'), ('producao','Produção')) AS m(macro, label)
  )
  SELECT
    -- dwell pós-venda (tempo na fase hoje)
    json_agg(json_build_object(
      'key', m.macro, 'label', m.label,
      'count_aberto', COALESCE(st.total, 0),
      'amostra',      COALESCE(st.com_tempo, 0),
      'p25_dias',     st.p25, 'mediana_dias', st.mediana, 'p75_dias', st.p75, 'p90_dias', st.p90,
      'sem_dados',    COALESCE(st.total, 0) = 0
    ) ORDER BY CASE m.macro WHEN 'planejamento' THEN 1 ELSE 2 END),
    -- aging pós-venda (mesma fonte; buckets/top entre os que têm carimbo)
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

  -- ── Aging dos casais ABERTOS hoje em SDR/Closer (fonte: cards, dá link) ──────
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

  -- ── Concatena SDR/Closer + Planejamento/Produção (ordem das 4 macro-fases) ───
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

GRANT EXECUTE ON FUNCTION ww_diretoria_tempos(uuid, timestamptz, timestamptz) TO authenticated;
