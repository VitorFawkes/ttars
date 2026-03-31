-- ============================================================================
-- MIGRATION: Add Search Fields to View Cards Acoes
-- Description: Adds pessoa_telefone and pessoa_email for improved search
-- Date: 2026-01-31
-- Priority: P1 - Melhoria de busca no pipeline
-- ============================================================================

BEGIN;

-- 1. Drop dependent views
DROP VIEW IF EXISTS view_dashboard_funil CASCADE;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;

-- 2. Recreate view_cards_acoes with new search columns
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

    -- GROUP COLUMNS
    c.parent_card_id,
    c.is_group_parent,

    s.fase,
    s.nome AS etapa_nome,
    s.ordem AS etapa_ordem,
    p.nome AS pipeline_nome,

    -- CONTACT FIELDS (enhanced for search)
    pe.nome AS pessoa_nome,
    pe.telefone AS pessoa_telefone,
    pe.email AS pessoa_email,

    -- OWNER FIELDS
    pr.nome AS dono_atual_nome,
    pr.email AS dono_atual_email,
    sdr.nome AS sdr_owner_nome,
    sdr.email AS sdr_owner_email,

    -- PROXIMA_TAREFA: Exclude 'reagendada' status
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

    -- TAREFAS_PENDENTES: Exclude 'reagendada'
    (SELECT count(*)
     FROM tarefas
     WHERE card_id = c.id
       AND COALESCE(tarefas.concluida, false) = false
       AND (tarefas.status IS NULL OR tarefas.status != 'reagendada')
    ) AS tarefas_pendentes,

    -- TAREFAS_ATRASADAS: Exclude 'reagendada'
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
LEFT JOIN profiles vendas ON c.vendas_owner_id = vendas.id
WHERE c.deleted_at IS NULL;

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

-- 4. Re-apply security settings
ALTER VIEW public.view_cards_acoes SET (security_invoker = true);
ALTER VIEW public.view_dashboard_funil SET (security_invoker = true);

-- 5. Grant permissions
GRANT SELECT ON view_cards_acoes TO authenticated;
GRANT SELECT ON view_dashboard_funil TO authenticated;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- SELECT pessoa_telefone, pessoa_email, pessoa_nome
-- FROM view_cards_acoes
-- WHERE pessoa_telefone IS NOT NULL
-- LIMIT 5;
