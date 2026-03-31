-- ============================================================================
-- MIGRATION: Add pessoa_telefone_normalizado to view_cards_acoes
-- Problem: Phone search "11964293533" doesn't match stored "(11) 96429-3533"
--          because ILIKE substring match fails with formatting characters
-- Solution: Add computed column using normalize_phone_brazil() (IMMUTABLE)
-- Date: 2026-02-11
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. DROP dependent views (CASCADE-safe rebuild)
-- ============================================================================

DROP VIEW IF EXISTS view_dashboard_funil CASCADE;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;
DROP VIEW IF EXISTS view_archived_cards CASCADE;

-- ============================================================================
-- 2. RECREATE view_cards_acoes with pessoa_telefone_normalizado
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
    c.valor_final,
    COALESCE(c.valor_final, c.valor_estimado) AS valor_display,
    c.receita,
    c.receita_source,
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
    normalize_phone_brazil(pe.telefone) AS pessoa_telefone_normalizado,  -- NEW: digits-only for search
    pe.email AS pessoa_email,

    -- OWNER FIELDS
    pr.nome AS dono_atual_nome,
    pr.email AS dono_atual_email,
    sdr.nome AS sdr_owner_nome,
    sdr.email AS sdr_owner_email,
    vendas.nome AS vendas_nome,

    -- PROXIMA TAREFA (pre-aggregated, not LATERAL)
    nt.data AS proxima_tarefa,

    -- TASK COUNTS (pre-aggregated, not LATERAL)
    COALESCE(ta.pendentes, 0) AS tarefas_pendentes,
    COALESCE(ta.atrasadas, 0) AS tarefas_atrasadas,

    -- ULTIMA INTERACAO (pre-aggregated, not LATERAL)
    la.data AS ultima_interacao,

    -- TEMPO SEM CONTATO
    EXTRACT(DAY FROM NOW() - la.last_activity_at)::integer AS tempo_sem_contato,

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

    -- Destinos e Orcamento
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

-- PRE-AGGREGATED: Task counts (single scan of tarefas table)
LEFT JOIN (
    SELECT
        card_id,
        COUNT(*) AS pendentes,
        COUNT(*) FILTER (WHERE data_vencimento < CURRENT_DATE) AS atrasadas
    FROM tarefas
    WHERE COALESCE(concluida, false) = false
      AND (status IS NULL OR status != 'reagendada')
    GROUP BY card_id
) ta ON ta.card_id = c.id

-- PRE-AGGREGATED: Next task per card (DISTINCT ON instead of LATERAL)
LEFT JOIN (
    SELECT DISTINCT ON (sub.card_id)
        sub.card_id,
        row_to_json(sub.*) AS data
    FROM (
        SELECT id, card_id, titulo, data_vencimento, prioridade, tipo, created_at
        FROM tarefas
        WHERE COALESCE(concluida, false) = false
          AND (status IS NULL OR status != 'reagendada')
    ) sub
    ORDER BY sub.card_id, sub.data_vencimento ASC NULLS LAST, sub.created_at DESC, sub.id DESC
) nt ON nt.card_id = c.id

-- PRE-AGGREGATED: Last activity per card (DISTINCT ON instead of LATERAL)
LEFT JOIN (
    SELECT DISTINCT ON (sub.card_id)
        sub.card_id,
        row_to_json(sub.*) AS data,
        sub.created_at AS last_activity_at
    FROM (
        SELECT id, card_id, tipo, descricao, created_at
        FROM activities
    ) sub
    ORDER BY sub.card_id, sub.created_at DESC
) la ON la.card_id = c.id

WHERE c.deleted_at IS NULL;

-- ============================================================================
-- 3. RECREATE view_dashboard_funil (unchanged)
-- ============================================================================

CREATE OR REPLACE VIEW view_dashboard_funil AS
SELECT
    s.id AS stage_id,
    s.nome AS stage_nome,
    s.fase,
    s.ordem,
    c.produto,
    COUNT(c.id) AS total_cards,
    COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0) AS valor_total,
    COALESCE(SUM(c.receita), 0) AS receita_total
FROM pipeline_stages s
LEFT JOIN cards c ON c.pipeline_stage_id = s.id
    AND c.deleted_at IS NULL
    AND c.archived_at IS NULL
WHERE s.ativo = true
GROUP BY s.id, s.nome, s.fase, s.ordem, c.produto
ORDER BY s.ordem;

-- ============================================================================
-- 4. RECREATE view_archived_cards (unchanged)
-- ============================================================================

CREATE OR REPLACE VIEW view_archived_cards AS
SELECT
    c.id,
    c.titulo,
    c.produto,
    c.valor_estimado,
    c.valor_final,
    COALESCE(c.valor_final, c.valor_estimado) AS valor_display,
    c.receita,
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
-- 5. REFRESH STATISTICS
-- ============================================================================

ANALYZE cards;
ANALYZE contatos;

COMMIT;
