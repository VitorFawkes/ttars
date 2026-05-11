-- =========================================================================
-- Analytics v2 — Widgets do VendasDashboard (7 RPCs)
--
-- 1. analytics_viagens_estado          — distribuição de viagens por estado
-- 2. analytics_problemas_no_pos        — % cards fechados com tarefa vencida pós-ganho
-- 3. analytics_retorno_pos_viagem      — contador de clientes retornantes
-- 4. analytics_carteira_aberta_planner — tabela: Planner | cards | valor | ticket
-- 5. analytics_tarefas_vencidas_time   — tarefas vencidas por Planner
-- 6. analytics_motivos_perda_planner   — motivos de perda x Planner
-- 7. analytics_tempo_proposta_ganho    — p50/p75 Proposta→Ganho por Planner
--
-- Padrão: dialeto p_from/p_to (DATE), mantém filtros universais.
-- =========================================================================

-- =====================================================================
-- 1) analytics_viagens_estado
-- Distribuição de viagens fechadas por estado.
-- Estados derivados de:
-- - em_montagem: card em fase "vendas" ou "pós-venda", viagem aindanão iniciada
-- - em_andamento: viagem.data_viagem_inicio <= today <= data_viagem_fim
-- - concluida: viagem.data_viagem_fim < today
-- - cancelada: cards.cancelada_em IS NOT NULL
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_viagens_estado(
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
    SELECT c.id, c.ganho_planner_at, c.cancelada_em, c.data_viagem_fim
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.vendas_owner_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND c.ganho_planner_at >= p_from
      AND c.ganho_planner_at < (p_to + INTERVAL '1 day')
  ),
  viagens_estado AS (
    SELECT
      CASE
        WHEN cf.cancelada_em IS NOT NULL THEN 'cancelada'
        WHEN cf.data_viagem_fim IS NULL THEN 'em_montagem'
        WHEN cf.data_viagem_fim < CURRENT_DATE THEN 'concluida'
        ELSE 'em_andamento'
      END AS estado,
      COUNT(*) AS count
    FROM card_filter cf
    GROUP BY estado
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'estado', estado,
      'count', count
    ) ORDER BY
      CASE estado
        WHEN 'em_montagem' THEN 1
        WHEN 'em_andamento' THEN 2
        WHEN 'concluida' THEN 3
        WHEN 'cancelada' THEN 4
        ELSE 5
      END
  )
  INTO v_result
  FROM viagens_estado;

  RETURN jsonb_build_object('estados', COALESCE(v_result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_viagens_estado(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[], UUID) TO authenticated;

-- =====================================================================
-- 2) analytics_problemas_no_pos
-- % de cards fechados (ganho_planner_at no período) que ficaram com
-- tarefa vencida (due_date < today, status != concluida) DEPOIS do fechamento.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_problemas_no_pos(
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
  v_total INT;
  v_problemas INT;
BEGIN
  -- Cards ganhos no período
  WITH card_filter AS (
    SELECT c.id, c.ganho_planner_at
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.vendas_owner_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND c.ganho_planner_at >= p_from
      AND c.ganho_planner_at < (p_to + INTERVAL '1 day')
  ),
  -- Cards com tarefas vencidas APÓS ganho
  problemas AS (
    SELECT DISTINCT cf.id
    FROM card_filter cf
    JOIN tarefas t ON t.card_id = cf.id
    WHERE t.org_id = v_org
      AND t.data_vencimento < CURRENT_DATE
      AND t.status != 'concluida'
      AND t.data_vencimento > cf.ganho_planner_at
  )
  SELECT
    COUNT(*) FILTER (WHERE cf.id IS NOT NULL) INTO v_total
    FROM card_filter cf;

  SELECT
    COUNT(*) INTO v_problemas
    FROM problemas;

  RETURN jsonb_build_object(
    'total_cards_fechados', v_total,
    'cards_com_problema', v_problemas,
    'pct_com_problema', CASE WHEN v_total > 0
      THEN ROUND((v_problemas::NUMERIC / v_total) * 100, 1)
      ELSE 0 END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_problemas_no_pos(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[], UUID) TO authenticated;

-- =====================================================================
-- 3) analytics_retorno_pos_viagem
-- Contador de clientes (contatos_id) que tiveram viagem concluída (data_viagem_fim < today)
-- E retornaram com novo card no período (ganho_planner_at dentro do período).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_retorno_pos_viagem(
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
  v_count INT;
BEGIN
  -- Clientes que retornaram
  WITH card_filter AS (
    SELECT c.id, c.contatos_id, c.ganho_planner_at
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.vendas_owner_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND c.ganho_planner_at >= p_from
      AND c.ganho_planner_at < (p_to + INTERVAL '1 day')
  ),
  clientes_com_conclusao_anterior AS (
    SELECT DISTINCT c.contatos_id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.data_viagem_fim IS NOT NULL
      AND c.data_viagem_fim < CURRENT_DATE
      AND c.ganho_planner_at < p_from
  ),
  retornantes AS (
    SELECT DISTINCT cf.contatos_id
    FROM card_filter cf
    WHERE cf.contatos_id IN (SELECT contatos_id FROM clientes_com_conclusao_anterior)
  )
  SELECT COUNT(*) INTO v_count FROM retornantes;

  RETURN jsonb_build_object('retornantes_count', COALESCE(v_count, 0));
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_retorno_pos_viagem(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[], UUID) TO authenticated;

-- =====================================================================
-- 4) analytics_carteira_aberta_planner
-- Tabela: Planner (vendas_owner_id) | cards ativos | valor aberto | ticket médio
-- "Ativo" = ganho_planner_at < today, data_viagem_fim > today (ou NULL se ainda em montagem)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_carteira_aberta_planner(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
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
  WITH ativo_cards AS (
    SELECT
      c.vendas_owner_id,
      p.nome AS planner_name,
      c.id,
      COALESCE(c.valor_final, c.valor_estimado, 0) AS valor
    FROM cards c
    LEFT JOIN profiles p ON p.id = c.vendas_owner_id
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND c.ganho_planner_at IS NOT NULL
      AND c.ganho_planner_at < CURRENT_DATE
      AND (c.data_viagem_fim IS NULL OR c.data_viagem_fim > CURRENT_DATE)
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
  ),
  por_planner AS (
    SELECT
      vendas_owner_id,
      planner_name,
      COUNT(*) AS total_cards,
      SUM(valor) AS total_valor,
      ROUND(AVG(valor)::NUMERIC, 2) AS ticket_medio
    FROM ativo_cards
    GROUP BY vendas_owner_id, planner_name
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'planner_id', vendas_owner_id,
      'planner_name', COALESCE(planner_name, '—'),
      'total_cards', total_cards,
      'total_valor', total_valor,
      'ticket_medio', ticket_medio
    ) ORDER BY total_valor DESC NULLS LAST
  )
  INTO v_result
  FROM por_planner;

  RETURN jsonb_build_object('planners', COALESCE(v_result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_carteira_aberta_planner(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[]) TO authenticated;

-- =====================================================================
-- 5) analytics_tarefas_vencidas_time
-- Contador de tarefas vencidas agrupadas por dono (responsavel_id → profile.nome)
-- Filtra por org_id e status != concluida, data_vencimento < today
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_tarefas_vencidas_time(
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
    SELECT c.id
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
  ),
  tarefas_vencidas AS (
    SELECT
      t.responsavel_id,
      pr.nome AS responsavel_nome,
      COUNT(*) AS count
    FROM tarefas t
    LEFT JOIN profiles pr ON pr.id = t.responsavel_id
    JOIN card_filter cf ON cf.id = t.card_id
    WHERE t.org_id = v_org
      AND t.status != 'concluida'
      AND t.data_vencimento < CURRENT_DATE
    GROUP BY t.responsavel_id, pr.nome
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'owner_id', responsavel_id,
      'owner_name', COALESCE(responsavel_nome, '—'),
      'count', count
    ) ORDER BY count DESC
  )
  INTO v_result
  FROM tarefas_vencidas;

  RETURN jsonb_build_object('tasks', COALESCE(v_result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_tarefas_vencidas_time(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[], UUID) TO authenticated;

-- =====================================================================
-- 6) analytics_motivos_perda_planner
-- Tabela cruzada: Planner (vendas_owner_id) × motivo de perda
-- Filtra cards com ganho_planner_at = NULL (perdidos) no período
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_motivos_perda_planner(
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
    SELECT c.id, c.vendas_owner_id, c.produto_data->>'motivo_perda' AS motivo
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_owner_ok(c.vendas_owner_id, p_owner_id, NULL)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND c.ganho_planner_at IS NULL
      AND c.cancelada_em >= p_from
      AND c.cancelada_em < (p_to + INTERVAL '1 day')
  ),
  perda_data AS (
    SELECT
      cf.vendas_owner_id,
      pr.nome AS planner_name,
      COALESCE(cf.motivo, 'sem_motivo') AS motivo,
      COUNT(*) AS count
    FROM card_filter cf
    LEFT JOIN profiles pr ON pr.id = cf.vendas_owner_id
    GROUP BY cf.vendas_owner_id, pr.nome, COALESCE(cf.motivo, 'sem_motivo')
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'planner_id', vendas_owner_id,
      'planner_name', COALESCE(planner_name, '—'),
      'motivo', motivo,
      'count', count
    ) ORDER BY count DESC
  )
  INTO v_result
  FROM perda_data;

  RETURN jsonb_build_object('losses', COALESCE(v_result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_motivos_perda_planner(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[], UUID) TO authenticated;

-- =====================================================================
-- 7) analytics_tempo_proposta_ganho
-- p50/p75 do tempo (em dias) entre ganho_sdr_at e ganho_planner_at por Planner
-- Usa PERCENTILE_CONT com ORDER BY days WITHIN GROUP
-- =====================================================================
CREATE OR REPLACE FUNCTION public.analytics_tempo_proposta_ganho(
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_product TEXT DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
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
  WITH card_filter AS (
    SELECT
      c.id,
      c.vendas_owner_id,
      c.ganho_sdr_at,
      c.ganho_planner_at,
      EXTRACT(DAY FROM c.ganho_planner_at - c.ganho_sdr_at)::INT AS days
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_origem_ok(c.origem, p_origem)
      AND _a_entry_path_ok(c.lead_entry_path, p_lead_entry_path)
      AND _a_destino_ok(c.produto_data, p_destinos)
      AND _a_phase_ok(c.pipeline_stage_id, p_phase_slugs)
      AND c.ganho_sdr_at IS NOT NULL
      AND c.ganho_planner_at IS NOT NULL
      AND c.ganho_planner_at >= p_from
      AND c.ganho_planner_at < (p_to + INTERVAL '1 day')
  ),
  by_planner AS (
    SELECT
      vendas_owner_id,
      pr.nome AS planner_name,
      COUNT(*) AS total_proposals,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY days)::NUMERIC, 1) AS p50_days,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY days)::NUMERIC, 1) AS p75_days
    FROM card_filter cf
    LEFT JOIN profiles pr ON pr.id = cf.vendas_owner_id
    GROUP BY vendas_owner_id, pr.nome
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'planner_id', vendas_owner_id,
      'planner_name', COALESCE(planner_name, '—'),
      'total_proposals', total_proposals,
      'p50_days', p50_days,
      'p75_days', p75_days
    ) ORDER BY p75_days DESC NULLS LAST
  )
  INTO v_result
  FROM by_planner;

  RETURN jsonb_build_object('planners', COALESCE(v_result, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_tempo_proposta_ganho(DATE, DATE, TEXT, TEXT[], TEXT[], TEXT, TEXT[]) TO authenticated;
