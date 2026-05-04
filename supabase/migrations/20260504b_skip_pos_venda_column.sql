-- ============================================================================
-- MIGRATION: Coluna skip_pos_venda — marcação permanente de Ganho sem Pós-Venda
-- Date: 2026-05-04
--
-- Card com skip_pos_venda=true:
--   - Está na fase pos_venda (movido pra etapa correta pela data da viagem)
--   - status_comercial='ganho' (já fechou — vai pro relatório de vendas)
--   - SEM pos_owner_id (ninguém da operação cuida)
--   - Cadências/automações de pós-venda NÃO disparam pra ele
--   - Cron de roteamento (fn_roteamento_pos_venda_trips) continua movendo
--     entre etapas conforme datas — para ficarmos sabendo onde a viagem está
--
-- Reversível via RPC ativar_pos_venda(card_id, pos_owner_id).
-- ============================================================================

BEGIN;

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS skip_pos_venda BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.cards.skip_pos_venda IS
  'Marca cards de Ganho sem Pós-Venda. Card está em fase pos_venda mas SEM acompanhamento humano e sem cadências/automações disparando. Reversível via ativar_pos_venda.';

-- Index parcial (true é minoria) para filtros analytics e listagens
CREATE INDEX IF NOT EXISTS idx_cards_skip_pos_venda
  ON public.cards (skip_pos_venda)
  WHERE skip_pos_venda = true;

COMMIT;
