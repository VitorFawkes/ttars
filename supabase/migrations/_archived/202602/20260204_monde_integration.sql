-- ============================================
-- MIGRATION: Monde Integration
-- Data: 2026-02-04
-- Descrição: Criar estrutura para integração com ERP Monde
-- ============================================

-- 1. Adicionar campo supplier em proposal_items
ALTER TABLE proposal_items ADD COLUMN IF NOT EXISTS supplier TEXT;

CREATE INDEX IF NOT EXISTS idx_proposal_items_supplier
    ON proposal_items(supplier) WHERE supplier IS NOT NULL;

-- Migrar dados existentes do rich_content
UPDATE proposal_items
SET supplier = rich_content->>'supplier'
WHERE supplier IS NULL
AND rich_content->>'supplier' IS NOT NULL;

-- 2. Tabela monde_sales (cabeçalho da venda)
CREATE TABLE IF NOT EXISTS monde_sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relacionamentos
    card_id UUID NOT NULL REFERENCES cards(id) ON DELETE RESTRICT,
    proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,

    -- Identificadores Monde
    monde_sale_id TEXT,              -- ID retornado pelo Monde
    monde_sale_number TEXT,          -- Número da venda no Monde
    idempotency_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),

    -- Datas
    sale_date DATE NOT NULL,         -- Data para comissão
    travel_start_date DATE,
    travel_end_date DATE,

    -- Valores
    total_value DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'BRL',

    -- Controle de envio
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_retry_at TIMESTAMPTZ,

    -- Logs
    attempts_log JSONB DEFAULT '[]'::jsonb,
    monde_response JSONB,
    error_message TEXT,

    -- Metadata
    created_by UUID NOT NULL REFERENCES profiles(id),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comentários
COMMENT ON TABLE monde_sales IS 'Vendas enviadas para o ERP Monde';
COMMENT ON COLUMN monde_sales.sale_date IS 'Data de fechamento da venda (para controle de comissão)';
COMMENT ON COLUMN monde_sales.idempotency_key IS 'Chave de idempotência para API Monde (evita duplicatas)';

-- 3. Tabela monde_sale_items (items da venda)
CREATE TABLE IF NOT EXISTS monde_sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relacionamentos
    sale_id UUID NOT NULL REFERENCES monde_sales(id) ON DELETE CASCADE,
    proposal_item_id UUID REFERENCES proposal_items(id) ON DELETE SET NULL,
    proposal_flight_id UUID REFERENCES proposal_flights(id) ON DELETE SET NULL,

    -- Snapshot do item (para histórico)
    item_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    supplier TEXT,

    -- Valores
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    quantity INTEGER NOT NULL DEFAULT 1,
    total_price DECIMAL(12,2) NOT NULL DEFAULT 0,

    -- Datas do serviço
    service_date_start DATE,
    service_date_end DATE,

    -- Metadata adicional (hotel, voo, etc)
    item_metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT monde_sale_items_positive_price CHECK (unit_price >= 0),
    CONSTRAINT monde_sale_items_positive_qty CHECK (quantity > 0)
);

COMMENT ON TABLE monde_sale_items IS 'Items incluídos em cada venda Monde';

-- 4. Índices para performance
CREATE INDEX IF NOT EXISTS idx_monde_sales_card_id ON monde_sales(card_id);
CREATE INDEX IF NOT EXISTS idx_monde_sales_status ON monde_sales(status);
CREATE INDEX IF NOT EXISTS idx_monde_sales_sale_date ON monde_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_monde_sales_created_by ON monde_sales(created_by);
CREATE INDEX IF NOT EXISTS idx_monde_sales_monde_sale_id ON monde_sales(monde_sale_id)
    WHERE monde_sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_monde_sales_pending_retry ON monde_sales(next_retry_at)
    WHERE status IN ('pending', 'failed') AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_monde_sale_items_sale_id ON monde_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_monde_sale_items_proposal_item ON monde_sale_items(proposal_item_id)
    WHERE proposal_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_monde_sale_items_proposal_flight ON monde_sale_items(proposal_flight_id)
    WHERE proposal_flight_id IS NOT NULL;

-- Impedir duplicatas de item na mesma venda
CREATE UNIQUE INDEX IF NOT EXISTS idx_monde_sale_items_unique_proposal_item
    ON monde_sale_items(sale_id, proposal_item_id)
    WHERE proposal_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_monde_sale_items_unique_proposal_flight
    ON monde_sale_items(sale_id, proposal_flight_id)
    WHERE proposal_flight_id IS NOT NULL;

-- 5. RLS (Row Level Security)
ALTER TABLE monde_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE monde_sale_items ENABLE ROW LEVEL SECURITY;

-- Políticas monde_sales
DROP POLICY IF EXISTS "Users can view monde_sales" ON monde_sales;
CREATE POLICY "Users can view monde_sales" ON monde_sales
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM cards c
            WHERE c.id = monde_sales.card_id
            AND (
                c.dono_atual_id = auth.uid()
                OR c.created_by = auth.uid()
                OR c.sdr_owner_id = auth.uid()
                OR c.vendas_owner_id = auth.uid()
                OR c.pos_owner_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can insert monde_sales" ON monde_sales;
CREATE POLICY "Users can insert monde_sales" ON monde_sales
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Users can update monde_sales" ON monde_sales;
CREATE POLICY "Users can update monde_sales" ON monde_sales
    FOR UPDATE TO authenticated
    USING (created_by = auth.uid());

-- Políticas monde_sale_items
DROP POLICY IF EXISTS "Users can view monde_sale_items" ON monde_sale_items;
CREATE POLICY "Users can view monde_sale_items" ON monde_sale_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM monde_sales ms
            WHERE ms.id = monde_sale_items.sale_id
        )
    );

DROP POLICY IF EXISTS "Users can insert monde_sale_items" ON monde_sale_items;
CREATE POLICY "Users can insert monde_sale_items" ON monde_sale_items
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM monde_sales ms
            WHERE ms.id = sale_id
            AND ms.created_by = auth.uid()
        )
    );

-- 6. Trigger updated_at
CREATE OR REPLACE FUNCTION update_monde_sales_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monde_sales_updated_at ON monde_sales;
CREATE TRIGGER trg_monde_sales_updated_at
    BEFORE UPDATE ON monde_sales
    FOR EACH ROW
    EXECUTE FUNCTION update_monde_sales_updated_at();

-- 7. Trigger para calcular total_value automaticamente
CREATE OR REPLACE FUNCTION update_monde_sale_total()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE monde_sales
    SET total_value = (
        SELECT COALESCE(SUM(total_price), 0)
        FROM monde_sale_items
        WHERE sale_id = COALESCE(NEW.sale_id, OLD.sale_id)
    )
    WHERE id = COALESCE(NEW.sale_id, OLD.sale_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_monde_sale_items_total ON monde_sale_items;
CREATE TRIGGER trg_monde_sale_items_total
    AFTER INSERT OR UPDATE OR DELETE ON monde_sale_items
    FOR EACH ROW
    EXECUTE FUNCTION update_monde_sale_total();

-- 8. Funções úteis
CREATE OR REPLACE FUNCTION is_proposal_item_sold(p_item_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM monde_sale_items msi
        JOIN monde_sales ms ON ms.id = msi.sale_id
        WHERE msi.proposal_item_id = p_item_id
        AND ms.status = 'sent'
    );
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION is_proposal_flight_sold(p_flight_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM monde_sale_items msi
        JOIN monde_sales ms ON ms.id = msi.sale_id
        WHERE msi.proposal_flight_id = p_flight_id
        AND ms.status = 'sent'
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- Função para buscar vendas de um card com items
CREATE OR REPLACE FUNCTION get_monde_sales_by_card(p_card_id UUID)
RETURNS TABLE (
    sale_id UUID,
    sale_date DATE,
    total_value DECIMAL(12,2),
    status TEXT,
    monde_sale_id TEXT,
    items_count BIGINT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ms.id as sale_id,
        ms.sale_date,
        ms.total_value,
        ms.status,
        ms.monde_sale_id,
        COUNT(msi.id) as items_count,
        ms.created_at
    FROM monde_sales ms
    LEFT JOIN monde_sale_items msi ON ms.id = msi.sale_id
    WHERE ms.card_id = p_card_id
    GROUP BY ms.id
    ORDER BY ms.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- 9. View para items já vendidos (útil para UI)
CREATE OR REPLACE VIEW v_monde_sent_items AS
SELECT
    msi.proposal_item_id,
    msi.proposal_flight_id,
    ms.card_id,
    ms.id as sale_id,
    ms.monde_sale_id,
    ms.monde_sale_number,
    ms.sale_date,
    ms.status,
    msi.title,
    msi.supplier,
    msi.total_price
FROM monde_sale_items msi
JOIN monde_sales ms ON ms.id = msi.sale_id
WHERE ms.status = 'sent';

-- 10. Settings iniciais para Monde
INSERT INTO integration_settings (key, value, description) VALUES
    ('MONDE_API_URL', 'https://web.monde.com.br/api/v3', 'Monde API Base URL'),
    ('MONDE_SHADOW_MODE', 'true', 'Se true, não envia realmente para Monde (modo teste)'),
    ('MONDE_CNPJ', '', 'CNPJ da agência (14 dígitos) - CONFIGURAR'),
    ('MONDE_ENVIRONMENT', 'staging', 'Ambiente: staging ou production')
ON CONFLICT (key) DO NOTHING;
