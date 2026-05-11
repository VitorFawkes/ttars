-- Soft Delete for Cards
-- Adds deleted_at/deleted_by columns, updates views to filter deleted cards,
-- creates deleted cards view for trash, and logs deletion activities.

-- 1. Add soft delete columns to cards table
ALTER TABLE cards ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- 2. Create partial index for performance on active cards
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cards_active 
ON cards (pipeline_stage_id, created_at) 
WHERE deleted_at IS NULL;

-- 3. Recreate view_cards_acoes with deleted_at filter
-- Using CASCADE to handle dependent views
DROP VIEW IF EXISTS view_cards_acoes CASCADE;

CREATE VIEW view_cards_acoes AS
SELECT c.id,
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
    ( SELECT row_to_json(t.*) AS row_to_json
           FROM ( SELECT va.id,
                    va.titulo,
                    va.data AS data_vencimento,
                    NULL::text AS prioridade,
                    va.entity_type AS tipo
                   FROM view_agenda va
                  WHERE va.card_id = c.id
                  ORDER BY va.data ASC
                 LIMIT 1) t) AS proxima_tarefa,
    ( SELECT count(*) AS count
           FROM view_agenda va
          WHERE va.card_id = c.id) AS tarefas_pendentes,
    ( SELECT count(*) AS count
           FROM view_agenda va
          WHERE va.card_id = c.id AND va.data < CURRENT_DATE) AS tarefas_atrasadas,
    ( SELECT row_to_json(t.*) AS row_to_json
           FROM ( SELECT a.id,
                    a.created_at,
                    a.descricao AS titulo,
                    a.tipo
                   FROM activities a
                  WHERE a.card_id = c.id
                  ORDER BY a.created_at DESC
                 LIMIT 1) t) AS ultima_interacao,
    EXTRACT(day FROM now() - c.updated_at) AS tempo_sem_contato,
    c.produto_data ->> 'taxa_planejamento'::text AS status_taxa,
        CASE
            WHEN c.data_viagem_inicio IS NOT NULL THEN EXTRACT(day FROM c.data_viagem_inicio - now())
            ELSE NULL::numeric
        END AS dias_ate_viagem,
        CASE
            WHEN c.data_viagem_inicio IS NOT NULL AND EXTRACT(day FROM c.data_viagem_inicio - now()) < 30::numeric THEN 100
            ELSE 0
        END AS urgencia_viagem,
    EXTRACT(day FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) AS tempo_etapa_dias,
        CASE
            WHEN s.sla_hours IS NOT NULL AND (EXTRACT(epoch FROM now() - COALESCE(c.stage_entered_at, c.updated_at)) / 3600::numeric) > s.sla_hours::numeric THEN 1
            ELSE 0
        END AS urgencia_tempo_etapa,
    c.produto_data -> 'destinos'::text AS destinos,
    c.produto_data -> 'orcamento'::text AS orcamento,
    c.valor_final,
    c.origem,
    c.external_id,
    c.campaign_id,
    c.moeda,
    c.condicoes_pagamento,
    c.forma_pagamento,
    c.estado_operacional,
    sdr.nome AS sdr_nome,
    vendas.nome AS vendas_nome,
    c.is_group_parent,
    c.parent_card_id,
    c.briefing_inicial,
    c.marketing_data
FROM cards c
    LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    LEFT JOIN pipelines p ON c.pipeline_id = p.id
    LEFT JOIN contatos pe ON c.pessoa_principal_id = pe.id
    LEFT JOIN profiles pr ON c.dono_atual_id = pr.id
    LEFT JOIN profiles sdr ON c.sdr_owner_id = sdr.id
    LEFT JOIN profiles vendas ON c.vendas_owner_id = vendas.id
WHERE c.deleted_at IS NULL;  -- CRITICAL: Filter out deleted cards

-- 4. Recreate dependent view: view_dashboard_funil
CREATE VIEW view_dashboard_funil AS
SELECT 
    etapa_nome,
    etapa_ordem,
    produto,
    count(*) AS total_cards,
    sum(valor_estimado) AS total_valor_estimado,
    sum(valor_final) AS total_valor_final
FROM view_cards_acoes
GROUP BY etapa_nome, etapa_ordem, produto;

-- 5. Create view for deleted cards (trash)
CREATE OR REPLACE VIEW view_deleted_cards AS
SELECT 
    c.id,
    c.titulo,
    c.produto,
    c.status_comercial,
    c.valor_estimado,
    c.deleted_at,
    c.deleted_by,
    d.nome AS deleted_by_nome,
    pe.nome AS pessoa_nome,
    s.nome AS etapa_nome,
    c.created_at
FROM cards c
    LEFT JOIN profiles d ON c.deleted_by = d.id
    LEFT JOIN contatos pe ON c.pessoa_principal_id = pe.id
    LEFT JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
WHERE c.deleted_at IS NOT NULL
ORDER BY c.deleted_at DESC;

-- 6. Create trigger to log card deletion/restoration
CREATE OR REPLACE FUNCTION log_card_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- Log deletion
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        INSERT INTO activities (card_id, tipo, descricao, created_by)
        VALUES (NEW.id, 'card_deleted', 'Viagem arquivada', NEW.deleted_by);
    END IF;
    
    -- Log restoration
    IF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
        INSERT INTO activities (card_id, tipo, descricao, created_by)
        VALUES (NEW.id, 'card_restored', 'Viagem restaurada', auth.uid());
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_log_card_deletion ON cards;
CREATE TRIGGER trigger_log_card_deletion
AFTER UPDATE OF deleted_at ON cards
FOR EACH ROW
EXECUTE FUNCTION log_card_deletion();

-- 7. Restore permissions
GRANT SELECT ON view_cards_acoes TO authenticated;
GRANT SELECT ON view_cards_acoes TO service_role;
GRANT SELECT ON view_dashboard_funil TO authenticated;
GRANT SELECT ON view_dashboard_funil TO service_role;
GRANT SELECT ON view_deleted_cards TO authenticated;
GRANT SELECT ON view_deleted_cards TO service_role;
