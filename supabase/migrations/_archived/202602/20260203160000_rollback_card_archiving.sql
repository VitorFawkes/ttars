-- ============================================================================
-- MIGRATION: ROLLBACK Card Archiving Feature
-- Description: Reverts 20260202400000_add_card_archiving.sql to restore site
-- Date: 2026-02-03
-- ============================================================================

BEGIN;

-- 1. Drop the new view created for archiving
DROP VIEW IF EXISTS view_archived_cards CASCADE;

-- 2. Drop the optimization indexes added later
DROP INDEX IF EXISTS idx_activities_card_created_at_desc;
DROP INDEX IF EXISTS idx_cards_product_archived_filtered;

-- 3. Drop the archiving index
DROP INDEX IF EXISTS idx_cards_archived_at;

-- 4. Drop dependent views before altering cards table
DROP VIEW IF EXISTS view_dashboard_funil CASCADE;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;

-- 5. Remove the archiving columns from cards table
ALTER TABLE cards DROP COLUMN IF EXISTS archived_at;
ALTER TABLE cards DROP COLUMN IF EXISTS archived_by;

-- 6. Recreate view_cards_acoes WITHOUT archive columns (original from sub_cards_system)
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

    -- SUB-CARD COLUMNS
    c.card_type,
    c.sub_card_mode,
    c.sub_card_status,

    -- Parent card title for sub-cards
    parent.titulo AS parent_card_title,

    -- Count of active sub-cards for parent cards
    (SELECT COUNT(*)
     FROM cards sc
     WHERE sc.parent_card_id = c.id
       AND sc.card_type = 'sub_card'
       AND sc.sub_card_status = 'active'
       AND sc.deleted_at IS NULL
    ) AS active_sub_cards_count,

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
LEFT JOIN cards parent ON c.parent_card_id = parent.id
WHERE c.deleted_at IS NULL
  AND (c.card_type != 'sub_card' OR c.sub_card_status = 'active');

-- 7. Recreate view_dashboard_funil (original version)
CREATE OR REPLACE VIEW view_dashboard_funil AS
SELECT
    etapa_nome,
    etapa_ordem,
    produto,
    count(*) as total_cards,
    sum(valor_estimado) as total_valor_estimado,
    sum(valor_final) as total_valor_final
FROM view_cards_acoes
WHERE card_type != 'sub_card' OR sub_card_status = 'active'
GROUP BY etapa_nome, etapa_ordem, produto;

-- 8. Re-apply security settings
ALTER VIEW public.view_cards_acoes SET (security_invoker = true);
ALTER VIEW public.view_dashboard_funil SET (security_invoker = true);

-- 9. Grant permissions
GRANT SELECT ON view_cards_acoes TO authenticated;
GRANT SELECT ON view_dashboard_funil TO authenticated;

-- 10. Reload PostgREST schema cache to apply changes
NOTIFY pgrst, 'reload schema';

COMMIT;
