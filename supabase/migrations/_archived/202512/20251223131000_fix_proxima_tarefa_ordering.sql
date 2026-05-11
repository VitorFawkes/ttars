-- Migration: Fix "Sem próxima tarefa" bug
-- Description: Improve proxima_tarefa subquery in view_cards_acoes to be deterministic
-- Date: 2025-12-23
-- Priority: P0 Bugfix

-- Problem: The proxima_tarefa subquery can return inconsistent results when:
-- 1. Multiple pending tasks have the same data_vencimento
-- 2. Race condition between INSERT and SELECT during cache invalidation

-- Solution: Add deterministic tie-breaker (created_at DESC) to always prefer newest task

-- 1. Drop dependent views
DROP VIEW IF EXISTS view_dashboard_funil;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;

-- 2. Recreate view_cards_acoes with improved proxima_tarefa query
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
    s.fase,
    s.nome AS etapa_nome,
    s.ordem AS etapa_ordem,
    p.nome AS pipeline_nome,
    pe.nome AS pessoa_nome,
    pr.nome AS dono_atual_nome,
    pr.email AS dono_atual_email,
    sdr.nome AS sdr_owner_nome,
    sdr.email AS sdr_owner_email,
    -- Próxima tarefa pendente (IMPROVED: deterministic ordering)
    (SELECT row_to_json(t.*) FROM (
        SELECT id, titulo, data_vencimento, prioridade, tipo 
        FROM tarefas 
        WHERE card_id = c.id 
          AND COALESCE(tarefas.concluida, false) = false  -- Handle NULL as false
        ORDER BY 
            data_vencimento ASC,  -- Earliest first
            created_at DESC       -- If tie, newest task wins
        LIMIT 1
    ) t) AS proxima_tarefa,
    -- Contagem de tarefas pendentes
    (SELECT count(*) FROM tarefas WHERE card_id = c.id AND COALESCE(tarefas.concluida, false) = false) AS tarefas_pendentes,
    -- Tarefas atrasadas
    (SELECT count(*) FROM tarefas WHERE card_id = c.id AND COALESCE(tarefas.concluida, false) = false AND data_vencimento < CURRENT_DATE) AS tarefas_atrasadas,
    -- Última interação
    (SELECT row_to_json(t.*) FROM (
        SELECT id, titulo, concluida_em AS data, tipo 
        FROM tarefas 
        WHERE card_id = c.id AND tarefas.concluida = true 
        ORDER BY concluida_em DESC LIMIT 1
    ) t) AS ultima_interacao,
    -- Tempo sem contato (baseado em updated_at - para referência geral)
    EXTRACT(day FROM now() - c.updated_at) AS tempo_sem_contato,
    -- Status da taxa de planejamento
    c.produto_data ->> 'taxa_planejamento' AS status_taxa,
    -- Dias até viagem
    CASE
        WHEN c.data_viagem_inicio IS NOT NULL THEN EXTRACT(day FROM c.data_viagem_inicio - now())
        ELSE NULL
    END AS dias_ate_viagem,
    -- Urgência viagem
    CASE
        WHEN c.data_viagem_inicio IS NOT NULL AND EXTRACT(day FROM c.data_viagem_inicio - now()) < 30 THEN 100
        ELSE 0
    END AS urgencia_viagem,
    -- FIXED: Tempo na etapa - agora usa stage_entered_at em vez de updated_at
    EXTRACT(day FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) AS tempo_etapa_dias,
    -- Urgência tempo na etapa
    CASE
        WHEN s.sla_hours IS NOT NULL AND (EXTRACT(epoch FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) / 3600) > s.sla_hours THEN 1
        ELSE 0
    END AS urgencia_tempo_etapa,
    -- Destinos e orçamento
    c.produto_data -> 'destinos' AS destinos,
    c.produto_data -> 'orcamento' AS orcamento,
    -- Campos adicionais
    c.valor_final,
    c.origem,
    c.external_id,
    c.campaign_id,
    c.moeda,
    c.condicoes_pagamento,
    c.forma_pagamento,
    c.estado_operacional,
    -- Nomes dos owners
    sdr.nome AS sdr_nome,
    vendas.nome AS vendas_nome
FROM cards c
LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
LEFT JOIN pipelines p ON c.pipeline_id = p.id
LEFT JOIN contatos pe ON c.pessoa_principal_id = pe.id
LEFT JOIN profiles pr ON c.dono_atual_id = pr.id
LEFT JOIN profiles sdr ON c.sdr_owner_id = sdr.id
LEFT JOIN profiles vendas ON c.vendas_owner_id = vendas.id;

-- 3. Recreate view_dashboard_funil
CREATE OR REPLACE VIEW view_dashboard_funil AS
SELECT
    etapa_nome,
    etapa_ordem,
    produto,
    count(*) as total_cards,
    sum(valor_estimado) as total_valor_estimado,
    sum(valor_final) as total_valor_final
FROM view_cards_acoes
GROUP BY etapa_nome, etapa_ordem, produto;

-- 4. Grant permissions
GRANT SELECT ON view_cards_acoes TO authenticated;
GRANT SELECT ON view_dashboard_funil TO authenticated;

-- 5. Add comment for documentation
COMMENT ON VIEW view_cards_acoes IS 'Cards view with task aggregations. proxima_tarefa uses deterministic ordering: data_vencimento ASC, created_at DESC. Uses COALESCE(concluida, false) to handle NULL values.';
