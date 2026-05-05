-- =====================================================================
-- 20260505d: remover o valor 'planner_request' da coluna
-- atendimentos_concierge.source.
--
-- Motivo: "Planner pediu" e "Manual" significavam a mesma coisa pro
-- operador (criação humana). Dois caminhos no UI classificavam diferente
-- (card → 'manual', /tasks → 'planner_request'). Unificamos pra 'manual'.
--
-- Distribuição em produção quando esta migration foi escrita:
--   cadencia=11, manual=10, cliente=4, planner_request=0
-- O UPDATE é defensivo — não muda nada em prod.
-- =====================================================================

BEGIN;

-- 1. Backfill defensivo: qualquer linha com source='planner_request' vira 'manual'
UPDATE atendimentos_concierge
SET source = 'manual'
WHERE source = 'planner_request';

-- 2. Trocar a constraint antiga (4 valores) pela nova (3 valores)
ALTER TABLE atendimentos_concierge
  DROP CONSTRAINT IF EXISTS atendimentos_concierge_source_check;

ALTER TABLE atendimentos_concierge
  ADD CONSTRAINT atendimentos_concierge_source_check
  CHECK (source IN ('cadencia', 'manual', 'cliente'));

COMMIT;
