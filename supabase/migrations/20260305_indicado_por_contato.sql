-- Adiciona referência ao contato que indicou o card
-- Permite linkar "Quem indicou?" a um contato real do CRM

ALTER TABLE cards
ADD COLUMN IF NOT EXISTS indicado_por_id UUID REFERENCES contatos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cards_indicado_por_id ON cards(indicado_por_id) WHERE indicado_por_id IS NOT NULL;

COMMENT ON COLUMN cards.indicado_por_id IS 'FK para contato que indicou este lead. Usado quando origem=indicacao.';
