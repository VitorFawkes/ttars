-- Fix: adicionar 'monde_import' ao check constraint chk_receita_source
-- A RPC bulk_create_pos_venda_cards usa esse valor mas o constraint não permitia
ALTER TABLE cards DROP CONSTRAINT IF EXISTS chk_receita_source;
ALTER TABLE cards ADD CONSTRAINT chk_receita_source
  CHECK (receita_source IN ('calculated', 'manual', 'monde_import'));
