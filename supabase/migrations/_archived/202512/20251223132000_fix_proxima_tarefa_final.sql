-- ============================================================================
-- MIGRATION: Fix "Sem próxima tarefa" bug - PRODUCTION READY
-- Description: 100% deterministic proxima_tarefa ordering with all edge cases
-- Date: 2025-12-23
-- Priority: P0 Bugfix
-- ============================================================================

-- PROBLEM:
-- 1. Non-deterministic ordering when multiple tasks have same data_vencimento
-- 2. NULL concluida values excluded by "WHERE concluida = false"
-- 3. NULL data_vencimento causes undefined ordering behavior
-- 4. Ties in both data_vencimento AND created_at still possible

-- SOLUTION:
-- 3-level deterministic ordering:
--   1. data_vencimento ASC NULLS LAST (tasks with dates come first)
--   2. created_at DESC (newest task wins ties)
--   3. id DESC (final tie-breaker, guaranteed unique)

-- ============================================================================
-- STEP 1: Drop dependent views
-- ============================================================================
DROP VIEW IF EXISTS view_dashboard_funil CASCADE;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;

-- ============================================================================
-- STEP 2: Recreate view_cards_acoes with bulletproof ordering
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
    s.fase,
    s.nome AS etapa_nome,
    s.ordem AS etapa_ordem,
    p.nome AS pipeline_nome,
    pe.nome AS pessoa_nome,
    pr.nome AS dono_atual_nome,
    pr.email AS dono_atual_email,
    sdr.nome AS sdr_owner_nome,
    sdr.email AS sdr_owner_email,
    
    -- ========================================================================
    -- PROXIMA_TAREFA: 100% deterministic ordering
    -- ========================================================================
    -- BEFORE:
    --   ORDER BY data_vencimento ASC LIMIT 1
    --   Problems: non-deterministic on ties, excludes NULL concluida, undefined NULL date behavior
    --
    -- AFTER:
    --   3-level sort: data_vencimento (NULLS LAST) → created_at DESC → id DESC
    --   COALESCE for NULL-safety
    -- ========================================================================
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
            AND COALESCE(tarefas.concluida, false) = false  -- NULL-safe
        ORDER BY 
            data_vencimento ASC NULLS LAST,  -- Tasks with dates first, undated last
            created_at DESC,                  -- Newest task wins on date ties
            id DESC                           -- Final tie-breaker (PK, guaranteed unique)
        LIMIT 1
    ) t) AS proxima_tarefa,
    
    -- ========================================================================
    -- TAREFAS_PENDENTES: count with NULL-safe filter
    -- ========================================================================
    (SELECT count(*) 
     FROM tarefas 
     WHERE card_id = c.id 
       AND COALESCE(tarefas.concluida, false) = false
    ) AS tarefas_pendentes,
    
    -- ========================================================================
    -- TAREFAS_ATRASADAS: overdue tasks
    -- ========================================================================
    (SELECT count(*) 
     FROM tarefas 
     WHERE card_id = c.id 
       AND COALESCE(tarefas.concluida, false) = false 
       AND data_vencimento < CURRENT_DATE
    ) AS tarefas_atrasadas,
    
    -- ========================================================================
    -- ULTIMA_INTERACAO: last completed task
    -- ========================================================================
    (SELECT row_to_json(t.*) FROM (
        SELECT 
            id, 
            titulo, 
            concluida_em AS data, 
            tipo 
        FROM tarefas 
        WHERE card_id = c.id 
          AND tarefas.concluida = true 
        ORDER BY concluida_em DESC 
        LIMIT 1
    ) t) AS ultima_interacao,
    
    -- Additional calculated fields
    EXTRACT(day FROM now() - c.updated_at) AS tempo_sem_contato,
    c.produto_data ->> 'taxa_planejamento' AS status_taxa,
    CASE
        WHEN c.data_viagem_inicio IS NOT NULL 
        THEN EXTRACT(day FROM c.data_viagem_inicio - now())
        ELSE NULL
    END AS dias_ate_viagem,
    CASE
        WHEN c.data_viagem_inicio IS NOT NULL 
         AND EXTRACT(day FROM c.data_viagem_inicio - now()) < 30 
        THEN 100
        ELSE 0
    END AS urgencia_viagem,
    EXTRACT(day FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) AS tempo_etapa_dias,
    CASE
        WHEN s.sla_hours IS NOT NULL 
         AND (EXTRACT(epoch FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) / 3600) > s.sla_hours 
        THEN 1
        ELSE 0
    END AS urgencia_tempo_etapa,
    c.produto_data -> 'destinos' AS destinos,
    c.produto_data -> 'orcamento' AS orcamento,
    c.valor_final,
    c.origem,
    c.external_id,
    c.campaign_id,
    c.moeda,
    c.condicoes_pagamento,
    c.forma_pagamento,
    c.estado_operacional,
    sdr.nome AS sdr_nome,
    vendas.nome AS vendas_nome
FROM cards c
LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
LEFT JOIN pipelines p ON c.pipeline_id = p.id
LEFT JOIN contatos pe ON c.pessoa_principal_id = pe.id
LEFT JOIN profiles pr ON c.dono_atual_id = pr.id
LEFT JOIN profiles sdr ON c.sdr_owner_id = sdr.id
LEFT JOIN profiles vendas ON c.vendas_owner_id = vendas.id;

-- ============================================================================
-- STEP 3: Recreate dependent view
-- ============================================================================
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

-- ============================================================================
-- STEP 4: Grant permissions
-- ============================================================================
GRANT SELECT ON view_cards_acoes TO authenticated;
GRANT SELECT ON view_dashboard_funil TO authenticated;

-- ============================================================================
-- STEP 5: Add documentation
-- ============================================================================
COMMENT ON VIEW view_cards_acoes IS 
'Cards with task aggregations. proxima_tarefa ordering: 
1) data_vencimento ASC NULLS LAST (dated tasks first)
2) created_at DESC (newest wins ties)
3) id DESC (final tie-breaker)
Filter uses COALESCE(concluida,false)=false for NULL-safety.';

-- ============================================================================
-- VERIFICATION QUERIES (run after migration)
-- ============================================================================
/*
-- 1. Check for cards with NULL proxima_tarefa but positive tarefas_pendentes
SELECT id, titulo, tarefas_pendentes, proxima_tarefa
FROM view_cards_acoes
WHERE tarefas_pendentes > 0 AND proxima_tarefa IS NULL;
-- Expected: 0 rows

-- 2. Verify deterministic ordering for a card with multiple pending tasks
SELECT 
    t.card_id,
    t.id,
    t.titulo,
    t.data_vencimento,
    t.created_at,
    ROW_NUMBER() OVER (
        PARTITION BY t.card_id 
        ORDER BY t.data_vencimento ASC NULLS LAST, t.created_at DESC, t.id DESC
    ) as expected_rank
FROM tarefas t
WHERE COALESCE(t.concluida, false) = false
  AND t.card_id IN (
      SELECT card_id FROM tarefas 
      WHERE COALESCE(concluida, false) = false 
      GROUP BY card_id 
      HAVING count(*) > 1
  )
ORDER BY t.card_id, expected_rank;
-- Expected: rank=1 should match proxima_tarefa from view
*/
