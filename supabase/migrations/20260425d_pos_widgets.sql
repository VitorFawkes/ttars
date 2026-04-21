-- =========================================================================
-- Analytics v2 — Pós-Venda Dashboard Widgets (5 RPCs novas)
--
-- 1. analytics_upcoming_departures  — partidas próximas em 7/14/30 dias
-- 2. analytics_completed_trips      — viagens concluídas no período
-- 3. analytics_trip_time_to_ready   — tempo Ganho→Pronto por viagem/Concierge
-- 4. analytics_bottleneck_by_item   — gargalo por tipo de item (voo/hotel/transfer)
-- 5. analytics_referrals_post_trip  — indicações geradas pós-viagem
--
-- NOTE: Helper functions (_a_origem_ok, etc.) já existem de migrations anteriores
-- =========================================================================

-- =====================================================================
-- 1) analytics_upcoming_departures
-- Partidas próximas em 7/14/30 dias (contadores por janela)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_upcoming_departures(
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_result JSONB;
BEGIN
  WITH filtered_cards AS (
    SELECT c.id, c.data_viagem_fim, c.pos_owner_id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.pos_owner_id, p_owner_id, NULL)
  ),
  with_days AS (
    SELECT
      c.id,
      CEIL(EXTRACT(EPOCH FROM (c.data_viagem_fim - NOW())) / 86400.0)::INT AS days_to_departure
    FROM filtered_cards c
    WHERE c.data_viagem_fim IS NOT NULL
      AND c.data_viagem_fim > NOW()
  )
  SELECT jsonb_build_object(
    'next_7_days', (SELECT COUNT(*) FROM with_days WHERE days_to_departure BETWEEN 1 AND 7),
    'next_14_days', (SELECT COUNT(*) FROM with_days WHERE days_to_departure BETWEEN 1 AND 14),
    'next_30_days', (SELECT COUNT(*) FROM with_days WHERE days_to_departure BETWEEN 1 AND 30)
  )
  INTO v_result
  FROM with_days;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_upcoming_departures(TEXT, TEXT[], TEXT[], UUID) TO authenticated;

-- =====================================================================
-- 2) analytics_completed_trips
-- Viagens concluídas no período (contagem + detalhes por Concierge)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_completed_trips(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_result JSONB;
BEGIN
  WITH filtered_cards AS (
    SELECT c.id, c.pos_owner_id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.pos_owner_id, p_owner_id, NULL)
  ),
  completed AS (
    SELECT
      v.id, v.card_id, v.estado, v.pos_owner_id,
      v.updated_at AS completion_date
    FROM viagens v
    JOIN filtered_cards fc ON fc.id = v.card_id
    WHERE v.org_id = v_org
      AND v.estado = 'concluida'
      AND v.updated_at::DATE >= p_from
      AND v.updated_at::DATE <= p_to
  ),
  summary AS (
    SELECT jsonb_build_object(
      'total_completed', COUNT(*),
      'avg_trips_per_concierge', ROUND(COUNT(*) / NULLIF(COUNT(DISTINCT pos_owner_id), 0)::NUMERIC, 1)
    ) AS val
    FROM completed
  ),
  by_concierge AS (
    SELECT jsonb_agg(jsonb_build_object(
      'concierge_id', c.pos_owner_id,
      'concierge_name', COALESCE(pr.nome, 'Desconhecido'),
      'completed_count', cnt
    ) ORDER BY cnt DESC) AS val
    FROM (
      SELECT pos_owner_id, COUNT(*) AS cnt
      FROM completed
      WHERE pos_owner_id IS NOT NULL
      GROUP BY pos_owner_id
    ) c
    LEFT JOIN profiles pr ON pr.id = c.pos_owner_id
  )
  SELECT jsonb_build_object(
    'summary', COALESCE(s.val, '{}'::jsonb),
    'by_concierge', COALESCE(bc.val, '[]'::jsonb)
  )
  INTO v_result
  FROM summary s, by_concierge bc;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_completed_trips(DATE, DATE, TEXT, TEXT[], TEXT[], UUID) TO authenticated;

-- =====================================================================
-- 3) analytics_trip_time_to_ready
-- Tempo Ganho→Pronto (quando trip_items operacionais atingem 100%)
-- Mediana e p75 por viagem e por Concierge
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_trip_time_to_ready(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_result JSONB;
BEGIN
  WITH filtered_cards AS (
    SELECT c.id, c.ganho_pos_at, c.pos_owner_id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.ganho_pos = true
      AND c.ganho_pos_at IS NOT NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.pos_owner_id, p_owner_id, NULL)
  ),
  trips_with_items AS (
    SELECT
      v.id AS viagem_id,
      v.card_id,
      fc.ganho_pos_at,
      fc.pos_owner_id,
      MAX(CASE WHEN ti.status IN ('aprovado','operacional','vivido') AND ti.tipo NOT IN ('dia','dica','texto','checklist','contato')
            THEN ti.updated_at ELSE NULL END) AS last_item_ready_at
    FROM viagens v
    JOIN filtered_cards fc ON fc.id = v.card_id
    LEFT JOIN trip_items ti ON ti.viagem_id = v.id AND ti.org_id = v_org
    WHERE v.org_id = v_org
    GROUP BY v.id, v.card_id, fc.ganho_pos_at, fc.pos_owner_id
  ),
  with_delta AS (
    SELECT
      viagem_id, card_id, pos_owner_id,
      ganho_pos_at, last_item_ready_at,
      CASE WHEN last_item_ready_at >= ganho_pos_at
        THEN CEIL(EXTRACT(EPOCH FROM (last_item_ready_at - ganho_pos_at)) / 86400.0)::INT
        ELSE NULL END AS days_to_ready
    FROM trips_with_items
    WHERE last_item_ready_at IS NOT NULL
  ),
  summary AS (
    SELECT jsonb_build_object(
      'trips_measured', COUNT(*),
      'median_days', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_to_ready),
      'p75_days', PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY days_to_ready),
      'avg_days', ROUND(AVG(days_to_ready)::NUMERIC, 1)
    ) AS val
    FROM with_delta
  ),
  by_concierge AS (
    SELECT jsonb_agg(jsonb_build_object(
      'concierge_id', pos_owner_id,
      'concierge_name', COALESCE(pr.nome, 'Desconhecido'),
      'trips_measured', cnt,
      'median_days', median_d,
      'p75_days', p75_d
    ) ORDER BY cnt DESC) AS val
    FROM (
      SELECT pos_owner_id, COUNT(*) AS cnt,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_to_ready) AS median_d,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY days_to_ready) AS p75_d
      FROM with_delta
      WHERE pos_owner_id IS NOT NULL
      GROUP BY pos_owner_id
    ) c
    LEFT JOIN profiles pr ON pr.id = c.pos_owner_id
  )
  SELECT jsonb_build_object(
    'summary', COALESCE(s.val, '{}'::jsonb),
    'by_concierge', COALESCE(bc.val, '[]'::jsonb)
  )
  INTO v_result
  FROM summary s, by_concierge bc;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_trip_time_to_ready(DATE, DATE, TEXT, TEXT[], TEXT[], UUID) TO authenticated;

-- =====================================================================
-- 4) analytics_bottleneck_by_item
-- Gargalo por tipo de item (voo/hotel/transfer/seguro/atividade/refeição)
-- Qual tipo atrasa mais em média
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_bottleneck_by_item(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_result JSONB;
BEGIN
  WITH filtered_cards AS (
    SELECT c.id, c.ganho_pos_at
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.ganho_pos = true
      AND c.ganho_pos_at IS NOT NULL
      AND c.ganho_pos_at::DATE >= p_from
      AND c.ganho_pos_at::DATE <= p_to
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.pos_owner_id, p_owner_id, NULL)
  ),
  items_status AS (
    SELECT
      ti.tipo,
      CASE WHEN ti.status IN ('aprovado','operacional','vivido')
        THEN CEIL(EXTRACT(EPOCH FROM (ti.updated_at - fc.ganho_pos_at)) / 86400.0)::INT
        ELSE NULL END AS days_to_approve,
      COUNT(*) AS total_items
    FROM trip_items ti
    JOIN viagens v ON v.id = ti.viagem_id
    JOIN filtered_cards fc ON fc.id = v.card_id
    WHERE ti.org_id = v_org
      AND ti.deleted_at IS NULL
      AND ti.tipo NOT IN ('dia','dica','texto','checklist','contato')
    GROUP BY ti.tipo, days_to_approve
  ),
  by_type AS (
    SELECT jsonb_agg(jsonb_build_object(
      'item_type', tipo,
      'total_items', SUM(total_items),
      'avg_days_to_ready', ROUND(AVG(days_to_approve)::NUMERIC, 1),
      'median_days_to_ready', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_to_approve) OVER (PARTITION BY tipo)
    ) ORDER BY AVG(COALESCE(days_to_approve, 999)) DESC) AS val
    FROM items_status
    WHERE tipo IS NOT NULL
    GROUP BY tipo
  )
  SELECT COALESCE(b.val, '[]'::jsonb)
  INTO v_result
  FROM by_type b;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_bottleneck_by_item(DATE, DATE, TEXT, TEXT[], TEXT[], UUID) TO authenticated;

-- =====================================================================
-- 5) analytics_referrals_post_trip
-- Indicações geradas pós-viagem
-- Cards novos com entry_path='referred' cujo contato_indicador tinha
-- card ganho antes dessa data
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_referrals_post_trip(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_result JSONB;
BEGIN
  WITH referred_in_period AS (
    SELECT c.id, c.created_at, c.contato_id, c.lead_entry_path
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.lead_entry_path = 'referred'
      AND c.created_at::DATE >= p_from
      AND c.created_at::DATE <= p_to
      AND c.contato_id IS NOT NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
  ),
  referrer_cards AS (
    SELECT
      cc.id AS referrer_card_id,
      cc.contato_id AS referrer_contact_id,
      MAX(cc.ganho_pos_at) AS latest_ganho_pos_at
    FROM cards cc
    WHERE cc.org_id = v_org
      AND cc.deleted_at IS NULL
      AND cc.ganho_pos = true
      AND cc.ganho_pos_at IS NOT NULL
    GROUP BY cc.contato_id
  ),
  valid_referrals AS (
    SELECT
      rp.id AS referred_card_id,
      rp.created_at AS referred_created_at,
      rc.referrer_card_id,
      rc.referrer_contact_id,
      rc.latest_ganho_pos_at,
      CEIL(EXTRACT(EPOCH FROM (rp.created_at - rc.latest_ganho_pos_at)) / 86400.0)::INT AS days_after_ganho
    FROM referred_in_period rp
    LEFT JOIN referrer_cards rc ON rc.referrer_contact_id = rp.contato_id
    WHERE rc.latest_ganho_pos_at IS NOT NULL
      AND rp.created_at > rc.latest_ganho_pos_at
  ),
  summary AS (
    SELECT jsonb_build_object(
      'total_referrals', COUNT(*),
      'avg_days_after_ganho', ROUND(AVG(days_after_ganho)::NUMERIC, 1),
      'median_days_after_ganho', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_after_ganho)
    ) AS val
    FROM valid_referrals
  ),
  by_referrer AS (
    SELECT jsonb_agg(jsonb_build_object(
      'referrer_contact_id', ct.id,
      'referrer_name', ct.nome,
      'referred_count', cnt,
      'avg_days_after_ganho', avg_days
    ) ORDER BY cnt DESC) AS val
    FROM (
      SELECT referrer_contact_id, COUNT(*) AS cnt,
        ROUND(AVG(days_after_ganho)::NUMERIC, 1) AS avg_days
      FROM valid_referrals
      WHERE referrer_contact_id IS NOT NULL
      GROUP BY referrer_contact_id
    ) br
    LEFT JOIN contatos ct ON ct.id = br.referrer_contact_id
  )
  SELECT jsonb_build_object(
    'summary', COALESCE(s.val, '{}'::jsonb),
    'by_referrer', COALESCE(br.val, '[]'::jsonb)
  )
  INTO v_result
  FROM summary s, by_referrer br;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_referrals_post_trip(DATE, DATE, TEXT) TO authenticated;
