-- ════════════════════════════════════════════════════════════════════════════
-- Diretoria · Tempos da operação (velocidade · dwell · aging)
-- ────────────────────────────────────────────────────────────────────────────
-- Métricas de TEMPO para o painel de diretoria. Realidade dos dados (jun/2026):
-- só SDR e Closer têm carimbos de tempo confiáveis (lead_created_at, fez_sdr_at,
-- fez_closer_at, ganho_at). entrou_planejamento_at/entrou_producao_at estão
-- vazios → Planejamento/Produção devolvem sem_dados (placeholder honesto).
--
-- 3 blocos:
--   velocidade → medianas das pernas do ciclo (lead→reunião SDR, lead→closer,
--                lead→fechamento, closer→fechamento) + mediana do período anterior
--   dwell      → distribuição (p25/mediana/p75/p90) da perna SDR e da perna Closer
--                FONTE: ww_funil_casal_native, coorte por lead_created_at no período
--   aging      → casais ABERTOS hoje em SDR/Closer, por idade (now - created_at):
--                baldes <=7 / 8-30 / 31-60 / >60 + top 5 mais antigos (com card)
--                FONTE: cards (etapa atual) — mesma base do snapshot, dá link p/ card
--
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
  v_dwell       json;
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

  -- ── Velocidade + dwell (view native, coorte por lead_created_at no período) ──
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
        'sem_dados',    COUNT(sdr_ganho) = 0),
      json_build_object('key', 'planejamento', 'label', 'Planejamento', 'sem_dados', true),
      json_build_object('key', 'producao',     'label', 'Produção',     'sem_dados', true)
    )
  INTO v_velocidade, v_dwell
  FROM d;

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
      'sem_dados', COUNT(*) FILTER (WHERE macro = 'closer') = 0),
    json_build_object('key', 'planejamento', 'label', 'Planejamento', 'sem_dados', true, 'buckets', NULL, 'top_parados', '[]'::json),
    json_build_object('key', 'producao',     'label', 'Produção',     'sem_dados', true, 'buckets', NULL, 'top_parados', '[]'::json)
  ) INTO v_aging
  FROM open_cards;

  RETURN json_build_object(
    'org_id',      v_org_id,
    'pipeline_id', v_pipeline_id,
    'periodo',     json_build_object('date_start', v_start, 'date_end', v_end, 'prev_start', v_prev_start, 'prev_end', v_start),
    'velocidade',  v_velocidade,
    'dwell',       v_dwell,
    'aging',       COALESCE(v_aging, json_build_array())
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ww_diretoria_tempos(uuid, timestamptz, timestamptz) TO authenticated;
