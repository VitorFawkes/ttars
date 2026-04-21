-- =========================================================================
-- Fase 2 Analytics v2 — Bloco 3 (parte B): 6 RPCs de outcome/pipeline
--
-- 7. fn_card_stage_history       — timeline completa por card
-- 8. analytics_trip_readiness    — prontidão operacional por viagem
-- 9. analytics_proposal_versions — # versões até aprovar + variação de preço
-- 10. analytics_handoff_speed    — tempo ganho_sdr → 1ª msg Planner
-- 11. analytics_whatsapp_speed_v2 — FRT com business hours + per-source
-- 12. analytics_dropped_balls    — clientes sem resposta há >N horas
-- =========================================================================

-- ---------------------------------------------------------------------
-- 7) fn_card_stage_history
-- Timeline unificada de um card: stage_changed + ganho events + tarefas +
-- whatsapp messages. Retorna lista ordenada por created_at ASC.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_card_stage_history(
  p_card_id UUID,
  p_limit INT DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_card_org UUID;
  v_result JSONB;
BEGIN
  SELECT org_id INTO v_card_org FROM cards WHERE id = p_card_id;
  IF v_card_org IS NULL THEN
    RETURN jsonb_build_object('error', 'card_not_found');
  END IF;
  IF v_card_org <> v_org THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  WITH stage_events AS (
    SELECT
      a.created_at,
      'stage_changed' AS kind,
      jsonb_build_object(
        'from_stage_id', a.metadata->>'old_stage_id',
        'from_stage_name', a.metadata->>'old_stage_name',
        'from_stage_ordem', (a.metadata->>'old_stage_ordem')::INT,
        'to_stage_id', a.metadata->>'new_stage_id',
        'to_stage_name', a.metadata->>'new_stage_name',
        'to_stage_ordem', (a.metadata->>'new_stage_ordem')::INT,
        'is_rework', COALESCE((a.metadata->>'is_rework')::BOOLEAN, FALSE),
        'author_id', a.created_by
      ) AS payload
    FROM activities a
    WHERE a.card_id = p_card_id AND a.tipo = 'stage_changed'
  ),
  ganho_events AS (
    SELECT
      a.created_at,
      a.tipo AS kind,
      jsonb_build_object('descricao', a.descricao, 'author_id', a.created_by, 'metadata', a.metadata) AS payload
    FROM activities a
    WHERE a.card_id = p_card_id AND a.tipo IN ('ganho_sdr_event','ganho_planner_event','ganho_pos_event')
  ),
  task_created AS (
    SELECT
      t.created_at,
      'task_created' AS kind,
      jsonb_build_object(
        'task_id', t.id, 'titulo', t.titulo, 'tipo', t.tipo,
        'responsavel_id', t.responsavel_id, 'data_vencimento', t.data_vencimento
      ) AS payload
    FROM tarefas t
    WHERE t.card_id = p_card_id AND t.deleted_at IS NULL
  ),
  task_completed AS (
    SELECT
      t.concluida_em AS created_at,
      'task_completed' AS kind,
      jsonb_build_object(
        'task_id', t.id, 'titulo', t.titulo,
        'on_time', CASE WHEN t.data_vencimento IS NOT NULL
          THEN (t.concluida_em <= t.data_vencimento) ELSE NULL END,
        'responsavel_id', t.responsavel_id
      ) AS payload
    FROM tarefas t
    WHERE t.card_id = p_card_id AND t.deleted_at IS NULL AND t.concluida AND t.concluida_em IS NOT NULL
  ),
  wa_msgs AS (
    SELECT
      wm.created_at,
      'whatsapp_' || wm.direction AS kind,
      jsonb_build_object(
        'direction', wm.direction,
        'type', wm.message_type,
        'body_preview', LEFT(COALESCE(wm.body, ''), 140),
        'sent_by_user_id', wm.sent_by_user_id,
        'sent_by_user_name', wm.sent_by_user_name,
        'is_from_me', wm.is_from_me
      ) AS payload
    FROM whatsapp_messages wm
    WHERE wm.card_id = p_card_id AND wm.direction IS NOT NULL
  ),
  merged AS (
    SELECT * FROM stage_events
    UNION ALL SELECT * FROM ganho_events
    UNION ALL SELECT * FROM task_created
    UNION ALL SELECT * FROM task_completed
    UNION ALL SELECT * FROM wa_msgs
  )
  SELECT jsonb_agg(
    jsonb_build_object('at', created_at, 'kind', kind, 'payload', payload)
    ORDER BY created_at ASC
  )
  INTO v_result
  FROM (
    SELECT * FROM merged
    WHERE created_at IS NOT NULL
    ORDER BY created_at ASC
    LIMIT p_limit
  ) final;

  RETURN jsonb_build_object(
    'card_id', p_card_id,
    'events', COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_card_stage_history(UUID, INT) TO authenticated;

-- ---------------------------------------------------------------------
-- 8) analytics_trip_readiness
-- Prontidão por viagem: % de trip_items operacionais já aprovados/operacionais
-- Viagens em estados pré-embarque. Calcula dias até partida via data_viagem_fim
-- como proxy (se data_viagem_inicio não existir, usamos cards.data_viagem_fim).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_trip_readiness(
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_max_days_ahead INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_list JSONB;
  v_summary JSONB;
BEGIN
  WITH filtered_cards AS (
    SELECT c.id, c.titulo, c.data_viagem_fim, c.pos_owner_id, c.pipeline_stage_id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.pos_owner_id, p_owner_id, NULL)
  ),
  viagens_base AS (
    SELECT
      v.id AS viagem_id,
      v.card_id,
      v.estado,
      v.pos_owner_id,
      v.tp_owner_id,
      fc.data_viagem_fim,
      fc.titulo
    FROM viagens v
    JOIN filtered_cards fc ON fc.id = v.card_id
    WHERE v.estado IN ('confirmada','em_montagem','aguardando_embarque','em_andamento')
  ),
  items_agg AS (
    SELECT
      ti.viagem_id,
      COUNT(*) FILTER (WHERE ti.tipo NOT IN ('dia','dica','texto','checklist','contato')
                        AND ti.deleted_at IS NULL) AS total_operacionais,
      COUNT(*) FILTER (WHERE ti.tipo NOT IN ('dia','dica','texto','checklist','contato')
                        AND ti.deleted_at IS NULL
                        AND ti.status IN ('aprovado','operacional','vivido')) AS ready
    FROM trip_items ti
    WHERE ti.org_id = v_org
    GROUP BY ti.viagem_id
  ),
  trips_with_readiness AS (
    SELECT
      vb.viagem_id, vb.card_id, vb.titulo, vb.estado, vb.pos_owner_id,
      vb.data_viagem_fim,
      COALESCE(ia.total_operacionais, 0) AS total_operacionais,
      COALESCE(ia.ready, 0) AS ready,
      CASE WHEN COALESCE(ia.total_operacionais, 0) > 0
        THEN ROUND(100.0 * ia.ready::NUMERIC / ia.total_operacionais, 1)
        ELSE 0 END AS readiness_pct,
      CASE WHEN vb.data_viagem_fim IS NOT NULL
        THEN CEIL(EXTRACT(EPOCH FROM (vb.data_viagem_fim - NOW())) / 86400.0)::INT
        ELSE NULL END AS days_to_departure
    FROM viagens_base vb
    LEFT JOIN items_agg ia ON ia.viagem_id = vb.viagem_id
  ),
  scoped AS (
    SELECT *
    FROM trips_with_readiness
    WHERE days_to_departure IS NULL OR days_to_departure <= p_max_days_ahead
  ),
  trips_list AS (
    SELECT jsonb_agg(jsonb_build_object(
      'viagem_id', viagem_id, 'card_id', card_id, 'titulo', titulo,
      'estado', estado, 'pos_owner_id', pos_owner_id,
      'pos_owner_name', pr.nome,
      'days_to_departure', days_to_departure,
      'total_operacionais', total_operacionais, 'ready', ready,
      'readiness_pct', readiness_pct,
      'at_risk', (days_to_departure IS NOT NULL AND days_to_departure <= 7 AND readiness_pct < 100)
    ) ORDER BY
      CASE WHEN days_to_departure IS NULL THEN 99999 ELSE days_to_departure END ASC,
      readiness_pct ASC) AS val
    FROM scoped t
    LEFT JOIN profiles pr ON pr.id = t.pos_owner_id
  ),
  summary_agg AS (
    SELECT jsonb_build_object(
      'total_trips', COUNT(*),
      'at_risk', COUNT(*) FILTER (WHERE days_to_departure IS NOT NULL AND days_to_departure <= 7 AND readiness_pct < 100),
      'avg_readiness_pct', ROUND(AVG(readiness_pct)::NUMERIC, 1),
      'fully_ready', COUNT(*) FILTER (WHERE readiness_pct >= 100)
    ) AS val
    FROM scoped
  )
  SELECT jsonb_build_object(
    'summary', COALESCE(s.val, '{}'::jsonb),
    'trips', COALESCE(tl.val, '[]'::jsonb)
  )
  INTO v_list
  FROM summary_agg s, trips_list tl;

  RETURN v_list;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_trip_readiness(TEXT, TEXT[], TEXT[], TEXT[], UUID, INT) TO authenticated;

-- ---------------------------------------------------------------------
-- 9) analytics_proposal_versions
-- Para cards com proposal aceita no período: número de versões até aprovar +
-- variação de preço 1ª versão → aceita.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_proposal_versions(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
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
    SELECT c.id, c.vendas_owner_id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.vendas_owner_id, p_owner_id, NULL)
  ),
  accepted AS (
    SELECT DISTINCT ON (p.card_id)
      p.card_id, p.accepted_at, p.accepted_total, p.version AS accepted_version
    FROM proposals p
    JOIN filtered_cards fc ON fc.id = p.card_id
    WHERE p.org_id = v_org
      AND p.accepted_at IS NOT NULL
      AND p.accepted_at >= p_from
      AND p.accepted_at < (p_to + INTERVAL '1 day')
    ORDER BY p.card_id, p.accepted_at DESC
  ),
  versions_per_card AS (
    SELECT
      a.card_id, a.accepted_at, a.accepted_total, a.accepted_version,
      (SELECT MAX(p2.version) FROM proposals p2 WHERE p2.card_id = a.card_id AND p2.org_id = v_org) AS max_version,
      (SELECT p3.accepted_total FROM proposals p3
        WHERE p3.card_id = a.card_id AND p3.org_id = v_org
        ORDER BY p3.version ASC NULLS LAST LIMIT 1) AS first_total,
      fc.vendas_owner_id
    FROM accepted a
    JOIN filtered_cards fc ON fc.id = a.card_id
  ),
  summary AS (
    SELECT jsonb_build_object(
      'total_accepted', COUNT(*),
      'avg_versions', ROUND(AVG(COALESCE(accepted_version, max_version, 1))::NUMERIC, 1),
      'median_versions', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY COALESCE(accepted_version, max_version, 1)::NUMERIC),
      'avg_price_variation_pct', ROUND(AVG(
        CASE WHEN first_total IS NOT NULL AND first_total > 0 AND accepted_total IS NOT NULL
          THEN ((accepted_total - first_total) / first_total) * 100.0
          ELSE NULL END
      )::NUMERIC, 1),
      'avg_accepted_total', ROUND(AVG(accepted_total)::NUMERIC, 2)
    ) AS val
    FROM versions_per_card
  ),
  by_planner AS (
    SELECT jsonb_agg(jsonb_build_object(
      'planner_id', vendas_owner_id,
      'planner_name', COALESCE(pr.nome, 'Desconhecido'),
      'accepted_count', cnt,
      'avg_versions', avg_versions,
      'avg_price_variation_pct', avg_variation
    ) ORDER BY cnt DESC) AS val
    FROM (
      SELECT vendas_owner_id, COUNT(*) AS cnt,
        ROUND(AVG(COALESCE(accepted_version, max_version, 1))::NUMERIC, 1) AS avg_versions,
        ROUND(AVG(
          CASE WHEN first_total IS NOT NULL AND first_total > 0 AND accepted_total IS NOT NULL
            THEN ((accepted_total - first_total) / first_total) * 100.0
            ELSE NULL END
        )::NUMERIC, 1) AS avg_variation
      FROM versions_per_card
      WHERE vendas_owner_id IS NOT NULL
      GROUP BY vendas_owner_id
    ) bp
    LEFT JOIN profiles pr ON pr.id = bp.vendas_owner_id
  )
  SELECT jsonb_build_object(
    'summary', COALESCE(s.val, '{}'::jsonb),
    'by_planner', COALESCE(bp.val, '[]'::jsonb)
  )
  INTO v_result
  FROM summary s, by_planner bp;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_proposal_versions(DATE, DATE, TEXT, TEXT[], TEXT[], UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 10) analytics_handoff_speed
-- Tempo (business minutes) entre ganho_sdr_at e 1ª whatsapp outbound feita
-- pelo vendas_owner_id do card. p50, avg, p90 + breakdown por SDR→Planner.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_handoff_speed(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '60 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL
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
  WITH handoffs AS (
    SELECT
      c.id AS card_id, c.sdr_owner_id, c.vendas_owner_id, c.ganho_sdr_at,
      (SELECT MIN(wm.created_at)
        FROM whatsapp_messages wm
        WHERE wm.card_id = c.id
          AND wm.direction = 'outbound'
          AND wm.created_at > c.ganho_sdr_at
          AND wm.sent_by_user_id = c.vendas_owner_id
      ) AS first_planner_msg_at
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.ganho_sdr = true
      AND c.ganho_sdr_at >= p_from
      AND c.ganho_sdr_at < (p_to + INTERVAL '1 day')
      AND c.vendas_owner_id IS NOT NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_destino_ok(c.produto_data, p_destinos)
  ),
  handoffs_with_delta AS (
    SELECT
      card_id, sdr_owner_id, vendas_owner_id, ganho_sdr_at, first_planner_msg_at,
      fn_business_minutes_between(ganho_sdr_at, first_planner_msg_at, v_org) AS business_minutes
    FROM handoffs
    WHERE first_planner_msg_at IS NOT NULL
  ),
  summary AS (
    SELECT jsonb_build_object(
      'total_handoffs', (SELECT COUNT(*) FROM handoffs),
      'with_followup', (SELECT COUNT(*) FROM handoffs_with_delta),
      'no_followup', (SELECT COUNT(*) FROM handoffs WHERE first_planner_msg_at IS NULL),
      'avg_minutes', ROUND(AVG(business_minutes)::NUMERIC, 1),
      'median_minutes', ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY business_minutes)::NUMERIC, 1),
      'p90_minutes', ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY business_minutes)::NUMERIC, 1)
    ) AS val
    FROM handoffs_with_delta
  ),
  by_pair AS (
    SELECT jsonb_agg(jsonb_build_object(
      'sdr_id', sdr_owner_id, 'sdr_name', COALESCE(sdr_p.nome, 'Desconhecido'),
      'planner_id', vendas_owner_id, 'planner_name', COALESCE(planner_p.nome, 'Desconhecido'),
      'handoffs', cnt, 'avg_minutes', avg_min, 'median_minutes', median_min
    ) ORDER BY cnt DESC) AS val
    FROM (
      SELECT sdr_owner_id, vendas_owner_id,
        COUNT(*) AS cnt,
        ROUND(AVG(business_minutes)::NUMERIC, 1) AS avg_min,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY business_minutes)::NUMERIC, 1) AS median_min
      FROM handoffs_with_delta
      WHERE sdr_owner_id IS NOT NULL
      GROUP BY sdr_owner_id, vendas_owner_id
    ) bp
    LEFT JOIN profiles sdr_p ON sdr_p.id = bp.sdr_owner_id
    LEFT JOIN profiles planner_p ON planner_p.id = bp.vendas_owner_id
  )
  SELECT jsonb_build_object(
    'summary', COALESCE(s.val, '{}'::jsonb),
    'by_pair', COALESCE(bp.val, '[]'::jsonb)
  )
  INTO v_result
  FROM summary s, by_pair bp;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_handoff_speed(DATE, DATE, TEXT, TEXT[], TEXT[]) TO authenticated;

-- ---------------------------------------------------------------------
-- 11) analytics_whatsapp_speed_v2
-- FRT (tempo 1ª resposta) usando business-hours. Breakdown por origem.
-- Cobre só mensagens associadas a cards (ignora contatos sem card vinculado).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_whatsapp_speed_v2(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
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
  WITH card_filter AS (
    SELECT c.id, c.origem
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
  ),
  msgs AS (
    SELECT wm.id, wm.card_id, wm.contact_id, wm.direction, wm.created_at, cf.origem
    FROM whatsapp_messages wm
    JOIN card_filter cf ON cf.id = wm.card_id
    WHERE wm.org_id = v_org
      AND wm.created_at >= p_from
      AND wm.created_at < (p_to + INTERVAL '1 day')
  ),
  inbound_next AS (
    SELECT
      m.id, m.card_id, m.contact_id, m.created_at, m.origem,
      LEAD(m.created_at) OVER (PARTITION BY m.card_id, m.direction ORDER BY m.created_at) AS next_same_direction
    FROM msgs m WHERE m.direction = 'inbound'
  ),
  first_responses AS (
    SELECT
      ib.card_id, ib.origem, ib.created_at AS inbound_at,
      MIN(ob.created_at) AS response_at
    FROM inbound_next ib
    JOIN msgs ob ON ob.card_id = ib.card_id
      AND ob.direction = 'outbound'
      AND ob.created_at > ib.created_at
      AND ob.created_at < COALESCE(ib.next_same_direction, 'infinity'::timestamptz)
    GROUP BY ib.card_id, ib.origem, ib.created_at
  ),
  with_business AS (
    SELECT
      card_id, origem, inbound_at, response_at,
      fn_business_minutes_between(inbound_at, response_at, v_org) AS business_minutes,
      EXTRACT(EPOCH FROM (response_at - inbound_at)) / 60.0 AS wall_minutes
    FROM first_responses
  ),
  overall AS (
    SELECT jsonb_build_object(
      'total_responses', COUNT(*),
      'avg_business_minutes', ROUND(AVG(business_minutes)::NUMERIC, 1),
      'median_business_minutes', ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY business_minutes)::NUMERIC, 1),
      'p90_business_minutes', ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY business_minutes)::NUMERIC, 1),
      'avg_wall_minutes', ROUND(AVG(wall_minutes)::NUMERIC, 1)
    ) AS val
    FROM with_business
  ),
  by_source AS (
    SELECT jsonb_agg(jsonb_build_object(
      'origem', COALESCE(origem, 'desconhecida'),
      'responses', cnt, 'avg_business_minutes', avg_b,
      'median_business_minutes', median_b, 'p90_business_minutes', p90_b
    ) ORDER BY cnt DESC) AS val
    FROM (
      SELECT origem, COUNT(*) AS cnt,
        ROUND(AVG(business_minutes)::NUMERIC, 1) AS avg_b,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY business_minutes)::NUMERIC, 1) AS median_b,
        ROUND(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY business_minutes)::NUMERIC, 1) AS p90_b
      FROM with_business
      GROUP BY origem
    ) bs
  ),
  buckets AS (
    SELECT jsonb_agg(jsonb_build_object('bucket', bucket, 'count', cnt) ORDER BY ord) AS val
    FROM (
      SELECT
        CASE
          WHEN business_minutes < 5 THEN '< 5min'
          WHEN business_minutes < 15 THEN '5-15min'
          WHEN business_minutes < 60 THEN '15-60min'
          WHEN business_minutes < 240 THEN '1-4h'
          ELSE '> 4h'
        END AS bucket,
        CASE
          WHEN business_minutes < 5 THEN 1
          WHEN business_minutes < 15 THEN 2
          WHEN business_minutes < 60 THEN 3
          WHEN business_minutes < 240 THEN 4
          ELSE 5
        END AS ord,
        COUNT(*) AS cnt
      FROM with_business
      WHERE business_minutes IS NOT NULL
      GROUP BY 1, 2
    ) b
  )
  SELECT jsonb_build_object(
    'overall', COALESCE(o.val, '{}'::jsonb),
    'by_source', COALESCE(bs.val, '[]'::jsonb),
    'buckets', COALESCE(bk.val, '[]'::jsonb)
  )
  INTO v_result
  FROM overall o, by_source bs, buckets bk;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_whatsapp_speed_v2(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[], UUID) TO authenticated;

-- ---------------------------------------------------------------------
-- 12) analytics_dropped_balls
-- Clientes com mensagem inbound há >N horas sem resposta outbound.
-- Lista de cards com hours_waiting + owner. Default threshold 4h úteis.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_dropped_balls(
  p_threshold_business_minutes INT DEFAULT 240,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_list JSONB;
  v_summary JSONB;
BEGIN
  WITH card_filter AS (
    SELECT c.id, c.titulo, c.origem, c.dono_atual_id,
           c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id, c.pipeline_stage_id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
  ),
  last_inbound AS (
    SELECT DISTINCT ON (wm.card_id)
      wm.card_id, wm.created_at AS last_inbound_at, wm.body AS last_body
    FROM whatsapp_messages wm
    JOIN card_filter cf ON cf.id = wm.card_id
    WHERE wm.org_id = v_org AND wm.direction = 'inbound'
    ORDER BY wm.card_id, wm.created_at DESC
  ),
  dropped AS (
    SELECT
      li.card_id, li.last_inbound_at, li.last_body,
      cf.titulo, cf.dono_atual_id, cf.origem, cf.pipeline_stage_id,
      fn_business_minutes_between(li.last_inbound_at, NOW(), v_org) AS waiting_minutes
    FROM last_inbound li
    JOIN card_filter cf ON cf.id = li.card_id
    WHERE NOT EXISTS (
      SELECT 1 FROM whatsapp_messages ob
      WHERE ob.card_id = li.card_id
        AND ob.direction = 'outbound'
        AND ob.created_at > li.last_inbound_at
        AND ob.org_id = v_org
    )
  ),
  filtered AS (
    SELECT * FROM dropped WHERE waiting_minutes >= p_threshold_business_minutes
  ),
  cards_list AS (
    SELECT jsonb_agg(jsonb_build_object(
      'card_id', d.card_id, 'titulo', d.titulo, 'origem', d.origem,
      'owner_id', d.dono_atual_id, 'owner_name', COALESCE(pr.nome, 'Desconhecido'),
      'stage_name', ps.nome, 'phase_label', pp.label,
      'last_inbound_at', d.last_inbound_at,
      'last_body_preview', LEFT(COALESCE(d.last_body, ''), 120),
      'waiting_business_minutes', d.waiting_minutes,
      'waiting_business_hours', ROUND(d.waiting_minutes / 60.0, 1)
    ) ORDER BY d.waiting_minutes DESC) AS val
    FROM (
      SELECT * FROM filtered ORDER BY waiting_minutes DESC LIMIT p_limit
    ) d
    LEFT JOIN profiles pr ON pr.id = d.dono_atual_id
    LEFT JOIN pipeline_stages ps ON ps.id = d.pipeline_stage_id
    LEFT JOIN pipeline_phases pp ON pp.id = ps.phase_id
  ),
  summary AS (
    SELECT jsonb_build_object(
      'total_dropped', COUNT(*),
      'avg_waiting_hours', ROUND(AVG(waiting_minutes / 60.0)::NUMERIC, 1),
      'oldest_waiting_hours', ROUND((MAX(waiting_minutes) / 60.0)::NUMERIC, 1)
    ) AS val
    FROM filtered
  )
  SELECT jsonb_build_object(
    'summary', COALESCE(s.val, jsonb_build_object('total_dropped', 0)),
    'cards', COALESCE(cl.val, '[]'::jsonb)
  )
  INTO v_list
  FROM summary s, cards_list cl;

  RETURN v_list;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_dropped_balls(INT, TEXT, TEXT[], TEXT[], UUID, INT) TO authenticated;

-- =========================================================================
-- FIM: Parte B — 6 RPCs de outcome
-- =========================================================================
