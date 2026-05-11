-- ============================================================================
-- MIGRATION: Backfill — reverter ganho_pos=true em cards pré-viagem do Pós-venda
-- Date: 2026-04-27
--
-- O Import Pós-venda (bulk_create_pos_venda_cards) e fluxos antigos do Planner
-- marcaram cards como ganho_pos=true ao chegarem no Pós-venda, sem considerar
-- se a viagem já aconteceu. Combinado com o filtro padrão do Kanban (mostra
-- apenas status='aberto'), isso ESCONDIA os cards do time de Pós-venda.
--
-- Regra atual (definida 2026-04-27): ganho_pos só após viagem realizada + NPS.
--
-- Esta migration corrige cards na fase Pós-venda Welcome Trips, em etapas
-- ANTERIORES à viagem (1 a 4), com viagem ainda futura. Mantém status='ganho'
-- (a venda foi fechada — é ganho do Planner) e migra a marca de ganho_pos
-- para ganho_planner.
--
-- Esperado: ~181 cards atualizados.
-- ============================================================================

BEGIN;

UPDATE cards
SET
    ganho_pos = false,
    ganho_pos_at = NULL,
    ganho_planner = true,
    ganho_planner_at = COALESCE(ganho_planner_at, ganho_pos_at, data_fechamento, created_at),
    updated_at = NOW()
WHERE deleted_at IS NULL
  AND pipeline_stage_id IN (
      'b2b0679c-ea06-4b46-9dd4-ee02abff1a36',  -- App & Conteúdo em Montagem
      '1f684773-f8f3-434a-a44d-4994750c41aa',  -- Pré-embarque > 30 dias
      '3ce80249-b579-4a9c-9b82-f8569735cea9',  -- Pré-Embarque <<< 30 dias
      '0ebab355-6d0e-4b19-af13-b4b31268275f'   -- Em Viagem
  )
  AND status_comercial = 'ganho'
  AND data_viagem_inicio > CURRENT_DATE;

COMMIT;
