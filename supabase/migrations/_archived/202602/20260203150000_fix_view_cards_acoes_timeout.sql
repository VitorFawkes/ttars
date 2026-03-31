-- ============================================================================
-- MIGRATION: Fix view_cards_acoes Timeout (Critical Performance Fix)
-- Description: Adds optimized indexes and rewrites view using LATERAL JOINs
-- Problem: View causing 500 timeout with 730 cards × 5 subqueries × large tables
-- Date: 2026-02-03
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CREATE CRITICAL INDEXES
-- ============================================================================

-- Index for ultima_interacao and tempo_sem_contato subqueries
-- This is the most important index - activities has 43k+ rows
CREATE INDEX IF NOT EXISTS idx_activities_card_created_desc
ON activities(card_id, created_at DESC);

-- Index for tarefas subqueries (proxima_tarefa, tarefas_pendentes, tarefas_atrasadas)
-- Composite index covering all filter conditions
CREATE INDEX IF NOT EXISTS idx_tarefas_card_pendentes
ON tarefas(card_id, concluida, status, data_vencimento ASC NULLS LAST, created_at DESC);

-- Partial index for only pending tasks (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_tarefas_pendentes_por_card
ON tarefas(card_id, data_vencimento ASC NULLS LAST, created_at DESC)
WHERE COALESCE(concluida, false) = false AND (status IS NULL OR status != 'reagendada');

-- Index for cards filtering (produto + archived + deleted)
CREATE INDEX IF NOT EXISTS idx_cards_produto_active
ON cards(produto, created_at DESC)
WHERE deleted_at IS NULL AND archived_at IS NULL;

-- ============================================================================
-- 2. DROP AND RECREATE VIEWS (CASCADE to dependencies)
-- ============================================================================

DROP VIEW IF EXISTS view_dashboard_funil CASCADE;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;
DROP VIEW IF EXISTS view_archived_cards CASCADE;

-- ============================================================================
-- 3. RECREATE view_cards_acoes with LATERAL JOINs
-- LATERAL JOINs are more efficient than correlated subqueries in SELECT
-- ============================================================================

CREATE OR REPLACE VIEW view_cards_acoes AS
SELECT
    c.id,
    c.titulo,
    c.produto,
    c.pipeline_id,
    c.pipeline_stage_id,
    c.pessoa_principal_id,
    c.valor_estimado,
    c.dono_atual_id,
    c.sdr_owner_id,
    c.vendas_owner_id,
    c.pos_owner_id,
    c.concierge_owner_id,
    c.status_comercial,
    c.produto_data,
    c.cliente_recorrente,
    c.prioridade,
    c.data_viagem_inicio,
    c.created_at,
    c.updated_at,
    c.data_fechamento,
    c.briefing_inicial,
    c.marketing_data,
    c.origem,
    c.external_id,
    c.campaign_id,
    c.moeda,
    c.condicoes_pagamento,
    c.forma_pagamento,
    c.estado_operacional,

    -- GROUP COLUMNS
    c.parent_card_id,
    c.is_group_parent,

    -- SUB-CARD COLUMNS
    c.card_type,
    c.sub_card_mode,
    c.sub_card_status,

    -- ARCHIVE COLUMNS
    c.archived_at,
    c.archived_by,

    -- STAGE/PIPELINE JOINS
    s.fase,
    s.nome AS etapa_nome,
    s.ordem AS etapa_ordem,
    p.nome AS pipeline_nome,

    -- CONTACT FIELDS
    pe.nome AS pessoa_nome,
    pe.telefone AS pessoa_telefone,
    pe.email AS pessoa_email,

    -- OWNER FIELDS
    pr.nome AS dono_atual_nome,
    pr.email AS dono_atual_email,
    sdr.nome AS sdr_owner_nome,
    sdr.email AS sdr_owner_email,
    vendas.nome AS vendas_nome,

    -- OPTIMIZED: PROXIMA_TAREFA via LATERAL
    proxima_tarefa.data AS proxima_tarefa,

    -- OPTIMIZED: COUNTS via LATERAL subqueries
    COALESCE(task_counts.pendentes, 0) AS tarefas_pendentes,
    COALESCE(task_counts.atrasadas, 0) AS tarefas_atrasadas,

    -- OPTIMIZED: ULTIMA_INTERACAO via LATERAL
    ultima_interacao.data AS ultima_interacao,

    -- OPTIMIZED: TEMPO SEM CONTATO via LATERAL
    EXTRACT(DAY FROM NOW() - ultima_interacao.last_activity_at)::integer AS tempo_sem_contato,

    -- DIAS ATE VIAGEM
    CASE
        WHEN c.data_viagem_inicio IS NOT NULL
        THEN EXTRACT(DAY FROM c.data_viagem_inicio - CURRENT_DATE)::integer
        ELSE NULL
    END AS dias_ate_viagem,

    -- URGENCIA VIAGEM
    CASE
        WHEN c.data_viagem_inicio IS NULL THEN 'sem_data'
        WHEN c.data_viagem_inicio <= CURRENT_DATE + INTERVAL '7 days' THEN 'critica'
        WHEN c.data_viagem_inicio <= CURRENT_DATE + INTERVAL '30 days' THEN 'alta'
        WHEN c.data_viagem_inicio <= CURRENT_DATE + INTERVAL '60 days' THEN 'media'
        ELSE 'baixa'
    END AS urgencia_viagem,

    -- TEMPO NA ETAPA
    EXTRACT(DAY FROM NOW() - COALESCE(c.stage_entered_at, c.created_at))::integer AS tempo_etapa_dias,

    -- URGENCIA TEMPO NA ETAPA
    CASE
        WHEN EXTRACT(DAY FROM NOW() - COALESCE(c.stage_entered_at, c.created_at)) > 14 THEN 'critica'
        WHEN EXTRACT(DAY FROM NOW() - COALESCE(c.stage_entered_at, c.created_at)) > 7 THEN 'alta'
        WHEN EXTRACT(DAY FROM NOW() - COALESCE(c.stage_entered_at, c.created_at)) > 3 THEN 'media'
        ELSE 'normal'
    END AS urgencia_tempo_etapa,

    -- Destinos e Orçamento
    c.produto_data->>'destinos' AS destinos,
    c.produto_data->>'orcamento' AS orcamento,

    -- Parent card title
    parent.titulo AS parent_titulo

FROM cards c
LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
LEFT JOIN pipelines p ON c.pipeline_id = p.id
LEFT JOIN contatos pe ON c.pessoa_principal_id = pe.id
LEFT JOIN profiles pr ON c.dono_atual_id = pr.id
LEFT JOIN profiles sdr ON c.sdr_owner_id = sdr.id
LEFT JOIN profiles vendas ON c.vendas_owner_id = vendas.id
LEFT JOIN cards parent ON c.parent_card_id = parent.id

-- LATERAL for proxima_tarefa (single row)
LEFT JOIN LATERAL (
    SELECT row_to_json(t.*) AS data
    FROM (
        SELECT
            id,
            titulo,
            data_vencimento,
            prioridade,
            tipo
        FROM tarefas
        WHERE card_id = c.id
            AND COALESCE(concluida, false) = false
            AND (status IS NULL OR status != 'reagendada')
        ORDER BY data_vencimento ASC NULLS LAST, created_at DESC, id DESC
        LIMIT 1
    ) t
) proxima_tarefa ON true

-- LATERAL for task counts (aggregated)
LEFT JOIN LATERAL (
    SELECT
        COUNT(*) FILTER (WHERE true) AS pendentes,
        COUNT(*) FILTER (WHERE data_vencimento < CURRENT_DATE) AS atrasadas
    FROM tarefas
    WHERE card_id = c.id
        AND COALESCE(concluida, false) = false
        AND (status IS NULL OR status != 'reagendada')
) task_counts ON true

-- LATERAL for ultima_interacao (single row with timestamp)
LEFT JOIN LATERAL (
    SELECT
        row_to_json(t.*) AS data,
        t.created_at AS last_activity_at
    FROM (
        SELECT
            id,
            tipo,
            descricao,
            created_at
        FROM activities
        WHERE card_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
    ) t
) ultima_interacao ON true

WHERE c.deleted_at IS NULL;

-- ============================================================================
-- 4. RECREATE view_dashboard_funil
-- ============================================================================

CREATE OR REPLACE VIEW view_dashboard_funil AS
SELECT
    s.id AS stage_id,
    s.nome AS stage_nome,
    s.fase,
    s.ordem,
    c.produto,
    COUNT(c.id) AS total_cards,
    COALESCE(SUM(c.valor_estimado), 0) AS valor_total
FROM pipeline_stages s
LEFT JOIN cards c ON c.pipeline_stage_id = s.id
    AND c.deleted_at IS NULL
    AND c.archived_at IS NULL
WHERE s.ativo = true
GROUP BY s.id, s.nome, s.fase, s.ordem, c.produto
ORDER BY s.ordem;

-- ============================================================================
-- 5. RECREATE view_archived_cards
-- ============================================================================

CREATE OR REPLACE VIEW view_archived_cards AS
SELECT
    c.id,
    c.titulo,
    c.produto,
    c.valor_estimado,
    c.status_comercial,
    c.archived_at,
    c.archived_by,
    c.created_at,
    c.data_viagem_inicio,
    pe.nome AS pessoa_nome,
    pr.nome AS dono_atual_nome,
    arch.nome AS archived_by_nome,
    s.nome AS etapa_nome
FROM cards c
LEFT JOIN contatos pe ON c.pessoa_principal_id = pe.id
LEFT JOIN profiles pr ON c.dono_atual_id = pr.id
LEFT JOIN profiles arch ON c.archived_by = arch.id
LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
WHERE c.deleted_at IS NULL
  AND c.archived_at IS NOT NULL
ORDER BY c.archived_at DESC;

-- ============================================================================
-- 6. ANALYZE TABLES TO UPDATE STATISTICS
-- ============================================================================

ANALYZE activities;
ANALYZE tarefas;
ANALYZE cards;

COMMIT;
