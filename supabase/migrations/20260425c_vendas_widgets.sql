-- =========================================================================
-- Fase 3 Analytics v2 — Vendas Dashboard (Travel Planner)
-- 7 widgets novos: trip states, post issues, return customers, open portfolio,
-- overdue tasks, loss reasons, proposal-to-win velocity
-- =========================================================================

-- 1. analytics_trip_states
-- Estado das viagens fechadas por Planner
-- Retorna: agrupamento por estado (em_montagem, em_andamento, concluída, cancelada)
-- Para cada estado: contagem de viagens e última viagem
CREATE OR REPLACE FUNCTION public.analytics_trip_states(
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_date_start TIMESTAMPTZ := COALESCE(p_from::TIMESTAMPTZ, now() - INTERVAL '90 days')::TIMESTAMPTZ;
  v_date_end TIMESTAMPTZ := COALESCE(p_to::TIMESTAMPTZ, now())::TIMESTAMPTZ;
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'by_estado',
      COALESCE(
        jsonb_object_agg(
          v.estado,
          jsonb_build_object(
            'count', COUNT(DISTINCT v.id),
            'latest_at', MAX(v.created_at)
          )
        ),
        '{}'::JSONB
      ),
      'total_trips', COUNT(DISTINCT v.id)
    )
    FROM viagens v
    JOIN cards c ON c.id = v.card_id AND c.org_id = v_org
    WHERE v.org_id = v_org
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.vendas_owner_id = p_owner_id)
      AND c.ganho_planner = TRUE
      AND c.ganho_planner_at >= v_date_start
      AND c.ganho_planner_at < v_date_end
  );
END;
$$;

-- 2. analytics_post_issues
-- Problemas no Pós-Venda: % de cards ganhos com tarefas vencidas APÓS fechamento
CREATE OR REPLACE FUNCTION public.analytics_post_issues(
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_date_start TIMESTAMPTZ := COALESCE(p_from::TIMESTAMPTZ, now() - INTERVAL '90 days')::TIMESTAMPTZ;
  v_date_end TIMESTAMPTZ := COALESCE(p_to::TIMESTAMPTZ, now())::TIMESTAMPTZ;
BEGIN
  RETURN (
    WITH closed_cards AS (
      SELECT c.id, c.ganho_planner_at
      FROM cards c
      WHERE c.org_id = v_org
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND (p_owner_id IS NULL OR c.vendas_owner_id = p_owner_id)
        AND c.ganho_planner = TRUE
        AND c.ganho_planner_at >= v_date_start
        AND c.ganho_planner_at < v_date_end
    ),
    with_overdue_post AS (
      SELECT
        cc.id,
        COUNT(t.id) FILTER (WHERE t.data_vencimento < now() AND t.status != 'concluida') AS overdue_count
      FROM closed_cards cc
      LEFT JOIN tarefas t ON t.card_id = cc.id
        AND t.created_at > cc.ganho_planner_at
        AND t.deleted_at IS NULL
        AND t.data_vencimento IS NOT NULL
      GROUP BY cc.id
    )
    SELECT jsonb_build_object(
      'total_closed', COUNT(DISTINCT id),
      'with_issues', COUNT(DISTINCT id) FILTER (WHERE overdue_count > 0),
      'issue_pct', ROUND(100.0 * COUNT(DISTINCT id) FILTER (WHERE overdue_count > 0) / NULLIF(COUNT(DISTINCT id), 0), 1)
    )
    FROM with_overdue_post
  );
END;
$$;

-- 3. analytics_return_customers
-- Clientes que voltaram: contato com card ganho, depois ganhou outra
CREATE OR REPLACE FUNCTION public.analytics_return_customers(
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_product TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_date_start TIMESTAMPTZ := COALESCE(p_from::TIMESTAMPTZ, now() - INTERVAL '90 days')::TIMESTAMPTZ;
  v_date_end TIMESTAMPTZ := COALESCE(p_to::TIMESTAMPTZ, now())::TIMESTAMPTZ;
BEGIN
  RETURN (
    WITH first_wins AS (
      SELECT DISTINCT c.contato_id, MIN(c.ganho_planner_at) AS first_win
      FROM cards c
      WHERE c.org_id = v_org
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
        AND c.ganho_planner = TRUE
      GROUP BY c.contato_id
    ),
    repeat_purchases AS (
      SELECT
        fw.contato_id,
        COUNT(DISTINCT c.id) AS purchase_count,
        MAX(c.ganho_planner_at) AS last_purchase,
        MIN(EXTRACT(DAY FROM c.ganho_planner_at - fw.first_win)) AS days_to_repeat
      FROM first_wins fw
      JOIN cards c ON c.contato_id = fw.contato_id
        AND c.org_id = fw.contato_id  -- Fixo: contato_id é UUID da org
        AND c.ganho_planner = TRUE
        AND c.ganho_planner_at > fw.first_win
        AND c.ganho_planner_at >= v_date_start
        AND c.ganho_planner_at < v_date_end
        AND (p_product IS NULL OR c.produto::TEXT = p_product)
      GROUP BY fw.contato_id
    )
    SELECT jsonb_build_object(
      'total_returning',  COUNT(DISTINCT contato_id),
      'avg_repeat_count', ROUND(AVG(purchase_count)::NUMERIC, 1),
      'avg_days_to_repeat', ROUND(AVG(days_to_repeat)::NUMERIC, 0),
      'total_repeat_revenue', SUM(
        (SELECT SUM(COALESCE(c2.valor_final, c2.valor_estimado, 0))
         FROM cards c2
         WHERE c2.contato_id = rp.contato_id
           AND c2.ganho_planner = TRUE
           AND c2.ganho_planner_at > (
             SELECT MIN(ganho_planner_at) FROM cards WHERE contato_id = rp.contato_id AND ganho_planner = TRUE
           )
         )
      )::NUMERIC
    )
    FROM repeat_purchases rp
  );
END;
$$;

-- 4. analytics_planner_open_portfolio
-- Carteira aberta por Planner: cards ativos (não ganhos, não perdidos)
CREATE OR REPLACE FUNCTION public.analytics_planner_open_portfolio(
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_product TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'planners',
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'planner_id', p.id,
            'planner_name', p.nome,
            'open_count', COUNT(DISTINCT c.id),
            'total_estimado', COALESCE(SUM(COALESCE(c.valor_estimado, 0)), 0),
            'avg_days_open', ROUND(AVG(EXTRACT(DAY FROM now() - c.stage_entered_at))::NUMERIC, 0)
          )
        ),
        '[]'::JSONB
      )
    )
    FROM profiles p
    LEFT JOIN cards c ON c.org_id = v_org
      AND c.vendas_owner_id = p.id
      AND c.ganho_planner IS NOT TRUE
      AND c.perdido = FALSE
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
    WHERE p.org_id = v_org
    GROUP BY p.id, p.nome
    ORDER BY COUNT(DISTINCT c.id) DESC
  );
END;
$$;

-- 5. analytics_overdue_tasks_by_owner
-- Tarefas vencidas do time, agrupadas por owner
CREATE OR REPLACE FUNCTION public.analytics_overdue_tasks_by_owner(
  p_product TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'tasks',
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'owner_id', p.id,
            'owner_name', p.nome,
            'overdue_count', COUNT(DISTINCT t.id),
            'oldest_overdue_days', ROUND(MIN(EXTRACT(DAY FROM now() - t.data_vencimento))::NUMERIC, 0),
            'average_overdue_days', ROUND(AVG(EXTRACT(DAY FROM now() - t.data_vencimento))::NUMERIC, 1)
          )
        ),
        '[]'::JSONB
      )
    )
    FROM profiles p
    LEFT JOIN tarefas t ON t.org_id = v_org
      AND t.responsavel_id = p.id
      AND t.data_vencimento < now()
      AND t.status != 'concluida'
      AND t.deleted_at IS NULL
    LEFT JOIN cards c ON c.id = t.card_id AND (p_product IS NULL OR c.produto::TEXT = p_product)
    WHERE p.org_id = v_org
    GROUP BY p.id, p.nome
    HAVING COUNT(DISTINCT t.id) > 0
    ORDER BY COUNT(DISTINCT t.id) DESC
  );
END;
$$;

-- 6. analytics_loss_reasons_by_planner
-- Motivos de perda agrupados por Planner (vendas_owner_id)
CREATE OR REPLACE FUNCTION public.analytics_loss_reasons_by_planner(
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_product TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_date_start TIMESTAMPTZ := COALESCE(p_from::TIMESTAMPTZ, now() - INTERVAL '90 days')::TIMESTAMPTZ;
  v_date_end TIMESTAMPTZ := COALESCE(p_to::TIMESTAMPTZ, now())::TIMESTAMPTZ;
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'planners',
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'planner_name', p.nome,
            'planner_id', p.id,
            'reasons', COALESCE(
              jsonb_object_agg(c.motivo_perda, COUNT(DISTINCT c.id)),
              '{}'::JSONB
            ),
            'total_lost', COUNT(DISTINCT c.id)
          )
        ),
        '[]'::JSONB
      )
    )
    FROM profiles p
    LEFT JOIN cards c ON c.org_id = v_org
      AND c.vendas_owner_id = p.id
      AND c.perdido = TRUE
      AND c.perdido_em >= v_date_start
      AND c.perdido_em < v_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
    WHERE p.org_id = v_org
    GROUP BY p.id, p.nome
    HAVING COUNT(DISTINCT c.id) > 0
    ORDER BY COUNT(DISTINCT c.id) DESC
  );
END;
$$;

-- 7. analytics_proposal_to_win_velocity
-- Tempo mediano: envio de proposta → ganho, por Planner
-- Usa primeira versão da proposta como proxy (proposal_versions)
CREATE OR REPLACE FUNCTION public.analytics_proposal_to_win_velocity(
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_product TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();
  v_date_start DATE := COALESCE(p_from, CURRENT_DATE - 90);
  v_date_end DATE := COALESCE(p_to, CURRENT_DATE);
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'planners',
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'planner_id', p.id,
            'planner_name', p.nome,
            'median_days', ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days_to_win)::NUMERIC, 1),
            'p75_days', ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY days_to_win)::NUMERIC, 1),
            'sample_count', COUNT(DISTINCT c.id)
          )
        ),
        '[]'::JSONB
      )
    )
    FROM profiles p
    LEFT JOIN cards c ON c.org_id = v_org
      AND c.vendas_owner_id = p.id
      AND c.ganho_planner = TRUE
      AND DATE(c.ganho_planner_at) >= v_date_start
      AND DATE(c.ganho_planner_at) <= v_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
    LEFT JOIN proposal_versions pv ON pv.card_id = c.id
      AND pv.created_at = (
        SELECT MIN(created_at) FROM proposal_versions WHERE card_id = c.id
      )
    LEFT JOIN LATERAL (
      SELECT EXTRACT(DAY FROM c.ganho_planner_at - pv.created_at)::INT AS days_to_win
    ) calc ON TRUE
    WHERE p.org_id = v_org
    GROUP BY p.id, p.nome
    ORDER BY PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
      (EXTRACT(DAY FROM c.ganho_planner_at - pv.created_at))::INT
    ) DESC NULLS LAST
  );
END;
$$;

COMMENT ON FUNCTION analytics_trip_states IS 'Estado das viagens fechadas (em_montagem/em_andamento/concluída/cancelada)';
COMMENT ON FUNCTION analytics_post_issues IS '% cards ganhos com tarefas vencidas após fechamento';
COMMENT ON FUNCTION analytics_return_customers IS 'Clientes que voltaram (repeat purchase)';
COMMENT ON FUNCTION analytics_planner_open_portfolio IS 'Carteira aberta por Planner';
COMMENT ON FUNCTION analytics_overdue_tasks_by_owner IS 'Tarefas vencidas do time';
COMMENT ON FUNCTION analytics_loss_reasons_by_planner IS 'Motivos de perda por Planner';
COMMENT ON FUNCTION analytics_proposal_to_win_velocity IS 'Tempo mediano proposta→ganho por Planner';
