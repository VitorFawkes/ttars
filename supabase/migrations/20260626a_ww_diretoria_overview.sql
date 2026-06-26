-- ════════════════════════════════════════════════════════════════════════════
-- Diretoria · Estado Geral da Operação (Welcome Weddings)
-- ────────────────────────────────────────────────────────────────────────────
-- Visão executiva enxuta das 4 macro-fases da operação:
--   SDR → Closer → Planejamento → Produção
--
-- Cada macro-fase traz:
--   • snapshot AGORA  → 1 registro por casal (deal) na fase hoje → vira uma
--                       "minibarrinha" clicável (abre /cards/:id) no front
--   • count           → total de casais na fase agora
--   • valor_total     → soma de COALESCE(valor_final, valor_estimado, 0)
--   • entrou_periodo  → quantos entraram na fase no período (e no anterior)
--   • tendencia_pct   → variação % das entradas vs período anterior
--   • conversao_proxima_pct → entradas da próxima fase / entradas desta (período)
--
-- Fontes:
--   • snapshot     = cards (etapa atual = verdade operacional, linka ao card)
--   • fluxo/período = ww_funil_casal (carimbos entrou_*_at por casal)
--
-- Mapeamento de macro-fase (slug da fase no pipeline):
--   sdr → 'sdr' · closer → 'closer'
--   planejamento → 'pos_venda' (exceto etapa de Produção)
--   producao     → 'pos_venda' AND nome ILIKE 'produ%'
--
-- Isolamento: SECURITY DEFINER + requesting_org_id() (fallback), pipeline
-- resolvido por org_id + produto='WEDDING' (nunca por slug solto).
-- Read-only: nenhuma mutação. Aditivo (nova função).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ww_diretoria_overview(
  p_org_id     uuid        DEFAULT NULL,
  p_date_start timestamptz DEFAULT NULL,
  p_date_end   timestamptz DEFAULT NULL,
  p_max_deals  int         DEFAULT 1500
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
  -- cada etapa do pipeline → macro-fase (NULL = fora das 4 / Resolução)
  stage_macro AS (
    SELECT s.id AS stage_id,
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
  -- snapshot: 1 linha por casal na fase agora
  deals AS (
    SELECT sm.macro,
           c.id    AS card_id,
           c.titulo,
           COALESCE(c.valor_final, c.valor_estimado, 0)::numeric AS valor
      FROM cards c
      JOIN stage_macro sm ON sm.stage_id = c.pipeline_stage_id
     WHERE c.deleted_at  IS NULL
       AND c.archived_at IS NULL
       AND c.produto::text = 'WEDDING'
       AND c.org_id = v_org_id
       AND sm.macro IS NOT NULL
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
               json_build_object('card_id', card_id, 'titulo', titulo, 'valor', valor)
               ORDER BY valor DESC NULLS LAST, card_id
             ) FILTER (WHERE rn <= p_max_deals),
             '[]'::json
           ) AS deals
      FROM deals_ranked
     GROUP BY macro
  ),
  -- fluxo por período: entradas em cada fase (atual e anterior) via ww_funil_casal
  fluxo AS (
    SELECT
      COUNT(*) FILTER (WHERE lead_created_at        >= v_start      AND lead_created_at        < v_end)   AS sdr_now,
      COUNT(*) FILTER (WHERE entrou_closer_at       >= v_start      AND entrou_closer_at       < v_end)   AS closer_now,
      COUNT(*) FILTER (WHERE entrou_planejamento_at >= v_start      AND entrou_planejamento_at < v_end)   AS planej_now,
      COUNT(*) FILTER (WHERE entrou_producao_at     >= v_start      AND entrou_producao_at     < v_end)   AS prod_now,
      COUNT(*) FILTER (WHERE lead_created_at        >= v_prev_start AND lead_created_at        < v_start) AS sdr_prev,
      COUNT(*) FILTER (WHERE entrou_closer_at       >= v_prev_start AND entrou_closer_at       < v_start) AS closer_prev,
      COUNT(*) FILTER (WHERE entrou_planejamento_at >= v_prev_start AND entrou_planejamento_at < v_start) AS planej_prev,
      COUNT(*) FILTER (WHERE entrou_producao_at     >= v_prev_start AND entrou_producao_at     < v_start) AS prod_prev
      FROM ww_funil_casal
     WHERE org_id = v_org_id
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
           -- conversão p/ próxima fase = entradas próxima / entradas desta (no período)
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
$$;

GRANT EXECUTE ON FUNCTION ww_diretoria_overview(uuid, timestamptz, timestamptz, int) TO authenticated;
