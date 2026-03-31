-- ============================================================================
-- MIGRATION: Tabelas de log para importação Pós-Venda Monde
-- Date: 2026-03-31
--
-- Registra histórico de cada importação CSV de pós-venda,
-- com detalhes por viagem/card criado ou atualizado.
-- ============================================================================

-- Log principal (1 por upload de CSV)
CREATE TABLE IF NOT EXISTS pos_venda_import_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    trips_found INTEGER NOT NULL DEFAULT 0,
    cards_created INTEGER NOT NULL DEFAULT 0,
    cards_updated INTEGER NOT NULL DEFAULT 0,
    contacts_created INTEGER NOT NULL DEFAULT 0,
    duplicates_skipped INTEGER NOT NULL DEFAULT 0,
    products_imported INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial', 'failed')),
    error_message TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Detalhe por viagem/card (N por upload)
CREATE TABLE IF NOT EXISTS pos_venda_import_log_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_log_id UUID NOT NULL REFERENCES pos_venda_import_logs(id) ON DELETE CASCADE,
    card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'skipped', 'error')),
    card_title TEXT,
    pagante TEXT,
    cpf TEXT,
    venda_nums TEXT[],
    data_inicio DATE,
    data_fim DATE,
    products_count INTEGER NOT NULL DEFAULT 0,
    total_venda NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_receita NUMERIC(12,2) NOT NULL DEFAULT 0,
    stage_name TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pv_import_logs_created ON pos_venda_import_logs(created_at DESC);
CREATE INDEX idx_pv_import_log_items_log ON pos_venda_import_log_items(import_log_id);

-- RLS permissiva (mesma política das monde_import_logs)
ALTER TABLE pos_venda_import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_venda_import_log_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pos_venda_import_logs_all" ON pos_venda_import_logs
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "pos_venda_import_log_items_all" ON pos_venda_import_log_items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
