-- Tabela para vincular proposal_items a tokens/IDs Iterpec.
-- Em v1: apenas armazena token e critérios de busca (status = 'quoted').
-- Em v2: booking_id preenchido após DoBooking, status atualizado.

CREATE TABLE IF NOT EXISTS iterpec_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
    proposal_item_id UUID,  -- FK para proposal_items (adicionada separadamente se tabela existir)
    card_id UUID REFERENCES cards(id) ON DELETE SET NULL,
    service_type TEXT NOT NULL CHECK (service_type IN ('hotel', 'transfer', 'tour', 'car')),
    iterpec_token TEXT NOT NULL,
    booking_id TEXT,  -- NULL em v1, preenchido em v2 após DoBooking
    search_criteria JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'quoted' CHECK (status IN ('quoted', 'booked', 'confirmed', 'cancelled', 'rejected')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- FK condicional (proposal_items pode não existir em todos ambientes)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'proposal_items') THEN
        ALTER TABLE iterpec_bookings
            ADD CONSTRAINT fk_iterpec_bookings_proposal_item
            FOREIGN KEY (proposal_item_id) REFERENCES proposal_items(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_iterpec_bookings_org ON iterpec_bookings(org_id);
CREATE INDEX IF NOT EXISTS idx_iterpec_bookings_item ON iterpec_bookings(proposal_item_id);
CREATE INDEX IF NOT EXISTS idx_iterpec_bookings_card ON iterpec_bookings(card_id);
CREATE INDEX IF NOT EXISTS idx_iterpec_bookings_status ON iterpec_bookings(status);

ALTER TABLE iterpec_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "iterpec_bookings_org_isolation"
    ON iterpec_bookings
    FOR ALL
    USING (org_id = requesting_org_id())
    WITH CHECK (org_id = requesting_org_id());

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_iterpec_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_iterpec_bookings_updated_at
    BEFORE UPDATE ON iterpec_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_iterpec_bookings_updated_at();
