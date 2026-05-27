-- analytics_planner_activities: lista detalhada de tarefas/atividades de UM TP.
-- Retorna JSONB com 3 buckets:
--   vencidas      — tarefas abertas com data_vencimento < hoje
--   hoje          — tarefas abertas com data_vencimento = hoje
--   proximos_7d   — tarefas abertas com data_vencimento entre amanhã e hoje+7
--
-- Usado pelo bloco F do PlannerProfileDrawer (Sprint 4).
-- Limite global p_limit pra evitar carregar 100+ tarefas no drawer.

CREATE OR REPLACE FUNCTION public.analytics_planner_activities(
    p_user_id UUID,
    p_limit   INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_result JSONB;
    v_today DATE := CURRENT_DATE;
    v_amanha DATE := CURRENT_DATE + 1;
    v_prox_7d DATE := CURRENT_DATE + 7;
BEGIN
    WITH
    base AS (
        SELECT
            t.id AS tarefa_id,
            t.titulo,
            t.tipo,
            t.prioridade,
            t.data_vencimento,
            t.card_id,
            c.titulo AS card_titulo,
            CASE
                WHEN t.data_vencimento::DATE < v_today THEN 'vencidas'
                WHEN t.data_vencimento::DATE = v_today THEN 'hoje'
                WHEN t.data_vencimento::DATE BETWEEN v_amanha AND v_prox_7d THEN 'proximos_7d'
                ELSE 'futuras'
            END AS bucket,
            CASE
                WHEN t.data_vencimento::DATE < v_today
                    THEN GREATEST(EXTRACT(DAY FROM (NOW() - t.data_vencimento))::INT, 0)
                ELSE NULL
            END AS dias_atraso,
            CASE
                WHEN t.data_vencimento::DATE > v_today
                    THEN GREATEST(EXTRACT(DAY FROM (t.data_vencimento - NOW()))::INT, 0)
                ELSE NULL
            END AS dias_pra_vencer
        FROM tarefas t
        JOIN cards c ON c.id = t.card_id
        WHERE t.org_id = v_org
          AND t.responsavel_id = p_user_id
          AND t.concluida = false
          AND t.deleted_at IS NULL
          AND t.data_vencimento IS NOT NULL
          AND t.data_vencimento::DATE <= v_prox_7d
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
    ),
    limited AS (
        SELECT * FROM base
        ORDER BY
            CASE bucket WHEN 'vencidas' THEN 1 WHEN 'hoje' THEN 2 ELSE 3 END,
            data_vencimento ASC
        LIMIT p_limit
    ),
    counts AS (
        SELECT
            COUNT(*) FILTER (WHERE bucket = 'vencidas')::INT AS qtd_vencidas,
            COUNT(*) FILTER (WHERE bucket = 'hoje')::INT AS qtd_hoje,
            COUNT(*) FILTER (WHERE bucket = 'proximos_7d')::INT AS qtd_prox_7d
        FROM base
    )
    SELECT JSONB_BUILD_OBJECT(
        'vencidas', COALESCE(
            (SELECT JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'tarefa_id', tarefa_id,
                    'titulo', titulo,
                    'tipo', tipo,
                    'prioridade', prioridade,
                    'data_vencimento', data_vencimento,
                    'dias_atraso', dias_atraso,
                    'card_id', card_id,
                    'card_titulo', card_titulo
                ) ORDER BY data_vencimento ASC
            ) FROM limited WHERE bucket = 'vencidas'),
            '[]'::JSONB
        ),
        'hoje', COALESCE(
            (SELECT JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'tarefa_id', tarefa_id,
                    'titulo', titulo,
                    'tipo', tipo,
                    'prioridade', prioridade,
                    'data_vencimento', data_vencimento,
                    'card_id', card_id,
                    'card_titulo', card_titulo
                ) ORDER BY data_vencimento ASC
            ) FROM limited WHERE bucket = 'hoje'),
            '[]'::JSONB
        ),
        'proximos_7d', COALESCE(
            (SELECT JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'tarefa_id', tarefa_id,
                    'titulo', titulo,
                    'tipo', tipo,
                    'prioridade', prioridade,
                    'data_vencimento', data_vencimento,
                    'dias_pra_vencer', dias_pra_vencer,
                    'card_id', card_id,
                    'card_titulo', card_titulo
                ) ORDER BY data_vencimento ASC
            ) FROM limited WHERE bucket = 'proximos_7d'),
            '[]'::JSONB
        ),
        'totais', JSONB_BUILD_OBJECT(
            'vencidas', COALESCE((SELECT qtd_vencidas FROM counts), 0),
            'hoje', COALESCE((SELECT qtd_hoje FROM counts), 0),
            'proximos_7d', COALESCE((SELECT qtd_prox_7d FROM counts), 0)
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_planner_activities TO authenticated;

COMMENT ON FUNCTION public.analytics_planner_activities IS
'Retorna lista de tarefas abertas do Travel Planner agrupadas em vencidas/hoje/proximos_7d. Cada item linka para o card. Usado pelo bloco F do PlannerProfileDrawer (Sprint 4).';
