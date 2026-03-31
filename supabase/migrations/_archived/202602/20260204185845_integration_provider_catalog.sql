-- ============================================
-- MIGRATION: Integration Provider Catalog
-- Propósito: Tabela para listar providers de integração disponíveis
-- Data: 2026-02-04
-- ============================================

-- Criar tabela de catálogo de providers
CREATE TABLE IF NOT EXISTS integration_provider_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identificação
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,

    -- Visual
    icon_name TEXT,
    color TEXT,
    logo_url TEXT,

    -- Categorização
    category TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',

    -- Tipo de integração
    direction TEXT[] NOT NULL DEFAULT '{}',

    -- Configuração
    builder_type TEXT NOT NULL DEFAULT 'webhook',
    config_schema JSONB,
    required_credentials TEXT[] DEFAULT '{}',

    -- Documentação
    documentation_url TEXT,
    setup_guide TEXT,

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_premium BOOLEAN DEFAULT false,
    is_beta BOOLEAN DEFAULT false,

    -- Auditoria
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_provider_catalog_category ON integration_provider_catalog(category);
CREATE INDEX IF NOT EXISTS idx_provider_catalog_active ON integration_provider_catalog(is_active);
CREATE INDEX IF NOT EXISTS idx_provider_catalog_slug ON integration_provider_catalog(slug);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_provider_catalog_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_provider_catalog_updated_at ON integration_provider_catalog;
CREATE TRIGGER trigger_update_provider_catalog_updated_at
    BEFORE UPDATE ON integration_provider_catalog
    FOR EACH ROW
    EXECUTE FUNCTION update_provider_catalog_updated_at();

-- RLS Policies
ALTER TABLE integration_provider_catalog ENABLE ROW LEVEL SECURITY;

-- Todos podem ler o catálogo (é público)
CREATE POLICY "Anyone can read provider catalog"
    ON integration_provider_catalog FOR SELECT
    USING (true);

-- Apenas admins podem modificar (via service role)
CREATE POLICY "Service role can manage provider catalog"
    ON integration_provider_catalog FOR ALL
    USING (auth.role() = 'service_role');

-- ============================================
-- SEED: Providers Iniciais
-- ============================================

INSERT INTO integration_provider_catalog (slug, name, description, icon_name, color, category, direction, builder_type, required_credentials, is_active, is_beta) VALUES

-- CRMs (já implementados ou planejados)
('active_campaign', 'ActiveCampaign', 'Sincronização bidirecional de Deals e Contatos do seu CRM', 'Zap', '#356AE6', 'crm', ARRAY['inbound', 'outbound'], 'api_key', ARRAY['api_key', 'api_url'], true, false),
('hubspot', 'HubSpot', 'CRM e automação de marketing completo', 'Building2', '#FF7A59', 'crm', ARRAY['inbound', 'outbound'], 'oauth', ARRAY['client_id', 'client_secret'], false, true),
('rd_station', 'RD Station', 'Automação de marketing brasileira', 'Target', '#00A650', 'marketing', ARRAY['inbound'], 'api_key', ARRAY['api_key'], false, true),
('pipedrive', 'Pipedrive', 'CRM focado em vendas', 'TrendingUp', '#017737', 'crm', ARRAY['inbound', 'outbound'], 'api_key', ARRAY['api_key'], false, true),

-- ERPs (Monde em desenvolvimento)
('monde', 'Monde', 'ERP para gestão de vendas e comissões de agências', 'DollarSign', '#1A73E8', 'erp', ARRAY['outbound'], 'basic_auth', ARRAY['username', 'password', 'base_url'], true, false),
('protheus', 'Protheus/TOTVS', 'ERP corporativo brasileiro', 'Building', '#003366', 'erp', ARRAY['inbound', 'outbound'], 'api_key', ARRAY['api_key', 'api_url'], false, true),

-- Comunicação (WhatsApp já implementado)
('whatsapp', 'WhatsApp', 'Mensagens via ChatPro ou Echo', 'MessageSquare', '#25D366', 'communication', ARRAY['inbound', 'outbound'], 'webhook', ARRAY['platform_id'], true, false),
('telegram', 'Telegram', 'Bot para comunicação com clientes', 'Send', '#0088CC', 'communication', ARRAY['inbound', 'outbound'], 'api_key', ARRAY['bot_token'], false, true),
('email_smtp', 'Email (SMTP)', 'Envio de emails via SMTP customizado', 'Mail', '#EA4335', 'communication', ARRAY['outbound'], 'smtp', ARRAY['smtp_host', 'smtp_user', 'smtp_pass'], false, true),

-- Distribuição / GDS (para turismo)
('amadeus', 'Amadeus', 'Distribuição aérea global (GDS)', 'Plane', '#005EB8', 'distribution', ARRAY['inbound'], 'oauth', ARRAY['client_id', 'client_secret'], false, true),
('sabre', 'Sabre', 'Sistema de reservas aéreas', 'PlaneTakeoff', '#CC0000', 'distribution', ARRAY['inbound'], 'oauth', ARRAY['client_id', 'client_secret'], false, true),

-- Pagamentos
('stripe', 'Stripe', 'Processamento de pagamentos internacional', 'CreditCard', '#635BFF', 'finance', ARRAY['inbound'], 'api_key', ARRAY['secret_key', 'webhook_secret'], false, true),
('pagseguro', 'PagSeguro', 'Pagamentos brasileiros', 'Banknote', '#41B883', 'finance', ARRAY['inbound'], 'api_key', ARRAY['email', 'token'], false, true),

-- Automação / Developer
('webhook_inbound', 'Receber Dados (Webhook)', 'Crie uma URL única para receber dados de qualquer ferramenta externa', 'Webhook', '#64748B', 'developer', ARRAY['inbound'], 'webhook', ARRAY[]::TEXT[], true, false),
('webhook_outbound', 'Enviar Dados (Disparo)', 'Envie dados do CRM para outras ferramentas quando eventos acontecerem', 'Zap', '#64748B', 'developer', ARRAY['outbound'], 'webhook', ARRAY['target_url'], true, false),
('zapier', 'Zapier', 'Conecte com 5000+ apps via Zapier', 'Link', '#FF4A00', 'developer', ARRAY['inbound', 'outbound'], 'webhook', ARRAY[]::TEXT[], false, true),
('n8n', 'n8n', 'Automação de workflows open-source', 'GitBranch', '#EA4B71', 'developer', ARRAY['inbound', 'outbound'], 'webhook', ARRAY[]::TEXT[], false, true)

ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon_name = EXCLUDED.icon_name,
    color = EXCLUDED.color,
    category = EXCLUDED.category,
    direction = EXCLUDED.direction,
    builder_type = EXCLUDED.builder_type,
    required_credentials = EXCLUDED.required_credentials,
    is_active = EXCLUDED.is_active,
    is_beta = EXCLUDED.is_beta,
    updated_at = now();

-- ============================================
-- COMENTÁRIOS
-- ============================================

COMMENT ON TABLE integration_provider_catalog IS 'Catálogo de providers de integração disponíveis no sistema';
COMMENT ON COLUMN integration_provider_catalog.slug IS 'Identificador único do provider (ex: active_campaign, monde)';
COMMENT ON COLUMN integration_provider_catalog.category IS 'Categoria: crm, erp, communication, distribution, finance, marketing, developer';
COMMENT ON COLUMN integration_provider_catalog.direction IS 'Direção suportada: inbound (receber dados), outbound (enviar dados)';
COMMENT ON COLUMN integration_provider_catalog.builder_type IS 'Tipo de configuração: webhook, oauth, api_key, basic_auth, smtp, custom';
COMMENT ON COLUMN integration_provider_catalog.is_active IS 'Se o provider está disponível para uso';
COMMENT ON COLUMN integration_provider_catalog.is_beta IS 'Se o provider está em fase de testes';
