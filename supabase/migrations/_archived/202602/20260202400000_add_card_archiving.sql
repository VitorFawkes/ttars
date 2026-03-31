-- ============================================================================
-- MIGRATION: Sistema de Arquivamento de Cards
-- Description: Adiciona campos archived_at e archived_by à tabela cards
--              e atualiza view_cards_acoes para suportar filtro de arquivados
-- Date: 2026-02-02
-- ============================================================================

BEGIN;

-- 1. Adicionar campos de arquivamento na tabela cards
ALTER TABLE cards
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES profiles(id) DEFAULT NULL;

-- 2. Criar índice para performance nas queries de arquivados
CREATE INDEX IF NOT EXISTS idx_cards_archived_at ON cards(archived_at) WHERE archived_at IS NOT NULL;

-- 3. Comentários para documentação
COMMENT ON COLUMN cards.archived_at IS 'Timestamp de quando o card foi arquivado (null = não arquivado)';
COMMENT ON COLUMN cards.archived_by IS 'ID do usuário que arquivou o card';

-- 4. Drop dependent views
DROP VIEW IF EXISTS view_dashboard_funil CASCADE;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;

-- 5. Recreate view_cards_acoes com campo archived_at
-- IMPORTANTE: A view agora filtra apenas cards NÃO arquivados por padrão
-- Se quiser ver arquivados, use query direta na tabela cards
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

    -- ARCHIVE COLUMNS (exposed for filtering)
    c.archived_at,
    c.archived_by,

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

    -- PROXIMA_TAREFA
    (SELECT row_to_json(t.*) FROM (
        SELECT
            id,
            titulo,
            data_vencimento,
            prioridade,
            tipo
        FROM tarefas
        WHERE
            card_id = c.id
            AND COALESCE(tarefas.concluida, false) = false
            AND (tarefas.status IS NULL OR tarefas.status != 'reagendada')
        ORDER BY
            data_vencimento ASC NULLS LAST,
            created_at DESC,
            id DESC
        LIMIT 1
    ) t) AS proxima_tarefa,

    -- TAREFAS_PENDENTES
    (SELECT count(*)
     FROM tarefas
     WHERE card_id = c.id
       AND COALESCE(tarefas.concluida, false) = false
       AND (tarefas.status IS NULL OR tarefas.status != 'reagendada')
    ) AS tarefas_pendentes,

    -- TAREFAS_ATRASADAS
    (SELECT count(*)
     FROM tarefas
     WHERE card_id = c.id
       AND COALESCE(tarefas.concluida, false) = false
       AND data_vencimento < CURRENT_DATE
       AND (tarefas.status IS NULL OR tarefas.status != 'reagendada')
    ) AS tarefas_atrasadas,

    -- ULTIMA_INTERACAO
    (SELECT row_to_json(t.*) FROM (
        SELECT
            id,
            tipo,
            descricao,
            created_at
        FROM activities
        WHERE card_id = c.id
        ORDER BY created_at DESC
        LIMIT 1
    ) t) AS ultima_interacao,

    -- TEMPO SEM CONTATO
    EXTRACT(DAY FROM NOW() - (
        SELECT MAX(created_at)
        FROM activities
        WHERE card_id = c.id
    ))::integer AS tempo_sem_contato,

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

    -- Destinos e Orçamento (extraídos de produto_data)
    c.produto_data->>'destinos' AS destinos,
    c.produto_data->>'orcamento' AS orcamento,

    -- Parent card title for sub-cards
    parent.titulo AS parent_titulo

FROM cards c
LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
LEFT JOIN pipelines p ON c.pipeline_id = p.id
LEFT JOIN contatos pe ON c.pessoa_principal_id = pe.id
LEFT JOIN profiles pr ON c.dono_atual_id = pr.id
LEFT JOIN profiles sdr ON c.sdr_owner_id = sdr.id
LEFT JOIN profiles vendas ON c.vendas_owner_id = vendas.id
LEFT JOIN cards parent ON c.parent_card_id = parent.id
WHERE c.deleted_at IS NULL;
-- NOTA: Não filtramos archived_at aqui - o frontend decide se quer ver arquivados ou não

-- 6. Recreate dependent views
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

-- 7. Criar view específica para cards arquivados (para página de arquivados)
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

COMMIT;
