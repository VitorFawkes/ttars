-- Fase 1 da auditoria de Analytics TRIPS (plan: melhores-pr-ticas-de-relat-rios-parsed-fiddle.md)
--
-- VERIFICAÇÃO (feedback_function_rebase_cuidado / CLAUDE.md TOP5 #5):
-- O corpo de CADA função abaixo foi extraído com pg_get_functiondef DIRETO DE PRODUÇÃO
-- (szyrzxvlptqqheizyrxu) em 2026-05-30 — NÃO de migrations antigas. Cada versão reproduz
-- exatamente o estado vigente de prod + apenas a mudança pontual anotada com "✨ FIX".
-- Usa DROP IF EXISTS + CREATE (padrão de 20260527n/20260523b), atômico dentro da transação
-- da migration. Confirmado: cada função tem exatamente 1 overload.
--
-- Corrige nas RPCs LIVE de analytics-new (/analytics):
--   P0  analytics_pipeline_current      → faltava isolamento de org (SECURITY DEFINER vazava cross-org).
--   P1  analytics_financeiro_overview   → (produto_data->>'data_prevista_fechamento')::DATE sem guarda → crash 22007 com '' / data inválida.
--   P1  analytics_planner_forecast_by_dono → SUBSTRING(...)::DATE; regex do WHERE deixa passar '2026-99-99' → crash no SELECT.
--   P2  analytics_sdr_follow_through    → faltava deleted_at/archived_at e sub_card (inflava handoffs).
--   P2  analytics_concierge_pendentes   → faltava deleted_at/archived_at e sub_card no join de cards.
--
-- analytics_team_performance NÃO é tocada: prod JÁ tem c.org_id = requesting_org_id() nas 3 CTEs
-- (a migration 20260313 está defasada; recriar reverteria o fix de prod).

-- ═══ 0. Helper _safe_date (texto→DATE, NULL em vazio/inválido; pega '2026-99-99') ═══
CREATE OR REPLACE FUNCTION public._safe_date(p_txt TEXT)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
BEGIN
    IF p_txt IS NULL OR TRIM(p_txt) = '' THEN
        RETURN NULL;
    END IF;
    RETURN (SUBSTRING(TRIM(p_txt) FROM 1 FOR 10))::DATE;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public._safe_date(TEXT) TO authenticated;

-- ═══ 1. analytics_pipeline_current — P0 isolamento de org ═══════
DROP FUNCTION IF EXISTS public.analytics_pipeline_current(text, uuid[], uuid[], text, numeric, numeric);
CREATE FUNCTION public.analytics_pipeline_current(
    p_product    TEXT     DEFAULT NULL,
    p_owner_ids  UUID[]   DEFAULT NULL,
    p_tag_ids    UUID[]   DEFAULT NULL,
    p_date_ref   TEXT     DEFAULT 'stage',
    p_value_min  NUMERIC  DEFAULT NULL,
    p_value_max  NUMERIC  DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $fn$
DECLARE
    v_result JSONB;
BEGIN
    WITH open_cards AS (
        SELECT
            c.id, c.titulo, c.pipeline_stage_id, c.dono_atual_id,
            COALESCE(c.valor_final, c.valor_estimado, 0) AS valor,
            COALESCE(c.receita, 0) AS receita_val,
            c.produto, c.created_at, c.stage_entered_at,
            CASE WHEN p_date_ref = 'created'
                 THEN EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400.0
                 ELSE EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400.0
            END AS days_in_stage,
            s.nome AS stage_nome, s.ordem, s.sla_hours,
            pp.label AS fase, pp.slug AS fase_slug, pp.order_index AS fase_order,
            p.nome AS owner_nome, co.nome AS pessoa_nome
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        LEFT JOIN profiles p ON p.id = c.dono_atual_id
        LEFT JOIN contatos co ON co.id = c.pessoa_principal_id
        WHERE c.org_id = requesting_org_id()   -- ✨ FIX P0: isolamento de org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.data_fechamento IS NULL
          AND COALESCE(s.is_won, false) = false
          AND COALESCE(s.is_lost, false) = false
          AND s.ativo = true
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND (p_value_min IS NULL OR COALESCE(c.valor_final, c.valor_estimado, 0) >= p_value_min)
          AND (p_value_max IS NULL OR COALESCE(c.valor_final, c.valor_estimado, 0) <= p_value_max)
    ),
    kpis AS (
        SELECT jsonb_build_object(
            'total_open', COUNT(*),
            'total_value', COALESCE(SUM(valor), 0),
            'total_receita', COALESCE(SUM(receita_val), 0),
            'avg_ticket', CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(valor), 0) / COUNT(*)::NUMERIC, 0) ELSE 0 END,
            'avg_receita_ticket', CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(receita_val), 0) / COUNT(*)::NUMERIC, 0) ELSE 0 END,
            'avg_age_days', ROUND(COALESCE(AVG(days_in_stage), 0)::NUMERIC, 1),
            'sla_breach_count', COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours),
            'sla_breach_pct', ROUND(
                CASE WHEN COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0) > 0
                THEN COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours)::NUMERIC
                     / COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0)::NUMERIC * 100
                ELSE 0 END, 1)
        ) AS val FROM open_cards
    ),
    stages AS (
        SELECT jsonb_agg(row_data ORDER BY fase_order, ordem) AS val FROM (
            SELECT jsonb_build_object(
                'stage_id', pipeline_stage_id, 'stage_nome', stage_nome, 'fase', fase, 'fase_slug', fase_slug,
                'produto', produto, 'ordem', ordem, 'card_count', COUNT(*),
                'valor_total', COALESCE(SUM(valor), 0), 'receita_total', COALESCE(SUM(receita_val), 0),
                'avg_days', ROUND(AVG(days_in_stage)::NUMERIC, 1),
                'sla_breach_count', COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours)
            ) AS row_data, MIN(fase_order) AS fase_order, MIN(ordem) AS ordem
            FROM open_cards
            GROUP BY pipeline_stage_id, stage_nome, fase, fase_slug, produto, open_cards.ordem
        ) sub
    ),
    aging AS (
        SELECT jsonb_agg(row_data ORDER BY fase_order, ordem) AS val FROM (
            SELECT jsonb_build_object(
                'stage_id', pipeline_stage_id, 'stage_nome', stage_nome, 'fase', fase, 'fase_slug', fase_slug,
                'bucket_0_3', COUNT(*) FILTER (WHERE days_in_stage <= 3),
                'bucket_3_7', COUNT(*) FILTER (WHERE days_in_stage > 3 AND days_in_stage <= 7),
                'bucket_7_14', COUNT(*) FILTER (WHERE days_in_stage > 7 AND days_in_stage <= 14),
                'bucket_14_plus', COUNT(*) FILTER (WHERE days_in_stage > 14)
            ) AS row_data, MIN(fase_order) AS fase_order, MIN(ordem) AS ordem
            FROM open_cards GROUP BY pipeline_stage_id, stage_nome, fase, fase_slug
        ) sub
    ),
    owners AS (
        SELECT jsonb_agg(row_data ORDER BY total_cards DESC) AS val FROM (
            SELECT jsonb_build_object(
                'owner_id', dono_atual_id, 'owner_nome', COALESCE(owner_nome, 'Não atribuído'),
                'total_cards', COUNT(*), 'total_value', COALESCE(SUM(valor), 0),
                'total_receita', COALESCE(SUM(receita_val), 0),
                'avg_age_days', ROUND(AVG(days_in_stage)::NUMERIC, 1),
                'sla_breach', COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours),
                'by_phase', jsonb_build_object(
                    'sdr', COUNT(*) FILTER (WHERE fase_slug = 'sdr'),
                    'planner', COUNT(*) FILTER (WHERE fase_slug = 'planner'),
                    'pos-venda', COUNT(*) FILTER (WHERE fase_slug NOT IN ('sdr', 'planner', 'resolucao'))),
                'by_phase_value', jsonb_build_object(
                    'sdr', COALESCE(SUM(valor) FILTER (WHERE fase_slug = 'sdr'), 0),
                    'planner', COALESCE(SUM(valor) FILTER (WHERE fase_slug = 'planner'), 0),
                    'pos-venda', COALESCE(SUM(valor) FILTER (WHERE fase_slug NOT IN ('sdr', 'planner', 'resolucao')), 0)),
                'by_phase_receita', jsonb_build_object(
                    'sdr', COALESCE(SUM(receita_val) FILTER (WHERE fase_slug = 'sdr'), 0),
                    'planner', COALESCE(SUM(receita_val) FILTER (WHERE fase_slug = 'planner'), 0),
                    'pos-venda', COALESCE(SUM(receita_val) FILTER (WHERE fase_slug NOT IN ('sdr', 'planner', 'resolucao')), 0))
            ) AS row_data, COUNT(*) AS total_cards
            FROM open_cards GROUP BY dono_atual_id, owner_nome
        ) sub
    ),
    top_deals AS (
        SELECT jsonb_agg(row_data ORDER BY dis DESC) AS val FROM (
            SELECT jsonb_build_object(
                'card_id', id, 'titulo', titulo, 'stage_nome', stage_nome, 'fase', fase, 'fase_slug', fase_slug,
                'owner_nome', COALESCE(owner_nome, 'Não atribuído'), 'owner_id', dono_atual_id,
                'valor_total', valor, 'receita', receita_val,
                'days_in_stage', ROUND(days_in_stage::NUMERIC, 1), 'sla_hours', sla_hours,
                'is_sla_breach', (sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours),
                'pessoa_nome', pessoa_nome
            ) AS row_data, days_in_stage AS dis
            FROM open_cards ORDER BY days_in_stage DESC LIMIT 15
        ) sub
    ),
    tasks AS (
        SELECT jsonb_build_object(
            'total_created', COUNT(t.id),
            'total_completed', COUNT(t.id) FILTER (WHERE t.concluida = true),
            'total_pending', COUNT(t.id) FILTER (WHERE t.concluida = false),
            'total_overdue', COUNT(t.id) FILTER (WHERE t.concluida = false AND t.data_vencimento < NOW()),
            'completion_rate', ROUND(CASE WHEN COUNT(t.id) > 0
                THEN COUNT(t.id) FILTER (WHERE t.concluida = true)::NUMERIC / COUNT(t.id)::NUMERIC * 100
                ELSE 0 END, 1),
            'by_type', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('tipo', sub.tipo, 'total', sub.type_total,
                    'completed', sub.type_completed, 'pending', sub.type_pending, 'overdue', sub.type_overdue
                ) ORDER BY sub.type_total DESC)
                FROM (SELECT t2.tipo, COUNT(*) AS type_total,
                    COUNT(*) FILTER (WHERE t2.concluida = true) AS type_completed,
                    COUNT(*) FILTER (WHERE t2.concluida = false) AS type_pending,
                    COUNT(*) FILTER (WHERE t2.concluida = false AND t2.data_vencimento < NOW()) AS type_overdue
                FROM tarefas t2 INNER JOIN open_cards oc2 ON oc2.id = t2.card_id
                WHERE t2.deleted_at IS NULL GROUP BY t2.tipo) sub), '[]'::jsonb),
            'by_stage', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('stage_id', sub.pipeline_stage_id,
                    'stage_nome', sub.stage_nome, 'fase', sub.fase, 'fase_slug', sub.fase_slug,
                    'card_count', sub.card_count, 'total', sub.stage_total,
                    'completed', sub.stage_completed, 'pending', sub.stage_pending, 'overdue', sub.stage_overdue
                ) ORDER BY sub.fase_order, sub.ordem)
                FROM (SELECT oc3.pipeline_stage_id, oc3.stage_nome, oc3.fase, oc3.fase_slug,
                    MIN(oc3.fase_order) AS fase_order, MIN(oc3.ordem) AS ordem,
                    COUNT(DISTINCT oc3.id) AS card_count, COUNT(t3.id) AS stage_total,
                    COUNT(t3.id) FILTER (WHERE t3.concluida = true) AS stage_completed,
                    COUNT(t3.id) FILTER (WHERE t3.concluida = false) AS stage_pending,
                    COUNT(t3.id) FILTER (WHERE t3.concluida = false AND t3.data_vencimento < NOW()) AS stage_overdue
                FROM open_cards oc3 LEFT JOIN tarefas t3 ON t3.card_id = oc3.id AND t3.deleted_at IS NULL
                GROUP BY oc3.pipeline_stage_id, oc3.stage_nome, oc3.fase, oc3.fase_slug) sub), '[]'::jsonb),
            'by_owner', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('owner_id', sub.dono_atual_id,
                    'owner_nome', COALESCE(sub.owner_nome, 'Não atribuído'), 'card_count', sub.card_count,
                    'total', sub.owner_total, 'completed', sub.owner_completed,
                    'pending', sub.owner_pending, 'overdue', sub.owner_overdue
                ) ORDER BY sub.owner_total DESC)
                FROM (SELECT oc4.dono_atual_id, oc4.owner_nome,
                    COUNT(DISTINCT oc4.id) AS card_count, COUNT(t4.id) AS owner_total,
                    COUNT(t4.id) FILTER (WHERE t4.concluida = true) AS owner_completed,
                    COUNT(t4.id) FILTER (WHERE t4.concluida = false) AS owner_pending,
                    COUNT(t4.id) FILTER (WHERE t4.concluida = false AND t4.data_vencimento < NOW()) AS owner_overdue
                FROM open_cards oc4 LEFT JOIN tarefas t4 ON t4.card_id = oc4.id AND t4.deleted_at IS NULL
                GROUP BY oc4.dono_atual_id, oc4.owner_nome) sub), '[]'::jsonb)
        ) AS val FROM tarefas t INNER JOIN open_cards oc ON oc.id = t.card_id WHERE t.deleted_at IS NULL
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT val FROM kpis),
        'stages', COALESCE((SELECT val FROM stages), '[]'::jsonb),
        'aging', COALESCE((SELECT val FROM aging), '[]'::jsonb),
        'owners', COALESCE((SELECT val FROM owners), '[]'::jsonb),
        'top_deals', COALESCE((SELECT val FROM top_deals), '[]'::jsonb),
        'tasks', COALESCE((SELECT val FROM tasks), '{}'::jsonb)
    ) INTO v_result;
    RETURN v_result;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.analytics_pipeline_current(text, uuid[], uuid[], text, numeric, numeric) TO authenticated;

-- ═══ 2. analytics_financeiro_overview — P1 cast de data seguro ══
DROP FUNCTION IF EXISTS public.analytics_financeiro_overview(timestamptz, timestamptz, text);
CREATE FUNCTION public.analytics_financeiro_overview(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_org UUID := requesting_org_id();
    v_result JSONB;
BEGIN
    WITH
    ganhos AS (
        SELECT
            c.id, c.valor_final, c.receita, c.origem, c.data_fechamento,
            c.vendas_owner_id, c.dono_atual_id
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'ganho'
          AND c.data_fechamento >= p_date_start
          AND c.data_fechamento < p_date_end
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    kpis AS (
        SELECT
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(receita), 0)::NUMERIC AS receita,
            CASE WHEN SUM(valor_final) > 0
                 THEN ROUND(SUM(receita) / SUM(valor_final) * 100, 1)
                 ELSE 0 END AS margem_pct,
            CASE WHEN COUNT(*) > 0
                 THEN ROUND(SUM(valor_final) / COUNT(*), 0)
                 ELSE 0 END::NUMERIC AS ticket_medio
        FROM ganhos
    ),
    serie_mensal AS (
        SELECT
            DATE_TRUNC('month', c.data_fechamento)::DATE AS mes,
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(c.valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(c.receita), 0)::NUMERIC AS receita
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'ganho'
          AND c.data_fechamento >= DATE_TRUNC('month', NOW() - INTERVAL '11 months')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
        GROUP BY 1
        ORDER BY 1
    ),
    por_origem AS (
        SELECT
            COALESCE(origem::TEXT, 'sem_origem') AS origem,
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(receita), 0)::NUMERIC AS receita,
            CASE WHEN SUM(valor_final) > 0
                 THEN ROUND(SUM(receita) / SUM(valor_final) * 100, 1)
                 ELSE 0 END AS margem_pct
        FROM ganhos
        GROUP BY 1
        ORDER BY faturamento DESC
    ),
    por_consultor AS (
        SELECT
            COALESCE(g.vendas_owner_id, g.dono_atual_id) AS user_id,
            prof.nome AS user_nome,
            COUNT(*)::BIGINT AS qtd,
            COALESCE(SUM(g.valor_final), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(g.receita), 0)::NUMERIC AS receita
        FROM ganhos g
        LEFT JOIN profiles prof ON prof.id = COALESCE(g.vendas_owner_id, g.dono_atual_id)
        WHERE COALESCE(g.vendas_owner_id, g.dono_atual_id) IS NOT NULL
        GROUP BY 1, prof.nome
        ORDER BY faturamento DESC
        LIMIT 20
    ),
    pendente AS (
        SELECT
            COUNT(*)::BIGINT AS qtd_pendente,
            COALESCE(SUM(_extract_orcamento_numeric(c.produto_data)), 0)::NUMERIC AS valor_pendente
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND c.status_comercial = 'aberto'
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _safe_date(c.produto_data->>'data_prevista_fechamento') BETWEEN p_date_start::DATE AND p_date_end::DATE  -- ✨ FIX P1
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT row_to_json(k.*) FROM kpis k),
        'pendente', (SELECT row_to_json(p.*) FROM pendente p),
        'serie_mensal', COALESCE((SELECT jsonb_agg(row_to_json(s.*)) FROM serie_mensal s), '[]'::jsonb),
        'por_origem', COALESCE((SELECT jsonb_agg(row_to_json(o.*)) FROM por_origem o), '[]'::jsonb),
        'por_consultor', COALESCE((SELECT jsonb_agg(row_to_json(p.*)) FROM por_consultor p), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.analytics_financeiro_overview(timestamptz, timestamptz, text) TO authenticated;

-- ═══ 3. analytics_planner_forecast_by_dono — P1 cast seguro ═════
DROP FUNCTION IF EXISTS public.analytics_planner_forecast_by_dono(date, date, uuid[], numeric, numeric, text[], uuid[], text);
CREATE FUNCTION public.analytics_planner_forecast_by_dono(
    p_date_start DATE        DEFAULT CURRENT_DATE,
    p_date_end   DATE        DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    p_owner_ids  UUID[]      DEFAULT NULL,
    p_value_min  NUMERIC     DEFAULT NULL,
    p_value_max  NUMERIC     DEFAULT NULL,
    p_origens    TEXT[]      DEFAULT NULL,
    p_stage_ids  UUID[]      DEFAULT NULL,
    p_product    TEXT        DEFAULT NULL
)
RETURNS TABLE(
    card_id        UUID,
    card_titulo    TEXT,
    valor          NUMERIC,
    data_prevista  DATE,
    planner_id     UUID,
    planner_nome   TEXT,
    origem         TEXT,
    stage_id       UUID,
    stage_nome     TEXT,
    phase_slug     TEXT,
    destino        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    SELECT
        c.id AS card_id,
        c.titulo AS card_titulo,
        COALESCE(c.valor_estimado, c.valor_final, 0)::NUMERIC AS valor,
        _safe_date(c.produto_data->>'data_prevista_fechamento') AS data_prevista,  -- ✨ FIX P1
        c.vendas_owner_id AS planner_id,
        p.nome AS planner_nome,
        COALESCE(NULLIF(c.origem, ''), 'sem_origem')::TEXT AS origem,
        c.pipeline_stage_id AS stage_id,
        s.nome AS stage_nome,
        pp.slug AS phase_slug,
        COALESCE(
            NULLIF(c.produto_data->>'destino', ''),
            NULLIF(c.produto_data->>'ww_mkt_destino_form', ''),
            'sem_destino'
        )::TEXT AS destino
    FROM cards c
    JOIN profiles p ON p.id = c.vendas_owner_id
    LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.org_id = v_org
      AND c.vendas_owner_id IS NOT NULL
      AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial NOT IN ('ganho', 'perdido')
      AND COALESCE(c.card_type, 'standard') != 'sub_card'
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
           OR c.vendas_owner_id = ANY(p_owner_ids))
      AND (p_origens IS NULL OR COALESCE(array_length(p_origens, 1), 0) = 0
           OR COALESCE(NULLIF(c.origem, ''), 'sem_origem') = ANY(p_origens))
      AND (p_stage_ids IS NULL OR COALESCE(array_length(p_stage_ids, 1), 0) = 0
           OR c.pipeline_stage_id = ANY(p_stage_ids))
      AND c.produto_data IS NOT NULL
      AND _safe_date(c.produto_data->>'data_prevista_fechamento') BETWEEN p_date_start AND p_date_end  -- ✨ FIX P1 (substitui regex+substring frágil)
      AND (p_value_min IS NULL OR COALESCE(c.valor_estimado, c.valor_final, 0) >= p_value_min)
      AND (p_value_max IS NULL OR COALESCE(c.valor_estimado, c.valor_final, 0) <= p_value_max)
    ORDER BY data_prevista ASC, valor DESC;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.analytics_planner_forecast_by_dono(date, date, uuid[], numeric, numeric, text[], uuid[], text) TO authenticated;

-- ═══ 4. analytics_sdr_follow_through — P2 deleted/archived/sub_card ══
DROP FUNCTION IF EXISTS public.analytics_sdr_follow_through(timestamptz, timestamptz, text, uuid, uuid[], uuid[], text[], text[], text, text[]);
CREATE FUNCTION public.analytics_sdr_follow_through(
  p_date_start TIMESTAMPTZ,
  p_date_end TIMESTAMPTZ,
  p_product TEXT DEFAULT NULL,
  p_owner_id UUID DEFAULT NULL,
  p_owner_ids UUID[] DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_origem TEXT[] DEFAULT NULL,
  p_phase_slugs TEXT[] DEFAULT NULL,
  p_lead_entry_path TEXT DEFAULT NULL,
  p_destinos TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  total_handoffs BIGINT,
  handoffs_won BIGINT,
  follow_through_pct NUMERIC,
  by_sdr JSON
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_org UUID := requesting_org_id();
BEGIN
  RETURN QUERY
  WITH filtered_cards AS (
    SELECT c.id, c.sdr_owner_id, c.ganho_sdr_at, c.ganho_planner_at, c.produto
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL AND c.archived_at IS NULL                       -- ✨ FIX P2
      AND COALESCE(c.card_type, 'standard') != 'sub_card'                      -- ✨ FIX P2
      AND c.ganho_sdr_at >= p_date_start
      AND c.ganho_sdr_at <= p_date_end
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND (p_owner_id IS NULL OR c.sdr_owner_id = p_owner_id)
      AND (p_owner_ids IS NULL OR p_owner_ids = ARRAY[]::UUID[] OR c.sdr_owner_id = ANY(p_owner_ids))
      AND (p_tag_ids IS NULL OR p_tag_ids = ARRAY[]::UUID[] OR EXISTS (
        SELECT 1 FROM card_tag_assignments cta WHERE cta.card_id = c.id AND cta.tag_id = ANY(p_tag_ids)
      ))
      AND (p_origem IS NULL OR p_origem = ARRAY[]::TEXT[] OR c.origem = ANY(p_origem))
      AND (p_phase_slugs IS NULL OR p_phase_slugs = ARRAY[]::TEXT[] OR EXISTS (
        SELECT 1
        FROM pipeline_stages ps
        JOIN pipeline_phases pp ON pp.id = ps.phase_id
        WHERE ps.id = c.pipeline_stage_id AND pp.slug = ANY(p_phase_slugs)
      ))
      AND (p_lead_entry_path IS NULL OR c.lead_entry_path = p_lead_entry_path)
      AND (p_destinos IS NULL OR p_destinos = ARRAY[]::TEXT[] OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(c.produto_data->'destinos', '[]'::jsonb)) AS d(val)
        WHERE d.val = ANY(p_destinos)
      ))
  ),
  summary AS (
    SELECT
      COUNT(*) AS total_handoffs,
      COUNT(CASE WHEN ganho_planner_at IS NOT NULL THEN 1 END) AS handoffs_won
    FROM filtered_cards
  ),
  by_sdr_data AS (
    SELECT
      p.id,
      p.nome,
      COUNT(*) AS total,
      COUNT(CASE WHEN fc.ganho_planner_at IS NOT NULL THEN 1 END) AS won,
      ROUND(
        100.0 * COUNT(CASE WHEN fc.ganho_planner_at IS NOT NULL THEN 1 END) / NULLIF(COUNT(*), 0),
        1
      ) AS pct
    FROM filtered_cards fc
    LEFT JOIN profiles p ON fc.sdr_owner_id = p.id
    GROUP BY p.id, p.nome
    ORDER BY total DESC
  )
  SELECT
    s.total_handoffs,
    s.handoffs_won,
    ROUND(
      100.0 * s.handoffs_won / NULLIF(s.total_handoffs, 0),
      1
    ) AS follow_through_pct,
    json_agg(
      json_build_object(
        'sdr_id', bd.id,
        'sdr_name', bd.nome,
        'total', bd.total,
        'won', bd.won,
        'follow_through_pct', bd.pct
      ) ORDER BY bd.total DESC
    ) AS by_sdr
  FROM summary s, by_sdr_data bd
  GROUP BY s.total_handoffs, s.handoffs_won;
END $fn$;
GRANT EXECUTE ON FUNCTION public.analytics_sdr_follow_through(timestamptz, timestamptz, text, uuid, uuid[], uuid[], text[], text[], text, text[]) TO authenticated;

-- ═══ 5. analytics_concierge_pendentes — P2 deleted/archived/sub_card ══
DROP FUNCTION IF EXISTS public.analytics_concierge_pendentes(integer);
CREATE FUNCTION public.analytics_concierge_pendentes(
    p_limit INT DEFAULT 50
)
RETURNS TABLE(
    atendimento_id   UUID,
    card_id          UUID,
    card_titulo      TEXT,
    tipo_concierge   TEXT,
    categoria        TEXT,
    origem_descricao TEXT,
    concierge_nome   TEXT,
    created_at       TIMESTAMPTZ,
    horas_aberto     NUMERIC,
    total_count      BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH pendentes AS (
        SELECT
            ac.id,
            ac.card_id,
            c.titulo AS card_titulo,
            ac.tipo_concierge,
            ac.categoria,
            ac.origem_descricao,
            prof.nome AS concierge_nome,
            ac.created_at,
            EXTRACT(EPOCH FROM (NOW() - ac.created_at)) / 3600.0 AS horas_aberto
        FROM atendimentos_concierge ac
        JOIN cards c ON c.id = ac.card_id
        LEFT JOIN profiles prof ON prof.id = c.concierge_owner_id
        WHERE ac.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL                  -- ✨ FIX P2
          AND COALESCE(c.card_type, 'standard') != 'sub_card'                 -- ✨ FIX P2
          AND ac.outcome IS NULL
    ),
    totals AS (SELECT COUNT(*)::BIGINT AS t FROM pendentes)
    SELECT
        p.id AS atendimento_id,
        p.card_id,
        p.card_titulo,
        p.tipo_concierge,
        p.categoria,
        p.origem_descricao,
        p.concierge_nome,
        p.created_at,
        ROUND(p.horas_aberto, 1) AS horas_aberto,
        (SELECT t FROM totals) AS total_count
    FROM pendentes p
    ORDER BY p.created_at ASC
    LIMIT p_limit;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.analytics_concierge_pendentes(integer) TO authenticated;
