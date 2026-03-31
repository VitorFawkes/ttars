-- ============================================================
-- MIGRATION: WhatsApp Multi-Contact & Governance
-- Date: 2026-01-20
-- ============================================================

-- 1. CONTATO_MEIOS - Multi-telefone/email sistêmico
-- ============================================================
CREATE TABLE IF NOT EXISTS contato_meios (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contato_id uuid NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
    
    tipo text NOT NULL,              -- 'telefone', 'email', 'whatsapp'
    valor text NOT NULL,             -- o número/email
    valor_normalizado text,          -- versão normalizada para busca
    
    is_principal boolean DEFAULT false,
    verificado boolean DEFAULT false,
    verificado_em timestamptz,
    origem text,                     -- 'manual', 'whatsapp', 'import', 'activecampaign'
    
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Unique constraint on normalized value per type
CREATE UNIQUE INDEX IF NOT EXISTS idx_contato_meios_unique 
ON contato_meios(tipo, valor_normalizado) WHERE valor_normalizado IS NOT NULL;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_contato_meios_contato ON contato_meios(contato_id);
CREATE INDEX IF NOT EXISTS idx_contato_meios_busca ON contato_meios(tipo, valor_normalizado);

-- Trigger to normalize values
CREATE OR REPLACE FUNCTION normalize_contato_meio()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipo IN ('telefone', 'whatsapp') THEN
        NEW.valor_normalizado := normalize_phone(NEW.valor);
    ELSIF NEW.tipo = 'email' THEN
        NEW.valor_normalizado := lower(trim(NEW.valor));
    ELSE
        NEW.valor_normalizado := NEW.valor;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_contato_meio ON contato_meios;
CREATE TRIGGER trg_normalize_contato_meio
BEFORE INSERT OR UPDATE ON contato_meios
FOR EACH ROW EXECUTE FUNCTION normalize_contato_meio();

-- RLS
ALTER TABLE contato_meios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contato_meios_select" ON contato_meios
    FOR SELECT USING (true);

CREATE POLICY "contato_meios_insert" ON contato_meios
    FOR INSERT WITH CHECK (true);

CREATE POLICY "contato_meios_update" ON contato_meios
    FOR UPDATE USING (true);

CREATE POLICY "contato_meios_delete" ON contato_meios
    FOR DELETE USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE contato_meios;

-- 2. MIGRATE EXISTING DATA
-- ============================================================
INSERT INTO contato_meios (contato_id, tipo, valor, is_principal, origem)
SELECT id, 'telefone', telefone, true, 'migration'
FROM contatos
WHERE telefone IS NOT NULL AND telefone != ''
ON CONFLICT DO NOTHING;

INSERT INTO contato_meios (contato_id, tipo, valor, is_principal, origem)
SELECT id, 'email', email, true, 'migration'
FROM contatos
WHERE email IS NOT NULL AND email != ''
ON CONFLICT DO NOTHING;

-- 3. WHATSAPP_LINHA_CONFIG - Config por linha WhatsApp
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_linha_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id uuid REFERENCES whatsapp_platforms(id),
    phone_number_label text NOT NULL UNIQUE,  -- "Welcome Trips"
    phone_number_id text,                     -- ID Ecko
    
    -- Configuração
    ativo boolean DEFAULT false,              -- Se false, IGNORA mensagens dessa linha
    produto text,                             -- TRIPS, WEDDING, CORP, MARKETING
    pipeline_id uuid REFERENCES pipelines(id),
    stage_id uuid REFERENCES pipeline_stages(id),
    
    -- Audit
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE whatsapp_linha_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_linha_config_select" ON whatsapp_linha_config
    FOR SELECT USING (true);

CREATE POLICY "whatsapp_linha_config_all" ON whatsapp_linha_config
    FOR ALL USING (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_linha_config;

-- 4. ADD COLUMNS TO whatsapp_messages
-- ============================================================
ALTER TABLE whatsapp_messages
ADD COLUMN IF NOT EXISTS card_id uuid REFERENCES cards(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sent_by_user_id uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS sent_by_user_name text,
ADD COLUMN IF NOT EXISTS sent_by_user_role text,
ADD COLUMN IF NOT EXISTS ecko_agent_id text;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_card_id ON whatsapp_messages(card_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_sent_by ON whatsapp_messages(sent_by_user_id);

-- 5. ADD DESCRIPTION TO whatsapp_field_mappings
-- ============================================================
ALTER TABLE whatsapp_field_mappings
ADD COLUMN IF NOT EXISTS description text;

-- 6. WHATSAPP TOGGLES IN integration_settings
-- ============================================================
INSERT INTO integration_settings (key, value, description) VALUES
('WHATSAPP_PROCESS_ENABLED', 'false', 'Processa webhooks WhatsApp automaticamente'),
('WHATSAPP_CREATE_CONTACT', 'false', 'Cria contato para números novos'),
('WHATSAPP_CREATE_CARD', 'false', 'Cria card para contatos sem viagem ativa'),
('WHATSAPP_LINK_TO_CARD', 'true', 'Vincula mensagem ao card ativo'),
('WHATSAPP_UPDATE_CONTACT', 'false', 'Atualiza nome/dados do contato')
ON CONFLICT (key) DO NOTHING;

-- 7. COMMENTS FOR DOCUMENTATION
-- ============================================================
COMMENT ON TABLE contato_meios IS 'Múltiplos meios de contato (telefones, emails) por contato';
COMMENT ON TABLE whatsapp_linha_config IS 'Configuração por linha de WhatsApp (ativo, produto, pipeline)';
COMMENT ON COLUMN whatsapp_messages.card_id IS 'Viagem/Deal associada a esta mensagem';
COMMENT ON COLUMN whatsapp_messages.sent_by_user_id IS 'Agente Welcome que enviou (para outbound)';
COMMENT ON COLUMN whatsapp_messages.ecko_agent_id IS 'ID do agente no Ecko para mapeamento';
