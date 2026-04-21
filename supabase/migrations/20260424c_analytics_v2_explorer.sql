-- =========================================================================
-- Fase 2 Analytics v2 — Bloco 3 (parte C): RPC Explorer dinâmico
--
-- 13. analytics_explorer_query — pivot dinâmico (measure × group_by × cross_with)
--
-- Segurança: todos os nomes de medidas e dimensões passam por whitelist.
-- Valores literais (filtros, datas, owner_id) são passados via bind param
-- (USING), nunca concatenados no SQL.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.analytics_explorer_query(
  p_measure TEXT,
  p_group_by TEXT,
  p_cross_with TEXT DEFAULT NULL,
  p_filters JSONB DEFAULT '{}'::JSONB,
  p_from DATE DEFAULT (CURRENT_DATE - INTERVAL '90 days')::date,
  p_to DATE DEFAULT CURRENT_DATE,
  p_limit INT DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID := requesting_org_id();

  v_measure_sql TEXT;
  v_dim1_sql TEXT;
  v_dim1_label TEXT;
  v_dim2_sql TEXT;
  v_dim2_label TEXT;
  v_is_crosstab BOOLEAN := (p_cross_with IS NOT NULL AND p_cross_with <> '');

  v_base_table TEXT := 'cards';
  v_final_sql TEXT;
  v_result JSONB;

  -- Filtros extraídos do JSONB
  v_f_product TEXT := NULLIF(p_filters->>'product', '');
  v_f_origem TEXT[] := CASE WHEN jsonb_typeof(p_filters->'origem') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'origem'))::TEXT[]
    ELSE NULL END;
  v_f_phase_slugs TEXT[] := CASE WHEN jsonb_typeof(p_filters->'phase_slugs') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'phase_slugs'))::TEXT[]
    ELSE NULL END;
  v_f_lead_entry_path TEXT := NULLIF(p_filters->>'lead_entry_path', '');
  v_f_destinos TEXT[] := CASE WHEN jsonb_typeof(p_filters->'destinos') = 'array'
    THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'destinos'))::TEXT[]
    ELSE NULL END;
  v_f_owner_id UUID := NULLIF(p_filters->>'owner_id', '')::UUID;
BEGIN
  -- Validar período máximo (24 meses)
  IF p_to - p_from > 730 THEN
    RAISE EXCEPTION 'Periodo maximo de 24 meses excedido';
  END IF;

  -- ----- MEASURE WHITELIST -----
  CASE p_measure
    WHEN 'count_cards' THEN v_measure_sql := 'COUNT(DISTINCT c.id)::NUMERIC';
    WHEN 'sum_revenue' THEN v_measure_sql := 'COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado, 0)) FILTER (WHERE c.ganho_planner), 0)::NUMERIC';
    WHEN 'avg_ticket' THEN v_measure_sql := 'ROUND(AVG(COALESCE(c.valor_final, c.valor_estimado, 0)) FILTER (WHERE c.ganho_planner)::NUMERIC, 2)';
    WHEN 'count_ganho_sdr' THEN v_measure_sql := 'COUNT(*) FILTER (WHERE c.ganho_sdr)::NUMERIC';
    WHEN 'count_ganho_planner' THEN v_measure_sql := 'COUNT(*) FILTER (WHERE c.ganho_planner)::NUMERIC';
    WHEN 'count_ganho_pos' THEN v_measure_sql := 'COUNT(*) FILTER (WHERE c.ganho_pos)::NUMERIC';
    WHEN 'conversion_planner_pct' THEN
      v_measure_sql := 'CASE WHEN COUNT(*) > 0 THEN ROUND(100.0 * COUNT(*) FILTER (WHERE c.ganho_planner)::NUMERIC / COUNT(*), 1) ELSE 0 END';
    WHEN 'avg_quality_score' THEN v_measure_sql := 'ROUND(AVG(c.quality_score_pct)::NUMERIC, 1)';
    WHEN 'avg_days_to_planner_win' THEN
      v_measure_sql := 'ROUND(AVG(EXTRACT(EPOCH FROM (c.ganho_planner_at - c.created_at)) / 86400.0) FILTER (WHERE c.ganho_planner AND c.ganho_planner_at IS NOT NULL)::NUMERIC, 1)';
    WHEN 'avg_stage_age_days' THEN
      v_measure_sql := 'ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400.0) FILTER (WHERE c.stage_entered_at IS NOT NULL)::NUMERIC, 1)';
    ELSE RAISE EXCEPTION 'Measure invalida: %', p_measure;
  END CASE;

  -- ----- DIMENSION WHITELIST (dim1 = group_by) -----
  SELECT dim_sql, dim_label INTO v_dim1_sql, v_dim1_label
  FROM (VALUES
    ('owner', 'COALESCE(pr_owner.nome, ''(sem dono)'')', 'owner'),
    ('sdr_owner', 'COALESCE(pr_sdr.nome, ''(sem SDR)'')', 'sdr_owner'),
    ('planner_owner', 'COALESCE(pr_planner.nome, ''(sem planner)'')', 'planner_owner'),
    ('pos_owner', 'COALESCE(pr_pos.nome, ''(sem pos)'')', 'pos_owner'),
    ('stage', 'COALESCE(ps.nome, ''(sem stage)'')', 'stage'),
    ('phase', 'COALESCE(pp.label, ''(sem fase)'')', 'phase'),
    ('origem', 'COALESCE(c.origem, ''(sem origem)'')', 'origem'),
    ('lead_entry_path', 'COALESCE(c.lead_entry_path, ''(unknown)'')', 'lead_entry_path'),
    ('product', 'c.produto::TEXT', 'product'),
    ('destino', 'COALESCE(c.produto_data->>''destino'', c.produto_data->>''destino_roteiro'', (c.produto_data->''destinos''->>0), ''(sem destino)'')', 'destino'),
    ('month', 'TO_CHAR(DATE_TRUNC(''month'', c.created_at), ''YYYY-MM'')', 'month'),
    ('week', 'TO_CHAR(DATE_TRUNC(''week'', c.created_at), ''YYYY-IW'')', 'week'),
    ('day', 'TO_CHAR(c.created_at::date, ''YYYY-MM-DD'')', 'day')
  ) AS t(dim_key, dim_sql, dim_label)
  WHERE dim_key = p_group_by;

  IF v_dim1_sql IS NULL THEN
    RAISE EXCEPTION 'group_by invalido: %', p_group_by;
  END IF;

  -- ----- DIMENSION WHITELIST (dim2 = cross_with) -----
  IF v_is_crosstab THEN
    SELECT dim_sql, dim_label INTO v_dim2_sql, v_dim2_label
    FROM (VALUES
      ('owner', 'COALESCE(pr_owner.nome, ''(sem dono)'')', 'owner'),
      ('sdr_owner', 'COALESCE(pr_sdr.nome, ''(sem SDR)'')', 'sdr_owner'),
      ('planner_owner', 'COALESCE(pr_planner.nome, ''(sem planner)'')', 'planner_owner'),
      ('pos_owner', 'COALESCE(pr_pos.nome, ''(sem pos)'')', 'pos_owner'),
      ('stage', 'COALESCE(ps.nome, ''(sem stage)'')', 'stage'),
      ('phase', 'COALESCE(pp.label, ''(sem fase)'')', 'phase'),
      ('origem', 'COALESCE(c.origem, ''(sem origem)'')', 'origem'),
      ('lead_entry_path', 'COALESCE(c.lead_entry_path, ''(unknown)'')', 'lead_entry_path'),
      ('product', 'c.produto::TEXT', 'product'),
      ('destino', 'COALESCE(c.produto_data->>''destino'', c.produto_data->>''destino_roteiro'', (c.produto_data->''destinos''->>0), ''(sem destino)'')', 'destino'),
      ('month', 'TO_CHAR(DATE_TRUNC(''month'', c.created_at), ''YYYY-MM'')', 'month'),
      ('week', 'TO_CHAR(DATE_TRUNC(''week'', c.created_at), ''YYYY-IW'')', 'week'),
      ('day', 'TO_CHAR(c.created_at::date, ''YYYY-MM-DD'')', 'day')
    ) AS t(dim_key, dim_sql, dim_label)
    WHERE dim_key = p_cross_with;

    IF v_dim2_sql IS NULL THEN
      RAISE EXCEPTION 'cross_with invalido: %', p_cross_with;
    END IF;

    IF p_group_by = p_cross_with THEN
      RAISE EXCEPTION 'group_by e cross_with nao podem ser iguais';
    END IF;
  END IF;

  -- ----- BUILD DYNAMIC SQL -----
  v_final_sql := format($sql$
    WITH base AS (
      SELECT c.*
      FROM cards c
      WHERE c.org_id = $1
        AND c.deleted_at IS NULL
        AND c.created_at >= $2
        AND c.created_at < ($3 + INTERVAL '1 day')
        AND ($4::TEXT IS NULL OR c.produto::TEXT = $4)
        AND public._a_origem_ok(c.origem, $5)
        AND public._a_entry_path_ok(c.lead_entry_path, $6)
        AND public._a_destino_ok(c.produto_data, $7)
        AND public._a_phase_ok(c.pipeline_stage_id, $8)
        AND ($9::UUID IS NULL OR c.dono_atual_id = $9)
    ),
    agg AS (
      SELECT
        %s AS dim1_value,
        %s AS dim2_value,
        %s AS measure_value
      FROM base c
      LEFT JOIN profiles pr_owner ON pr_owner.id = c.dono_atual_id
      LEFT JOIN profiles pr_sdr ON pr_sdr.id = c.sdr_owner_id
      LEFT JOIN profiles pr_planner ON pr_planner.id = c.vendas_owner_id
      LEFT JOIN profiles pr_pos ON pr_pos.id = c.pos_owner_id
      LEFT JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases pp ON pp.id = ps.phase_id
      GROUP BY 1, 2
      ORDER BY 3 DESC NULLS LAST
      LIMIT $10
    )
    SELECT jsonb_build_object(
      'measure', $11::TEXT,
      'group_by', $12::TEXT,
      'cross_with', $13::TEXT,
      'rows', COALESCE(jsonb_agg(
        jsonb_build_object('dim1', dim1_value, 'dim2', dim2_value, 'value', measure_value)
      ), '[]'::jsonb)
    )
    FROM agg;
  $sql$,
    v_dim1_sql,
    COALESCE(v_dim2_sql, 'NULL'),
    v_measure_sql
  );

  EXECUTE v_final_sql
  USING
    v_org,
    p_from,
    p_to,
    v_f_product,
    v_f_origem,
    v_f_lead_entry_path,
    v_f_destinos,
    v_f_phase_slugs,
    v_f_owner_id,
    p_limit,
    p_measure,
    p_group_by,
    p_cross_with
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_explorer_query(TEXT, TEXT, TEXT, JSONB, DATE, DATE, INT) TO authenticated;

-- Helper: listar measures e dimensions disponíveis para o frontend
CREATE OR REPLACE FUNCTION public.analytics_explorer_schema()
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'measures', jsonb_build_array(
      jsonb_build_object('key', 'count_cards', 'label', '# de cards', 'format', 'integer'),
      jsonb_build_object('key', 'sum_revenue', 'label', 'Receita total (ganho planner)', 'format', 'currency'),
      jsonb_build_object('key', 'avg_ticket', 'label', 'Ticket médio', 'format', 'currency'),
      jsonb_build_object('key', 'count_ganho_sdr', 'label', '# handoffs SDR', 'format', 'integer'),
      jsonb_build_object('key', 'count_ganho_planner', 'label', '# ganhos Planner', 'format', 'integer'),
      jsonb_build_object('key', 'count_ganho_pos', 'label', '# entregas Pós', 'format', 'integer'),
      jsonb_build_object('key', 'conversion_planner_pct', 'label', '% conversão para Ganho Planner', 'format', 'percent'),
      jsonb_build_object('key', 'avg_quality_score', 'label', 'Score de qualidade médio', 'format', 'percent'),
      jsonb_build_object('key', 'avg_days_to_planner_win', 'label', 'Dias até ganho Planner', 'format', 'days'),
      jsonb_build_object('key', 'avg_stage_age_days', 'label', 'Idade média na fase (dias)', 'format', 'days')
    ),
    'dimensions', jsonb_build_array(
      jsonb_build_object('key', 'owner', 'label', 'Dono atual'),
      jsonb_build_object('key', 'sdr_owner', 'label', 'SDR responsável'),
      jsonb_build_object('key', 'planner_owner', 'label', 'Travel Planner'),
      jsonb_build_object('key', 'pos_owner', 'label', 'Pós-Venda'),
      jsonb_build_object('key', 'stage', 'label', 'Etapa'),
      jsonb_build_object('key', 'phase', 'label', 'Seção (fase)'),
      jsonb_build_object('key', 'origem', 'label', 'Origem'),
      jsonb_build_object('key', 'lead_entry_path', 'label', 'Caminho de entrada'),
      jsonb_build_object('key', 'product', 'label', 'Produto'),
      jsonb_build_object('key', 'destino', 'label', 'Destino principal'),
      jsonb_build_object('key', 'month', 'label', 'Mês'),
      jsonb_build_object('key', 'week', 'label', 'Semana'),
      jsonb_build_object('key', 'day', 'label', 'Dia')
    ),
    'visualizations', jsonb_build_array('table', 'bar', 'line', 'heatmap')
  );
$$;

GRANT EXECUTE ON FUNCTION public.analytics_explorer_schema() TO authenticated;

-- =========================================================================
-- FIM: Parte C — Explorer dinâmico
-- =========================================================================
