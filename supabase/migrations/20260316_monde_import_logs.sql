-- ============================================================
-- Monde Import Logs: histórico de importações CSV
-- ============================================================

-- 1. Tabela principal: cada upload de CSV gera um registro
CREATE TABLE IF NOT EXISTS monde_import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  matched_cards INTEGER NOT NULL DEFAULT 0,
  unmatched_vendas INTEGER NOT NULL DEFAULT 0,
  products_imported INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial', 'failed')),
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monde_logs_created ON monde_import_logs(created_at DESC);

-- 2. Itens: cada card afetado por uma importação
CREATE TABLE IF NOT EXISTS monde_import_log_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_log_id UUID NOT NULL REFERENCES monde_import_logs(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  card_title TEXT NOT NULL,
  venda_num TEXT NOT NULL,
  products_count INTEGER NOT NULL DEFAULT 0,
  total_venda NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_receita NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monde_log_items_log ON monde_import_log_items(import_log_id);
CREATE INDEX IF NOT EXISTS idx_monde_log_items_card ON monde_import_log_items(card_id);

-- 3. RLS
ALTER TABLE monde_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE monde_import_log_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_monde_logs" ON monde_import_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_monde_logs" ON monde_import_logs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_read_monde_log_items" ON monde_import_log_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_monde_log_items" ON monde_import_log_items
  FOR INSERT TO authenticated WITH CHECK (true);
