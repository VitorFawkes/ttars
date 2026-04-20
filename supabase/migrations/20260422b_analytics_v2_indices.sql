-- Analytics v2 — Fase 0 (Indices)
-- Plano: /Users/vitorgambetti/.claude/plans/falando-da-aba-de-glimmering-coral.md (Bloco 5)
--
-- Indices que suportam dashboards por persona e filtros universais do Analytics v2.
-- Dos 9 indices pedidos no plano, 2 ja existem com nomes equivalentes:
--   - idx_cards_stage_entered      -> ja existe como idx_cards_org_stage_entered
--   - (idx_tarefas_owner_status)   -> complementa idx_tarefas_responsavel_abertas (mais especifico)
-- Mantidos 7 indices novos.
--
-- Nota: todos criados sem CONCURRENTLY porque as tabelas sao pequenas (<10K em cards,
-- <20K em tarefas/activities). Se no futuro a base crescer, promover para CONCURRENTLY
-- em migration separada (fora de transaction).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Origem x etapa (filtro "origem" + breakdown por fase)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_cards_origem_stage
  ON public.cards (org_id, origem, pipeline_stage_id)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Handoffs SDR por owner (dashboard SDR: handoff rate, handoff speed)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_cards_sdr_ganho
  ON public.cards (org_id, sdr_owner_id, ganho_sdr_at)
  WHERE sdr_owner_id IS NOT NULL
    AND ganho_sdr = true
    AND deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Fechamentos Planner por vendedor (dashboards Vendas e Comercial)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_cards_vendas_ganho
  ON public.cards (org_id, vendas_owner_id, ganho_planner_at)
  WHERE vendas_owner_id IS NOT NULL
    AND ganho_planner = true
    AND deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Entregas concluidas por Pos (dashboard Pos-Venda)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_cards_pos_ganho
  ON public.cards (org_id, pos_owner_id, ganho_pos_at)
  WHERE pos_owner_id IS NOT NULL
    AND ganho_pos = true
    AND deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Filtro lead_entry_path (filtros universais)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_cards_entry_path
  ON public.cards (org_id, lead_entry_path, pipeline_stage_id)
  WHERE deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Tarefas abertas por responsavel com status+vencimento
-- (analytics_task_completion_by_person, dropped balls)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_tarefas_owner_status
  ON public.tarefas (org_id, responsavel_id, status, data_vencimento)
  WHERE status <> 'concluida'
    AND deleted_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- Atividades por card+tipo (timeline + fn_card_stage_history)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_activities_card_tipo
  ON public.activities (card_id, tipo, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- GIN destinos (filtro universal destino)
-- Complementa idx_cards_produto_data (GIN completo); este e mais enxuto
-- para queries especificas em produto_data->'destinos'.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_cards_destinos_gin
  ON public.cards USING GIN ((produto_data -> 'destinos'));

COMMIT;
