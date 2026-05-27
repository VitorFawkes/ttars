-- Fix v2 (após rebase incremental sobre 20260527f):
-- A versão `f` adicionou regex guard antes do cast `::DATE`. Mesmo assim a RPC
-- retornava 22P02 "invalid input syntax for type json" em runtime. Troca
-- definitiva: comparação como TEXT ISO (YYYY-MM-DD) — não há cast no caminho.
-- Preserva todas as correções de `f`: regex guard na CTE base, win_rate_team
-- + dias_ate_ganho_team como comparativo, ranking com SUM corrigido pra
-- ROW_NUMBER (sem JOIN aninhado).

DROP FUNCTION IF EXISTS public.analytics_planner_profile(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT);

CREATE FUNCTION public.analytics_planner_profile(
    p_user_id    UUID,
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_result JSONB;
    v_inicio_semana TIMESTAMPTZ := DATE_TRUNC('week', NOW());
    v_inicio_semana_anterior TIMESTAMPTZ := v_inicio_semana - INTERVAL '7 days';
    v_today TEXT := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
    v_prox_7d TEXT := TO_CHAR(CURRENT_DATE + 7, 'YYYY-MM-DD');
    v_prox_30d TEXT := TO_CHAR(CURRENT_DATE + 30, 'YYYY-MM-DD');
BEGIN
    WITH
    cards_pessoa AS (
        SELECT c.id, c.status_comercial, c.valor_final, c.valor_estimado, c.receita,
               c.created_at, c.updated_at, c.data_fechamento, c.ganho_planner_at,
               c.ganho_sdr_at, c.briefing_inicial, c.pessoa_principal_id,
               c.motivo_perda_id, c.origem, c.pipeline_stage_id, c.stage_entered_at,
               CASE
                   WHEN c.produto_data IS NOT NULL
                    AND c.produto_data ? 'data_prevista_fechamento'
                    AND (c.produto_data->>'data_prevista_fechamento') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
                   THEN SUBSTRING(c.produto_data->>'data_prevista_fechamento' FROM 1 FOR 10)
                   ELSE NULL
               END AS data_prev_fech_str
        FROM cards c
        WHERE c.org_id = v_org
          AND c.vendas_owner_id = p_user_id
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    cards_time AS (
        SELECT c.id, c.status_comercial, c.data_fechamento,
               c.created_at, c.ganho_sdr_at, c.vendas_owner_id, c.receita
        FROM cards c
        WHERE c.org_id = v_org
          AND c.vendas_owner_id IS NOT NULL
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
    ),
    cards_abertos AS (
        SELECT cp.* FROM cards_pessoa cp
        WHERE cp.status_comercial NOT IN ('ganho', 'perdido')
    ),
    cards_abertos_em_risco AS (
        SELECT cp.id
        FROM cards_pessoa cp
        LEFT JOIN pipeline_stages s ON s.id = cp.pipeline_stage_id
        WHERE cp.status_comercial NOT IN ('ganho', 'perdido')
          AND (
              (cp.briefing_inicial IS NULL OR cp.briefing_inicial = '')
              OR cp.pessoa_principal_id IS NULL
              OR cp.updated_at < NOW() - INTERVAL '14 days'
              OR (s.sla_hours IS NOT NULL AND cp.stage_entered_at IS NOT NULL
                  AND cp.stage_entered_at < NOW() - (s.sla_hours || ' hours')::INTERVAL)
          )
    ),
    atendimentos_semana_atual AS (
        SELECT COUNT(*)::INT AS qtd FROM cards_pessoa cp
        WHERE cp.updated_at >= v_inicio_semana
    ),
    atendimentos_semana_anterior AS (
        SELECT COUNT(*)::INT AS qtd FROM cards_pessoa cp
        WHERE cp.updated_at >= v_inicio_semana_anterior
          AND cp.updated_at < v_inicio_semana
    ),
    por_etapa AS (
        SELECT s.id AS stage_id, s.nome AS stage_nome, s.ordem,
               pp.slug AS phase_slug, pp.order_index AS phase_order,
               COUNT(*)::INT AS qtd
        FROM cards_abertos ca
        JOIN pipeline_stages s ON s.id = ca.pipeline_stage_id
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        GROUP BY s.id, s.nome, s.ordem, pp.slug, pp.order_index
    ),
    cards_pessoa_periodo AS (
        SELECT cp.*,
               EXTRACT(EPOCH FROM (cp.data_fechamento - COALESCE(cp.ganho_sdr_at, cp.created_at))) / 86400.0 AS dias_ciclo
        FROM cards_pessoa cp
        WHERE cp.data_fechamento >= p_date_start AND cp.data_fechamento < p_date_end
          AND cp.status_comercial IN ('ganho', 'perdido')
    ),
    kpis_periodo AS (
        SELECT
            COUNT(*) FILTER (WHERE status_comercial = 'ganho')::INT AS ganhos,
            COUNT(*) FILTER (WHERE status_comercial = 'perdido')::INT AS perdidos,
            COALESCE(SUM(valor_final) FILTER (WHERE status_comercial = 'ganho'), 0)::NUMERIC AS faturamento,
            COALESCE(SUM(receita) FILTER (WHERE status_comercial = 'ganho'), 0)::NUMERIC AS receita,
            CASE WHEN COUNT(*) FILTER (WHERE status_comercial = 'ganho') > 0
                THEN ROUND(
                    COALESCE(SUM(valor_final) FILTER (WHERE status_comercial = 'ganho'), 0)
                    / COUNT(*) FILTER (WHERE status_comercial = 'ganho'), 0)
                ELSE 0 END::NUMERIC AS ticket_medio,
            COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_ciclo) FILTER (WHERE status_comercial = 'ganho'), 0)::NUMERIC AS dias_ate_ganho,
            COALESCE(PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY dias_ciclo) FILTER (WHERE status_comercial = 'ganho'), 0)::NUMERIC AS dias_ate_ganho_pior,
            COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_ciclo) FILTER (WHERE status_comercial = 'perdido'), 0)::NUMERIC AS dias_ate_perda
        FROM cards_pessoa_periodo
    ),
    cards_time_periodo AS (
        SELECT ct.*,
               EXTRACT(EPOCH FROM (ct.data_fechamento - COALESCE(ct.ganho_sdr_at, ct.created_at))) / 86400.0 AS dias_ciclo
        FROM cards_time ct
        WHERE ct.data_fechamento >= p_date_start AND ct.data_fechamento < p_date_end
          AND ct.status_comercial IN ('ganho', 'perdido')
    ),
    kpis_time AS (
        SELECT
            CASE WHEN (COUNT(*) FILTER (WHERE status_comercial = 'ganho') + COUNT(*) FILTER (WHERE status_comercial = 'perdido')) > 0
                THEN ROUND(
                    COUNT(*) FILTER (WHERE status_comercial = 'ganho')::NUMERIC
                    / (COUNT(*) FILTER (WHERE status_comercial = 'ganho') + COUNT(*) FILTER (WHERE status_comercial = 'perdido'))::NUMERIC * 100, 1)
                ELSE 0 END::NUMERIC AS win_rate_team,
            COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_ciclo) FILTER (WHERE status_comercial = 'ganho'), 0)::NUMERIC AS dias_ate_ganho_team
        FROM cards_time_periodo
    ),
    preenchimento AS (
        SELECT
            COUNT(*) FILTER (WHERE briefing_inicial IS NULL OR briefing_inicial = '')::INT AS sem_briefing,
            COUNT(*) FILTER (WHERE pessoa_principal_id IS NULL)::INT AS sem_contato,
            COUNT(*) FILTER (WHERE updated_at < NOW() - INTERVAL '14 days')::INT AS parados_14d,
            COUNT(*)::INT AS total_abertos
        FROM cards_abertos
    ),
    motivos AS (
        SELECT mp.nome AS motivo, COUNT(*)::INT AS qtd
        FROM cards_pessoa cp
        LEFT JOIN motivos_perda mp ON mp.id = cp.motivo_perda_id
        WHERE cp.status_comercial = 'perdido'
          AND cp.data_fechamento >= p_date_start AND cp.data_fechamento < p_date_end
        GROUP BY mp.nome
        ORDER BY qtd DESC
        LIMIT 5
    ),
    origens AS (
        SELECT COALESCE(NULLIF(cp.origem, ''), 'sem_origem')::TEXT AS origem,
               COUNT(*)::INT AS leads
        FROM cards_pessoa cp
        WHERE cp.created_at >= p_date_start AND cp.created_at < p_date_end
        GROUP BY 1
        ORDER BY leads DESC
    ),
    forecast AS (
        SELECT
            COUNT(*) FILTER (
                WHERE cp.data_prev_fech_str IS NOT NULL
                  AND cp.data_prev_fech_str >= v_today
                  AND cp.data_prev_fech_str <= v_prox_7d
            )::INT AS prox_7d_qtd,
            COALESCE(SUM(COALESCE(cp.valor_estimado, cp.valor_final, 0)) FILTER (
                WHERE cp.data_prev_fech_str IS NOT NULL
                  AND cp.data_prev_fech_str >= v_today
                  AND cp.data_prev_fech_str <= v_prox_7d
            ), 0)::NUMERIC AS prox_7d_valor,
            COUNT(*) FILTER (
                WHERE cp.data_prev_fech_str IS NOT NULL
                  AND cp.data_prev_fech_str >= v_today
                  AND cp.data_prev_fech_str <= v_prox_30d
            )::INT AS prox_30d_qtd,
            COALESCE(SUM(COALESCE(cp.valor_estimado, cp.valor_final, 0)) FILTER (
                WHERE cp.data_prev_fech_str IS NOT NULL
                  AND cp.data_prev_fech_str >= v_today
                  AND cp.data_prev_fech_str <= v_prox_30d
            ), 0)::NUMERIC AS prox_30d_valor
        FROM cards_abertos cp
    ),
    membro AS (
        SELECT p.id, p.nome, p.avatar_url, p.role
        FROM profiles p
        WHERE p.id = p_user_id
    ),
    ranking AS (
        SELECT
            ct.vendas_owner_id,
            ROW_NUMBER() OVER (
                ORDER BY COALESCE(SUM(ct.receita) FILTER (
                    WHERE ct.status_comercial = 'ganho'
                      AND ct.data_fechamento >= p_date_start
                      AND ct.data_fechamento < p_date_end
                ), 0) DESC
            ) AS posicao
        FROM cards_time ct
        GROUP BY ct.vendas_owner_id
    )
    SELECT JSONB_BUILD_OBJECT(
        'header', JSONB_BUILD_OBJECT(
            'user_id', (SELECT id FROM membro),
            'nome', (SELECT nome FROM membro),
            'avatar_url', (SELECT avatar_url FROM membro),
            'role', (SELECT role FROM membro),
            'rank_position', COALESCE((SELECT posicao FROM ranking WHERE vendas_owner_id = p_user_id), 0)
        ),
        'agora', JSONB_BUILD_OBJECT(
            'cards_abertos', (SELECT COUNT(*) FROM cards_abertos),
            'em_risco', (SELECT COUNT(*) FROM cards_abertos_em_risco),
            'atendimentos_semana', COALESCE((SELECT qtd FROM atendimentos_semana_atual), 0),
            'delta_semana', COALESCE((SELECT qtd FROM atendimentos_semana_atual), 0) - COALESCE((SELECT qtd FROM atendimentos_semana_anterior), 0),
            'por_etapa', COALESCE(
                (SELECT JSONB_AGG(
                    JSONB_BUILD_OBJECT(
                        'stage_id', stage_id,
                        'stage_nome', stage_nome,
                        'phase_slug', phase_slug,
                        'qtd', qtd
                    ) ORDER BY phase_order NULLS LAST, ordem
                ) FROM por_etapa),
                '[]'::JSONB
            )
        ),
        'periodo', JSONB_BUILD_OBJECT(
            'ganhos', COALESCE((SELECT ganhos FROM kpis_periodo), 0),
            'perdidos', COALESCE((SELECT perdidos FROM kpis_periodo), 0),
            'faturamento', COALESCE((SELECT faturamento FROM kpis_periodo), 0),
            'receita', COALESCE((SELECT receita FROM kpis_periodo), 0),
            'ticket_medio', COALESCE((SELECT ticket_medio FROM kpis_periodo), 0),
            'win_rate', CASE
                WHEN ((SELECT ganhos FROM kpis_periodo) + (SELECT perdidos FROM kpis_periodo)) > 0
                THEN ROUND(
                    (SELECT ganhos FROM kpis_periodo)::NUMERIC
                    / ((SELECT ganhos FROM kpis_periodo) + (SELECT perdidos FROM kpis_periodo))::NUMERIC * 100, 1)
                ELSE 0
            END,
            'win_rate_team', COALESCE((SELECT win_rate_team FROM kpis_time), 0),
            'dias_ate_ganho', ROUND(COALESCE((SELECT dias_ate_ganho FROM kpis_periodo), 0), 1),
            'dias_ate_ganho_pior', ROUND(COALESCE((SELECT dias_ate_ganho_pior FROM kpis_periodo), 0), 1),
            'dias_ate_perda', ROUND(COALESCE((SELECT dias_ate_perda FROM kpis_periodo), 0), 1),
            'dias_ate_ganho_team', ROUND(COALESCE((SELECT dias_ate_ganho_team FROM kpis_time), 0), 1)
        ),
        'preenchimento', JSONB_BUILD_OBJECT(
            'sem_briefing', COALESCE((SELECT sem_briefing FROM preenchimento), 0),
            'sem_contato', COALESCE((SELECT sem_contato FROM preenchimento), 0),
            'parados_14d', COALESCE((SELECT parados_14d FROM preenchimento), 0),
            'total_abertos', COALESCE((SELECT total_abertos FROM preenchimento), 0)
        ),
        'motivos_perda', COALESCE(
            (SELECT JSONB_AGG(JSONB_BUILD_OBJECT('motivo', motivo, 'qtd', qtd)) FROM motivos),
            '[]'::JSONB
        ),
        'origens', COALESCE(
            (SELECT JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'origem', origem,
                    'leads', leads,
                    'pct', CASE
                        WHEN (SELECT SUM(leads) FROM origens) > 0
                        THEN ROUND(leads::NUMERIC / (SELECT SUM(leads) FROM origens)::NUMERIC * 100, 1)
                        ELSE 0
                    END
                ) ORDER BY leads DESC
            ) FROM origens),
            '[]'::JSONB
        ),
        'forecast', JSONB_BUILD_OBJECT(
            'prox_7d_qtd', COALESCE((SELECT prox_7d_qtd FROM forecast), 0),
            'prox_7d_valor', COALESCE((SELECT prox_7d_valor FROM forecast), 0),
            'prox_30d_qtd', COALESCE((SELECT prox_30d_qtd FROM forecast), 0),
            'prox_30d_valor', COALESCE((SELECT prox_30d_valor FROM forecast), 0)
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_planner_profile TO authenticated;
