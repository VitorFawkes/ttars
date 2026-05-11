-- Reforma Analytics — Fundação (Marco 0)
-- Novas RPCs para a reorganização do Analytics:
--   - analytics_saude_summary: 7 contadores de saúde do pipeline (aba Saúde)
--   - analytics_saude_list: lista paginada de cards por bucket
--   - analytics_funnel_velocity: mediana/p90 de dias por etapa
--   - analytics_team_sla_compliance: SLA por pessoa
--   - analytics_team_leaderboard: 1 linha por pessoa (consolidado, sem UNION por fase)
--
-- Todas SECURITY DEFINER + filtro org_id explícito (bypass de RLS é intencional).
-- Pipeline é 1-pra-1 com org após Org Split → produto fica implícito via requesting_org_id().

-- ═══════════════════════════════════════════════════════════════
-- 1. analytics_saude_summary
-- ═══════════════════════════════════════════════════════════════
-- Retorna contadores para a aba Saúde. Cada bucket vira um card clicável.
--
-- Buckets:
--   sem_dono:           dono_atual_id IS NULL
--   sem_contato:        pessoa_principal_id IS NULL
--   sla_violado:        stage_entered_at < NOW() - stage.sla_hours
--   sem_atividade_7d:   updated_at < NOW() - 7 days
--   sem_atividade_14d:  updated_at < NOW() - 14 days
--   sem_atividade_30d:  updated_at < NOW() - 30 days
--   tarefas_vencidas:   COUNT(tarefas abertas com data_vencimento passada)
--   sem_briefing:       briefing_inicial IS NULL OR '' (só para cards em fase SDR)
--
-- Escopo: cards abertos (status_comercial != 'ganho' AND != 'perdido'),
-- não arquivados, não deletados, não sub_card, da org atual.

DROP FUNCTION IF EXISTS analytics_saude_summary(UUID[], UUID[]);

CREATE FUNCTION analytics_saude_summary(
    p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids   UUID[] DEFAULT NULL
)
RETURNS TABLE(
    sem_dono          BIGINT,
    sem_contato       BIGINT,
    sla_violado       BIGINT,
    sem_atividade_7d  BIGINT,
    sem_atividade_14d BIGINT,
    sem_atividade_30d BIGINT,
    tarefas_vencidas  BIGINT,
    sem_briefing      BIGINT,
    total_abertos     BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH cards_abertos AS (
        SELECT c.id, c.dono_atual_id, c.pessoa_principal_id, c.stage_entered_at,
               c.updated_at, c.pipeline_stage_id, c.briefing_inicial
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
    ),
    stages AS (
        SELECT s.id, s.sla_hours, pp.slug AS phase_slug
        FROM pipeline_stages s
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    ),
    tarefas_abertas AS (
        SELECT COUNT(*) AS n
        FROM tarefas t
        JOIN cards c ON c.id = t.card_id
        WHERE t.org_id = v_org
          AND t.concluida = false
          AND t.deleted_at IS NULL
          AND t.data_vencimento IS NOT NULL
          AND t.data_vencimento < NOW()
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND _a_owner_ok(t.responsavel_id, NULL, p_owner_ids)
    )
    SELECT
        COUNT(*) FILTER (WHERE ca.dono_atual_id IS NULL)::BIGINT AS sem_dono,
        COUNT(*) FILTER (WHERE ca.pessoa_principal_id IS NULL)::BIGINT AS sem_contato,
        COUNT(*) FILTER (
            WHERE s.sla_hours IS NOT NULL
              AND ca.stage_entered_at IS NOT NULL
              AND ca.stage_entered_at < NOW() - (s.sla_hours || ' hours')::INTERVAL
        )::BIGINT AS sla_violado,
        COUNT(*) FILTER (WHERE ca.updated_at < NOW() - INTERVAL '7 days')::BIGINT  AS sem_atividade_7d,
        COUNT(*) FILTER (WHERE ca.updated_at < NOW() - INTERVAL '14 days')::BIGINT AS sem_atividade_14d,
        COUNT(*) FILTER (WHERE ca.updated_at < NOW() - INTERVAL '30 days')::BIGINT AS sem_atividade_30d,
        COALESCE((SELECT n FROM tarefas_abertas), 0)::BIGINT AS tarefas_vencidas,
        COUNT(*) FILTER (
            WHERE s.phase_slug = 'sdr'
              AND (ca.briefing_inicial IS NULL OR ca.briefing_inicial = '')
        )::BIGINT AS sem_briefing,
        COUNT(*)::BIGINT AS total_abertos
    FROM cards_abertos ca
    LEFT JOIN stages s ON s.id = ca.pipeline_stage_id;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_saude_summary TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 2. analytics_saude_list
-- ═══════════════════════════════════════════════════════════════
-- Lista paginada para drill-down quando o usuário clica num bucket de Saúde.
-- Retorna cards com dias_parado/dias_sla_excedido/etapa/dono para ordenação.

DROP FUNCTION IF EXISTS analytics_saude_list(TEXT, INT, INT, TEXT, UUID[], UUID[]);

CREATE FUNCTION analytics_saude_list(
    p_bucket    TEXT,
    p_limit     INT DEFAULT 50,
    p_offset    INT DEFAULT 0,
    p_sort_by   TEXT DEFAULT 'dias_parado',  -- 'dias_parado' | 'valor' | 'dono'
    p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids   UUID[] DEFAULT NULL
)
RETURNS TABLE(
    card_id          UUID,
    titulo           TEXT,
    stage_id         UUID,
    stage_nome       TEXT,
    phase_slug       TEXT,
    dono_atual_id    UUID,
    dono_atual_nome  TEXT,
    pessoa_nome      TEXT,
    valor_display    NUMERIC,
    stage_entered_at TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ,
    dias_parado      INT,
    sla_hours        INT,
    horas_sla_excedidas INT,
    total_count      BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_total BIGINT;
BEGIN
    -- CTE base com cards filtrados pelo bucket
    RETURN QUERY
    WITH filtered AS (
        SELECT
            c.id AS card_id,
            c.titulo,
            c.pipeline_stage_id AS stage_id,
            s.nome AS stage_nome,
            pp.slug AS phase_slug,
            c.dono_atual_id,
            dono.nome AS dono_atual_nome,
            pessoa.nome AS pessoa_nome,
            COALESCE(c.valor_final, c.valor_estimado, 0) AS valor_display,
            c.stage_entered_at,
            c.updated_at,
            GREATEST(
                EXTRACT(DAY FROM NOW() - c.updated_at)::INT,
                0
            ) AS dias_parado,
            s.sla_hours,
            CASE
                WHEN s.sla_hours IS NOT NULL AND c.stage_entered_at IS NOT NULL
                THEN GREATEST(
                    EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 3600 - s.sla_hours,
                    0
                )::INT
                ELSE NULL
            END AS horas_sla_excedidas,
            c.briefing_inicial
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        LEFT JOIN profiles dono ON dono.id = c.dono_atual_id
        LEFT JOIN contatos pessoa ON pessoa.id = c.pessoa_principal_id
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND CASE p_bucket
              WHEN 'sem_dono'           THEN c.dono_atual_id IS NULL
              WHEN 'sem_contato'        THEN c.pessoa_principal_id IS NULL
              WHEN 'sla_violado'        THEN s.sla_hours IS NOT NULL
                                           AND c.stage_entered_at IS NOT NULL
                                           AND c.stage_entered_at < NOW() - (s.sla_hours || ' hours')::INTERVAL
              WHEN 'sem_atividade_7d'   THEN c.updated_at < NOW() - INTERVAL '7 days'
              WHEN 'sem_atividade_14d'  THEN c.updated_at < NOW() - INTERVAL '14 days'
              WHEN 'sem_atividade_30d'  THEN c.updated_at < NOW() - INTERVAL '30 days'
              WHEN 'sem_briefing'       THEN pp.slug = 'sdr'
                                           AND (c.briefing_inicial IS NULL OR c.briefing_inicial = '')
              ELSE FALSE
          END
    ),
    counted AS (
        SELECT COUNT(*) AS total FROM filtered
    )
    SELECT
        f.card_id, f.titulo, f.stage_id, f.stage_nome, f.phase_slug,
        f.dono_atual_id, f.dono_atual_nome, f.pessoa_nome,
        f.valor_display, f.stage_entered_at, f.updated_at,
        f.dias_parado, f.sla_hours, f.horas_sla_excedidas,
        (SELECT total FROM counted)::BIGINT AS total_count
    FROM filtered f
    ORDER BY
        CASE WHEN p_sort_by = 'valor'        THEN f.valor_display END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'dono'         THEN f.dono_atual_nome END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'dias_parado'  THEN f.dias_parado END DESC NULLS LAST,
        f.updated_at ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_saude_list TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 3. analytics_saude_tarefas_vencidas
-- ═══════════════════════════════════════════════════════════════
-- Lista de tarefas vencidas para drill-down (separada de saude_list
-- porque tarefas têm schema próprio).

DROP FUNCTION IF EXISTS analytics_saude_tarefas_vencidas(INT, INT, UUID[]);

CREATE FUNCTION analytics_saude_tarefas_vencidas(
    p_limit     INT DEFAULT 50,
    p_offset    INT DEFAULT 0,
    p_owner_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(
    tarefa_id         UUID,
    titulo            TEXT,
    tipo              TEXT,
    prioridade        TEXT,
    data_vencimento   TIMESTAMPTZ,
    dias_vencida      INT,
    card_id           UUID,
    card_titulo       TEXT,
    responsavel_id    UUID,
    responsavel_nome  TEXT,
    total_count       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            t.id AS tarefa_id,
            t.titulo,
            t.tipo,
            t.prioridade,
            t.data_vencimento,
            EXTRACT(DAY FROM NOW() - t.data_vencimento)::INT AS dias_vencida,
            t.card_id,
            c.titulo AS card_titulo,
            t.responsavel_id,
            p.nome AS responsavel_nome
        FROM tarefas t
        JOIN cards c ON c.id = t.card_id
        LEFT JOIN profiles p ON p.id = t.responsavel_id
        WHERE t.org_id = v_org
          AND t.concluida = false
          AND t.deleted_at IS NULL
          AND t.data_vencimento IS NOT NULL
          AND t.data_vencimento < NOW()
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND _a_owner_ok(t.responsavel_id, NULL, p_owner_ids)
    ),
    counted AS (SELECT COUNT(*) AS total FROM filtered)
    SELECT f.*, (SELECT total FROM counted)::BIGINT AS total_count
    FROM filtered f
    ORDER BY f.data_vencimento ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_saude_tarefas_vencidas TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 4. analytics_funnel_velocity
-- ═══════════════════════════════════════════════════════════════
-- Velocidade do funil: tempo em cada etapa.
-- Fontes:
--   - Para cards que já saíram: diferença entre entries/exits em activities
--   - Para cards atuais em aberto: tempo desde stage_entered_at
-- Retorna: etapa, # cards que passaram, mediana dias, p90 dias, média dias.

DROP FUNCTION IF EXISTS analytics_funnel_velocity(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID[]);

CREATE FUNCTION analytics_funnel_velocity(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    stage_id        UUID,
    stage_nome      TEXT,
    phase_slug      TEXT,
    ordem           INT,
    cards_passaram  BIGINT,
    cards_atuais    BIGINT,
    mediana_dias    NUMERIC,
    p90_dias        NUMERIC,
    media_dias      NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH stages AS (
        SELECT s.id, s.nome, s.ordem, pp.slug AS phase_slug, pp.order_index AS phase_order
        FROM pipeline_stages s
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE s.ativo = true
    ),
    -- Tempos de cards que JÁ SAÍRAM da etapa (via activities)
    transicoes AS (
        SELECT
            (a.metadata->>'old_stage_id')::UUID AS stage_id,
            a.card_id,
            EXTRACT(EPOCH FROM (
                a.created_at - COALESCE(
                    (SELECT prev.created_at FROM activities prev
                     WHERE prev.card_id = a.card_id
                       AND prev.tipo = 'stage_changed'
                       AND prev.created_at < a.created_at
                     ORDER BY prev.created_at DESC LIMIT 1),
                    (SELECT c.created_at FROM cards c WHERE c.id = a.card_id)
                )
            )) / 86400.0 AS dias_na_etapa
        FROM activities a
        JOIN cards c ON c.id = a.card_id
        WHERE a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start
          AND a.created_at < p_date_end
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
    ),
    -- Cards ATUAIS nas etapas (tempo desde entered_at)
    atuais AS (
        SELECT
            c.pipeline_stage_id AS stage_id,
            c.id AS card_id,
            EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400.0 AS dias_na_etapa
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.stage_entered_at IS NOT NULL
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
    ),
    metricas AS (
        SELECT
            s.id AS stage_id,
            s.nome AS stage_nome,
            s.phase_slug,
            s.ordem::INT AS ordem,
            s.phase_order,
            (SELECT COUNT(*) FROM transicoes t WHERE t.stage_id = s.id)::BIGINT AS cards_passaram,
            (SELECT COUNT(*) FROM atuais a WHERE a.stage_id = s.id)::BIGINT AS cards_atuais,
            COALESCE(
                (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS mediana_dias,
            COALESCE(
                (SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS p90_dias,
            COALESCE(
                (SELECT AVG(dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS media_dias
        FROM stages s
    )
    SELECT m.stage_id, m.stage_nome, m.phase_slug, m.ordem,
           m.cards_passaram, m.cards_atuais,
           ROUND(m.mediana_dias, 1), ROUND(m.p90_dias, 1), ROUND(m.media_dias, 1)
    FROM metricas m
    ORDER BY m.phase_order NULLS LAST, m.ordem;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_funnel_velocity TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 5. analytics_team_sla_compliance
-- ═══════════════════════════════════════════════════════════════
-- SLA por pessoa: quantas transições de etapa ela cumpriu no prazo.
-- Fonte: activities tipo='stage_changed' com dono_anterior / sla_hours da etapa.

DROP FUNCTION IF EXISTS analytics_team_sla_compliance(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]);

CREATE FUNCTION analytics_team_sla_compliance(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids  UUID[] DEFAULT NULL
)
RETURNS TABLE(
    user_id               UUID,
    user_nome             TEXT,
    total_transicoes      BIGINT,
    sla_cumpridas         BIGINT,
    sla_violadas          BIGINT,
    compliance_rate       NUMERIC,
    tempo_medio_horas     NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH transicoes AS (
        SELECT
            c.dono_atual_id AS user_id,
            a.card_id,
            s.sla_hours,
            EXTRACT(EPOCH FROM (
                a.created_at - COALESCE(
                    (SELECT prev.created_at FROM activities prev
                     WHERE prev.card_id = a.card_id
                       AND prev.tipo = 'stage_changed'
                       AND prev.created_at < a.created_at
                     ORDER BY prev.created_at DESC LIMIT 1),
                    c.created_at
                )
            )) / 3600.0 AS horas_gastas
        FROM activities a
        JOIN cards c ON c.id = a.card_id
        LEFT JOIN pipeline_stages s ON s.id = (a.metadata->>'old_stage_id')::UUID
        WHERE a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start
          AND a.created_at < p_date_end
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.dono_atual_id IS NOT NULL
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
    )
    SELECT
        t.user_id,
        p.nome AS user_nome,
        COUNT(*)::BIGINT AS total_transicoes,
        COUNT(*) FILTER (
            WHERE t.sla_hours IS NULL OR t.horas_gastas <= t.sla_hours
        )::BIGINT AS sla_cumpridas,
        COUNT(*) FILTER (
            WHERE t.sla_hours IS NOT NULL AND t.horas_gastas > t.sla_hours
        )::BIGINT AS sla_violadas,
        CASE WHEN COUNT(*) > 0
            THEN ROUND(
                COUNT(*) FILTER (WHERE t.sla_hours IS NULL OR t.horas_gastas <= t.sla_hours)::NUMERIC
                / COUNT(*)::NUMERIC * 100,
                1
            )
            ELSE 0
        END AS compliance_rate,
        ROUND(AVG(t.horas_gastas)::NUMERIC, 1) AS tempo_medio_horas
    FROM transicoes t
    JOIN profiles p ON p.id = t.user_id
    GROUP BY t.user_id, p.nome
    ORDER BY compliance_rate DESC, total_transicoes DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_team_sla_compliance TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 6. analytics_team_leaderboard
-- ═══════════════════════════════════════════════════════════════
-- Leaderboard consolidado: 1 linha por pessoa com agregação
-- através de TODAS as fases em que ela participou (SDR, Vendas, Pós-venda).
-- Diferente de analytics_team_performance (que faz UNION por fase).

DROP FUNCTION IF EXISTS analytics_team_leaderboard(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID[]);

CREATE FUNCTION analytics_team_leaderboard(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    user_id             UUID,
    user_nome           TEXT,
    user_avatar_url     TEXT,
    fases               TEXT[],          -- ['sdr','planner',...] em que participou
    cards_envolvidos    BIGINT,
    cards_ganhos        BIGINT,
    cards_perdidos      BIGINT,
    cards_abertos       BIGINT,
    win_rate            NUMERIC,
    receita_total       NUMERIC,
    ticket_medio        NUMERIC,
    tarefas_abertas     BIGINT,
    tarefas_vencidas    BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH card_base AS (
        SELECT c.id, c.sdr_owner_id, c.vendas_owner_id, c.pos_owner_id,
               c.status_comercial, c.valor_final, c.receita
        FROM cards c
        WHERE c.org_id = v_org AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.created_at >= p_date_start AND c.created_at < p_date_end
          AND _a_tag_ok(c.id, p_tag_ids)
    ),
    envolvimentos AS (
        SELECT cb.id AS card_id, cb.sdr_owner_id AS user_id, 'sdr'::TEXT AS fase,
               cb.status_comercial, cb.valor_final, cb.receita
        FROM card_base cb WHERE cb.sdr_owner_id IS NOT NULL
        UNION ALL
        SELECT cb.id, cb.vendas_owner_id, 'planner',
               cb.status_comercial, cb.valor_final, cb.receita
        FROM card_base cb WHERE cb.vendas_owner_id IS NOT NULL
        UNION ALL
        SELECT cb.id, cb.pos_owner_id, 'pos_venda',
               cb.status_comercial, cb.valor_final, cb.receita
        FROM card_base cb WHERE cb.pos_owner_id IS NOT NULL
    ),
    -- Dedupe (card_id, user_id) para não contar card 2x quando mesma pessoa é SDR+Planner
    envolvimentos_dedup AS (
        SELECT DISTINCT ON (card_id, user_id)
            card_id, user_id, status_comercial, valor_final, receita
        FROM envolvimentos
        WHERE (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
               OR user_id = ANY(p_owner_ids))
    ),
    fases_por_pessoa AS (
        SELECT user_id, ARRAY_AGG(DISTINCT fase ORDER BY fase) AS fases
        FROM envolvimentos
        WHERE (p_owner_ids IS NULL OR COALESCE(array_length(p_owner_ids, 1), 0) = 0
               OR user_id = ANY(p_owner_ids))
        GROUP BY user_id
    ),
    por_pessoa AS (
        SELECT
            ed.user_id,
            fp.fases,
            COUNT(*)::BIGINT AS cards_envolvidos,
            COUNT(*) FILTER (WHERE ed.status_comercial = 'ganho')::BIGINT AS cards_ganhos,
            COUNT(*) FILTER (WHERE ed.status_comercial = 'perdido')::BIGINT AS cards_perdidos,
            COUNT(*) FILTER (WHERE ed.status_comercial NOT IN ('ganho', 'perdido'))::BIGINT AS cards_abertos,
            COALESCE(SUM(ed.receita) FILTER (WHERE ed.status_comercial = 'ganho'), 0)::NUMERIC AS receita_total,
            COUNT(*) FILTER (WHERE ed.status_comercial = 'ganho')::BIGINT AS ganhos_n,
            COALESCE(SUM(ed.valor_final) FILTER (WHERE ed.status_comercial = 'ganho'), 0)::NUMERIC AS valor_won
        FROM envolvimentos_dedup ed
        JOIN fases_por_pessoa fp ON fp.user_id = ed.user_id
        GROUP BY ed.user_id, fp.fases
    ),
    tarefas_counts AS (
        SELECT
            t.responsavel_id AS user_id,
            COUNT(*) FILTER (WHERE t.concluida = false) AS tarefas_abertas,
            COUNT(*) FILTER (
                WHERE t.concluida = false
                  AND t.data_vencimento IS NOT NULL
                  AND t.data_vencimento < NOW()
            ) AS tarefas_vencidas
        FROM tarefas t
        WHERE t.org_id = v_org AND t.deleted_at IS NULL AND t.responsavel_id IS NOT NULL
        GROUP BY t.responsavel_id
    )
    SELECT
        pp.user_id,
        pr.nome AS user_nome,
        pr.avatar_url AS user_avatar_url,
        pp.fases,
        pp.cards_envolvidos,
        pp.cards_ganhos,
        pp.cards_perdidos,
        pp.cards_abertos,
        CASE WHEN (pp.cards_ganhos + pp.cards_perdidos) > 0
            THEN ROUND(pp.cards_ganhos::NUMERIC / (pp.cards_ganhos + pp.cards_perdidos)::NUMERIC * 100, 1)
            ELSE 0
        END AS win_rate,
        pp.receita_total,
        CASE WHEN pp.ganhos_n > 0
            THEN ROUND(pp.valor_won / pp.ganhos_n, 0)
            ELSE 0
        END AS ticket_medio,
        COALESCE(tc.tarefas_abertas, 0)::BIGINT,
        COALESCE(tc.tarefas_vencidas, 0)::BIGINT
    FROM por_pessoa pp
    JOIN profiles pr ON pr.id = pp.user_id
    LEFT JOIN tarefas_counts tc ON tc.user_id = pp.user_id
    ORDER BY pp.receita_total DESC, pp.cards_ganhos DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_team_leaderboard TO authenticated;

-- ═══════════════════════════════════════════════════════════════
-- 7. Índices para performance
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_cards_org_status_updated
    ON cards(org_id, status_comercial, updated_at DESC)
    WHERE deleted_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cards_org_stage_entered
    ON cards(org_id, pipeline_stage_id, stage_entered_at)
    WHERE deleted_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_activities_stage_changed
    ON activities(card_id, created_at DESC)
    WHERE tipo = 'stage_changed';

CREATE INDEX IF NOT EXISTS idx_tarefas_org_vencimento
    ON tarefas(org_id, data_vencimento)
    WHERE concluida = false AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel_abertas
    ON tarefas(responsavel_id)
    WHERE concluida = false AND deleted_at IS NULL;

-- Fim da reforma analytics — fundação.
