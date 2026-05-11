-- Migration: financial_item_passengers
-- Tabela para rastrear passageiros por produto financeiro (Monde CSV import)
-- Cada passageiro tem status (pendente/concluido) e campo de observação

CREATE TABLE IF NOT EXISTS financial_item_passengers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  financial_item_id UUID NOT NULL REFERENCES card_financial_items(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'concluido')),
  observacao TEXT,
  concluido_em TIMESTAMPTZ,
  concluido_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  ordem INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_fip_financial_item ON financial_item_passengers(financial_item_id);
CREATE INDEX IF NOT EXISTS idx_fip_card ON financial_item_passengers(card_id);

ALTER TABLE financial_item_passengers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fip_select" ON financial_item_passengers FOR SELECT USING (true);
CREATE POLICY "fip_insert" ON financial_item_passengers FOR INSERT WITH CHECK (true);
CREATE POLICY "fip_update" ON financial_item_passengers FOR UPDATE USING (true);
CREATE POLICY "fip_delete" ON financial_item_passengers FOR DELETE USING (true);
