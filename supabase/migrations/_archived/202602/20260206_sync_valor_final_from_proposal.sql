-- ============================================================================
-- MIGRATION: Sync Valor Final from Proposal + Manual Financial Items
-- Description:
--   1. Creates card_financial_items table for manual per-product financials
--   2. Updates trigger to also sync valor_final on proposal acceptance
--   3. Updates RPC recalcular_receita_card to also set valor_final
--   4. Creates RPC recalcular_financeiro_manual for cards without proposals
--   5. Updates views with valor_final + valor_display (COALESCE)
--   6. Backfills valor_final for existing accepted proposals
-- Date: 2026-02-06
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CREATE card_financial_items TABLE (for cards without accepted proposals)
-- ============================================================================

CREATE TABLE IF NOT EXISTS card_financial_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  product_type TEXT NOT NULL DEFAULT 'custom',
  description TEXT,
  sale_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  supplier_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Constraint for valid product types
DO $$ BEGIN
  ALTER TABLE card_financial_items
    ADD CONSTRAINT chk_product_type
    CHECK (product_type IN ('hotel', 'aereo', 'transfer', 'experiencia', 'seguro', 'custom'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_card_financial_items_card
  ON card_financial_items(card_id);

COMMENT ON TABLE card_financial_items IS 'Itens financeiros manuais para cards sem proposta aceita. Cada item tem valor de venda e custo do fornecedor.';
COMMENT ON COLUMN card_financial_items.product_type IS 'Tipo do produto: hotel, aereo, transfer, experiencia, seguro, custom';
COMMENT ON COLUMN card_financial_items.description IS 'Descricao opcional do item (ex: Resort Maldivas 7 noites)';
COMMENT ON COLUMN card_financial_items.sale_value IS 'Valor de venda ao cliente';
COMMENT ON COLUMN card_financial_items.supplier_cost IS 'Custo do fornecedor';

-- ============================================================================
-- 2. UPDATE TRIGGER: sync valor_final + receita on proposal acceptance
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_proposal_revenue_to_card()
RETURNS TRIGGER AS $$
DECLARE
  v_card_id UUID;
  v_version_id UUID;
  v_items_faturamento DECIMAL(12,2);
  v_items_custo DECIMAL(12,2);
  v_flights_faturamento DECIMAL(12,2);
  v_flights_custo DECIMAL(12,2);
  v_total_faturamento DECIMAL(12,2);
  v_total_receita DECIMAL(12,2);
BEGIN
  -- Only execute when status changes to 'accepted'
  IF NEW.status::text = 'accepted' AND (OLD.status IS NULL OR OLD.status::text != 'accepted') THEN
    v_card_id := NEW.card_id;
    v_version_id := COALESCE(NEW.accepted_version_id, NEW.active_version_id);

    -- Skip if no version found
    IF v_version_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Calculate totals from proposal_items (via sections of the accepted version)
    SELECT
      COALESCE(SUM(pi.base_price), 0),
      COALESCE(SUM(pi.supplier_cost), 0)
    INTO v_items_faturamento, v_items_custo
    FROM proposal_items pi
    JOIN proposal_sections ps ON pi.section_id = ps.id
    WHERE ps.version_id = v_version_id;

    -- Calculate totals from proposal_flights
    SELECT
      COALESCE(SUM(COALESCE(pf.price_total, 0)), 0),
      COALESCE(SUM(COALESCE(pf.supplier_cost, 0)), 0)
    INTO v_flights_faturamento, v_flights_custo
    FROM proposal_flights pf
    WHERE pf.proposal_id = NEW.id;

    -- Total faturamento and receita
    v_total_faturamento := v_items_faturamento + v_flights_faturamento;
    v_total_receita := v_total_faturamento - (v_items_custo + v_flights_custo);

    -- Update card: valor_final + receita
    -- Respect manual override for receita only
    UPDATE cards
    SET
      valor_final = v_total_faturamento,
      receita = CASE
        WHEN receita_source = 'manual' THEN receita  -- keep manual receita
        ELSE v_total_receita
      END,
      receita_source = CASE
        WHEN receita_source = 'manual' THEN 'manual'
        ELSE 'calculated'
      END,
      updated_at = NOW()
    WHERE id = v_card_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (idempotent)
DROP TRIGGER IF EXISTS trg_sync_proposal_revenue ON proposals;
CREATE TRIGGER trg_sync_proposal_revenue
  AFTER UPDATE ON proposals
  FOR EACH ROW
  EXECUTE FUNCTION sync_proposal_revenue_to_card();

-- ============================================================================
-- 3. UPDATE RPC: recalcular_receita_card (now also sets valor_final)
-- ============================================================================

CREATE OR REPLACE FUNCTION recalcular_receita_card(p_card_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_proposal RECORD;
  v_version_id UUID;
  v_items_faturamento DECIMAL(12,2) := 0;
  v_items_custo DECIMAL(12,2) := 0;
  v_flights_faturamento DECIMAL(12,2) := 0;
  v_flights_custo DECIMAL(12,2) := 0;
  v_total_faturamento DECIMAL(12,2);
  v_total_custo DECIMAL(12,2);
  v_receita DECIMAL(12,2);
  v_margem DECIMAL(5,2);
BEGIN
  -- Find accepted proposal for this card
  SELECT id, COALESCE(accepted_version_id, active_version_id) AS version_id
  INTO v_proposal
  FROM proposals
  WHERE card_id = p_card_id
    AND status::text = 'accepted'
  ORDER BY accepted_at DESC NULLS LAST
  LIMIT 1;

  IF v_proposal IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Nenhuma proposta aceita encontrada para este card'
    );
  END IF;

  v_version_id := v_proposal.version_id;

  -- Calculate items
  SELECT
    COALESCE(SUM(pi.base_price), 0),
    COALESCE(SUM(pi.supplier_cost), 0)
  INTO v_items_faturamento, v_items_custo
  FROM proposal_items pi
  JOIN proposal_sections ps ON pi.section_id = ps.id
  WHERE ps.version_id = v_version_id;

  -- Calculate flights
  SELECT
    COALESCE(SUM(COALESCE(pf.price_total, 0)), 0),
    COALESCE(SUM(COALESCE(pf.supplier_cost, 0)), 0)
  INTO v_flights_faturamento, v_flights_custo
  FROM proposal_flights pf
  WHERE pf.proposal_id = v_proposal.id;

  -- Totals
  v_total_faturamento := v_items_faturamento + v_flights_faturamento;
  v_total_custo := v_items_custo + v_flights_custo;
  v_receita := v_total_faturamento - v_total_custo;
  v_margem := CASE
    WHEN v_total_faturamento > 0 THEN ROUND((v_receita / v_total_faturamento) * 100, 2)
    ELSE 0
  END;

  -- Update card: valor_final + receita
  UPDATE cards
  SET
    valor_final = v_total_faturamento,
    receita = v_receita,
    receita_source = 'calculated',
    updated_at = NOW()
  WHERE id = p_card_id;

  RETURN jsonb_build_object(
    'success', true,
    'valor_final', v_total_faturamento,
    'faturamento', v_total_faturamento,
    'custo', v_total_custo,
    'receita', v_receita,
    'margem_percent', v_margem
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. NEW RPC: recalcular_financeiro_manual (for cards without proposals)
-- ============================================================================

CREATE OR REPLACE FUNCTION recalcular_financeiro_manual(p_card_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_total_venda DECIMAL(12,2) := 0;
  v_total_custo DECIMAL(12,2) := 0;
  v_receita DECIMAL(12,2);
  v_margem DECIMAL(5,2);
  v_item_count INTEGER := 0;
BEGIN
  -- Sum from card_financial_items
  SELECT
    COALESCE(SUM(sale_value), 0),
    COALESCE(SUM(supplier_cost), 0),
    COUNT(*)
  INTO v_total_venda, v_total_custo, v_item_count
  FROM card_financial_items
  WHERE card_id = p_card_id;

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Nenhum item financeiro encontrado para este card'
    );
  END IF;

  v_receita := v_total_venda - v_total_custo;
  v_margem := CASE
    WHEN v_total_venda > 0 THEN ROUND((v_receita / v_total_venda) * 100, 2)
    ELSE 0
  END;

  -- Update card
  UPDATE cards
  SET
    valor_final = v_total_venda,
    receita = v_receita,
    receita_source = 'calculated',
    updated_at = NOW()
  WHERE id = p_card_id;

  RETURN jsonb_build_object(
    'success', true,
    'valor_final', v_total_venda,
    'custo', v_total_custo,
    'receita', v_receita,
    'margem_percent', v_margem,
    'item_count', v_item_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. UPDATE VIEWS (DROP CASCADE + RECREATE)
-- ============================================================================

DROP VIEW IF EXISTS view_dashboard_funil CASCADE;
DROP VIEW IF EXISTS view_cards_acoes CASCADE;
DROP VIEW IF EXISTS view_archived_cards CASCADE;

-- 5a. Recreate view_cards_acoes with valor_final + valor_display
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

-- 5b. Recreate view_dashboard_funil with valor_display
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

-- 5c. Recreate view_archived_cards with valor_final + valor_display
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
-- 6. BACKFILL: Set valor_final for cards with existing accepted proposals
-- ============================================================================

-- For each card with an accepted proposal, calculate and set valor_final
DO $$
DECLARE
  r RECORD;
  v_version_id UUID;
  v_items_total DECIMAL(12,2);
  v_flights_total DECIMAL(12,2);
  v_faturamento DECIMAL(12,2);
BEGIN
  FOR r IN
    SELECT p.id AS proposal_id, p.card_id,
           COALESCE(p.accepted_version_id, p.active_version_id) AS version_id
    FROM proposals p
    JOIN cards c ON p.card_id = c.id
    WHERE p.status::text = 'accepted'
      AND c.valor_final IS NULL
      AND c.deleted_at IS NULL
  LOOP
    IF r.version_id IS NULL THEN
      CONTINUE;
    END IF;

    -- Items total
    SELECT COALESCE(SUM(pi.base_price), 0)
    INTO v_items_total
    FROM proposal_items pi
    JOIN proposal_sections ps ON pi.section_id = ps.id
    WHERE ps.version_id = r.version_id;

    -- Flights total
    SELECT COALESCE(SUM(COALESCE(pf.price_total, 0)), 0)
    INTO v_flights_total
    FROM proposal_flights pf
    WHERE pf.proposal_id = r.proposal_id;

    v_faturamento := v_items_total + v_flights_total;

    -- Only set if there's a meaningful value
    IF v_faturamento > 0 THEN
      UPDATE cards
      SET valor_final = v_faturamento,
          updated_at = NOW()
      WHERE id = r.card_id;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- 7. RLS POLICIES FOR card_financial_items
-- ============================================================================

ALTER TABLE card_financial_items ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read financial items
CREATE POLICY "card_financial_items_select"
  ON card_financial_items FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert financial items
CREATE POLICY "card_financial_items_insert"
  ON card_financial_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update financial items
CREATE POLICY "card_financial_items_update"
  ON card_financial_items FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete financial items
CREATE POLICY "card_financial_items_delete"
  ON card_financial_items FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================================
-- 8. UPDATE STATISTICS
-- ============================================================================

ANALYZE card_financial_items;
ANALYZE cards;

COMMIT;
