-- Adicionar campos extras em card_financial_items
-- Fornecedor, Representante, Documento, Datas, Observacoes
ALTER TABLE card_financial_items
  ADD COLUMN IF NOT EXISTS fornecedor TEXT,
  ADD COLUMN IF NOT EXISTS representante TEXT,
  ADD COLUMN IF NOT EXISTS documento TEXT,
  ADD COLUMN IF NOT EXISTS data_inicio DATE,
  ADD COLUMN IF NOT EXISTS data_fim DATE,
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

COMMENT ON COLUMN card_financial_items.fornecedor IS 'Nome do fornecedor (hotel, cia aerea, etc)';
COMMENT ON COLUMN card_financial_items.representante IS 'Representante/intermediario (por onde compramos)';
COMMENT ON COLUMN card_financial_items.documento IS 'Numero de confirmacao/documento';
COMMENT ON COLUMN card_financial_items.data_inicio IS 'Data inicio de uso do produto';
COMMENT ON COLUMN card_financial_items.data_fim IS 'Data fim de uso do produto';
COMMENT ON COLUMN card_financial_items.observacoes IS 'Observacoes do planner sobre o produto';
