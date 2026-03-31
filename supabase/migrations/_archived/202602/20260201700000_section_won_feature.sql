-- ============================================================================
-- MIGRATION: Section Won Feature (Ganho por Seção)
-- Description: Adds section-specific won markers (SDR, Planner, Pós) and updates
--              the status automation trigger to use is_won/is_lost instead of hardcoded names
-- Date: 2026-02-01
-- Priority: P1 - Feature de Ganho por Seção
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: Add new columns to pipeline_stages
-- ============================================================================

ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS is_sdr_won BOOLEAN DEFAULT false;
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS is_planner_won BOOLEAN DEFAULT false;
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS is_pos_won BOOLEAN DEFAULT false;

COMMENT ON COLUMN pipeline_stages.is_sdr_won IS 'Marca etapa como marco de ganho do SDR (badge no card)';
COMMENT ON COLUMN pipeline_stages.is_planner_won IS 'Marca etapa como marco de ganho do Planner (badge no card)';
COMMENT ON COLUMN pipeline_stages.is_pos_won IS 'Marca etapa como marco de ganho do Pós-venda (badge no card)';
-- is_won e is_lost já existem para ganho/perda TOTAL

-- ============================================================================
-- PHASE 2: Add new columns to cards
-- ============================================================================

ALTER TABLE cards ADD COLUMN IF NOT EXISTS ganho_sdr BOOLEAN DEFAULT false;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ganho_sdr_at TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ganho_planner BOOLEAN DEFAULT false;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ganho_planner_at TIMESTAMPTZ;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ganho_pos BOOLEAN DEFAULT false;
ALTER TABLE cards ADD COLUMN IF NOT EXISTS ganho_pos_at TIMESTAMPTZ;

COMMENT ON COLUMN cards.ganho_sdr IS 'Card passou por etapa de ganho SDR';
COMMENT ON COLUMN cards.ganho_sdr_at IS 'Data/hora que card atingiu ganho SDR';
COMMENT ON COLUMN cards.ganho_planner IS 'Card passou por etapa de ganho Planner';
COMMENT ON COLUMN cards.ganho_planner_at IS 'Data/hora que card atingiu ganho Planner';
COMMENT ON COLUMN cards.ganho_pos IS 'Card passou por etapa de ganho Pós-venda';
COMMENT ON COLUMN cards.ganho_pos_at IS 'Data/hora que card atingiu ganho Pós-venda';

-- ============================================================================
-- PHASE 3: Update trigger handle_card_status_automation
-- Now uses is_won/is_lost flags instead of hardcoded stage names
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_card_status_automation()
RETURNS TRIGGER AS $$
DECLARE
    v_stage RECORD;
BEGIN
    -- Buscar dados da nova etapa
    SELECT is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won
    INTO v_stage
    FROM pipeline_stages
    WHERE id = NEW.pipeline_stage_id;

    -- Se não encontrou a etapa, manter comportamento padrão
    IF v_stage IS NULL THEN
        IF NEW.status_comercial IS NULL THEN
            NEW.status_comercial := 'aberto';
        END IF;
        RETURN NEW;
    END IF;

    -- GANHO TOTAL (status_comercial = 'ganho')
    IF v_stage.is_won = true THEN
        NEW.status_comercial := 'ganho';

    -- PERDA (status_comercial = 'perdido')
    ELSIF v_stage.is_lost = true THEN
        NEW.status_comercial := 'perdido';

    -- OUTROS (reset para 'aberto' se estava ganho/perdido e voltou para etapa normal)
    ELSE
        IF OLD IS NOT NULL AND OLD.status_comercial IN ('ganho', 'perdido') THEN
            NEW.status_comercial := 'aberto';
        END IF;
        IF NEW.status_comercial IS NULL THEN
            NEW.status_comercial := 'aberto';
        END IF;
    END IF;

    -- MARCOS por seção (não alteram status_comercial, apenas marcam o card)
    IF v_stage.is_sdr_won = true THEN
        IF OLD IS NULL OR OLD.ganho_sdr IS NULL OR OLD.ganho_sdr = false THEN
            NEW.ganho_sdr := true;
            NEW.ganho_sdr_at := NOW();
        END IF;
    END IF;

    IF v_stage.is_planner_won = true THEN
        IF OLD IS NULL OR OLD.ganho_planner IS NULL OR OLD.ganho_planner = false THEN
            NEW.ganho_planner := true;
            NEW.ganho_planner_at := NOW();
        END IF;
    END IF;

    IF v_stage.is_pos_won = true THEN
        IF OLD IS NULL OR OLD.ganho_pos IS NULL OR OLD.ganho_pos = false THEN
            NEW.ganho_pos := true;
            NEW.ganho_pos_at := NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (já existe, apenas recriando para garantir)
DROP TRIGGER IF EXISTS trigger_card_status_automation ON cards;

CREATE TRIGGER trigger_card_status_automation
    BEFORE INSERT OR UPDATE OF pipeline_stage_id
    ON cards
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_card_status_automation();

-- ============================================================================
-- PHASE 4: Update view_cards_acoes to include new columns
-- ============================================================================

-- Drop dependent views first
DROP VIEW IF EXISTS view_dashboard_funil CASCADE;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;

-- Recreate view with new ganho columns
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

    -- SECTION WON MARKERS (new)
    c.ganho_sdr,
    c.ganho_sdr_at,
    c.ganho_planner,
    c.ganho_planner_at,
    c.ganho_pos,
    c.ganho_pos_at,

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

-- Recreate view_dashboard_funil
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

-- Re-apply security settings
ALTER VIEW public.view_cards_acoes SET (security_invoker = true);
ALTER VIEW public.view_dashboard_funil SET (security_invoker = true);

-- Grant permissions
GRANT SELECT ON view_cards_acoes TO authenticated;
GRANT SELECT ON view_dashboard_funil TO authenticated;

-- ============================================================================
-- PHASE 5: Configure existing stages (initial data)
-- ============================================================================

-- Mark existing "Perdido" stages as is_lost=true
UPDATE pipeline_stages
SET is_lost = true
WHERE (nome ILIKE '%perdido%' OR nome ILIKE '%lost%')
  AND (is_lost IS NULL OR is_lost = false);

-- Mark existing "Viagem Confirmada" or similar stages as is_won=true
UPDATE pipeline_stages
SET is_won = true
WHERE (nome ILIKE '%viagem confirmada%' OR nome ILIKE '%ganho%' OR nome ILIKE '%won%' OR nome ILIKE '%concluída%' OR nome ILIKE '%concluida%')
  AND (is_won IS NULL OR is_won = false);

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run manually to verify)
-- ============================================================================
--
-- Check new columns in pipeline_stages:
-- SELECT id, nome, fase, is_won, is_lost, is_sdr_won, is_planner_won, is_pos_won
-- FROM pipeline_stages ORDER BY ordem;
--
-- Check new columns in cards:
-- SELECT id, titulo, status_comercial, ganho_sdr, ganho_planner, ganho_pos
-- FROM cards LIMIT 10;
--
-- Check view includes new columns:
-- SELECT id, titulo, ganho_sdr, ganho_planner, ganho_pos
-- FROM view_cards_acoes LIMIT 5;
