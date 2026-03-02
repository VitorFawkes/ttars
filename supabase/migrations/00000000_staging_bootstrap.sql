-- ============================================================
-- STAGING BOOTSTRAP: Schema mínimo para Wedding pipeline
-- Cria apenas as tabelas e dados necessários para as migrations
-- NÃO aplicar em produção (tabelas já existem lá)
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════

DO $$ BEGIN
    CREATE TYPE app_product AS ENUM ('TRIPS', 'WEDDING', 'CORP');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE app_role AS ENUM ('admin', 'gestor', 'sdr', 'vendas', 'pos_venda', 'concierge');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════════════════

-- Integrations
CREATE TABLE IF NOT EXISTS public.integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    provider TEXT,
    config JSONB DEFAULT '{}',
    transformer_rules JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pipeline Phases
CREATE TABLE IF NOT EXISTS public.pipeline_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    label TEXT NOT NULL,
    slug TEXT,
    color TEXT NOT NULL DEFAULT 'bg-gray-600',
    order_index INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    visible_in_card BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Pipelines
CREATE TABLE IF NOT EXISTS public.pipelines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    produto app_product NOT NULL,
    descricao TEXT,
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Pipeline Stages
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES public.pipelines(id),
    phase_id UUID REFERENCES public.pipeline_phases(id),
    nome TEXT NOT NULL,
    ordem INTEGER NOT NULL,
    description TEXT,
    fase TEXT,
    ativo BOOLEAN DEFAULT true,
    is_won BOOLEAN DEFAULT false,
    is_lost BOOLEAN DEFAULT false,
    is_sdr_won BOOLEAN DEFAULT false,
    is_planner_won BOOLEAN DEFAULT false,
    is_pos_won BOOLEAN DEFAULT false,
    tipo_responsavel app_role NOT NULL DEFAULT 'sdr',
    target_role TEXT,
    milestone_key TEXT,
    sla_hours INTEGER,
    is_frozen BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Integration Stage Map (inbound AC → CRM)
CREATE TABLE IF NOT EXISTS public.integration_stage_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
    pipeline_id TEXT NOT NULL,
    external_stage_id TEXT NOT NULL,
    external_stage_name TEXT NOT NULL,
    internal_stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    direction TEXT,
    label TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Integration Inbound Triggers
CREATE TABLE IF NOT EXISTS public.integration_inbound_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
    external_pipeline_id TEXT NOT NULL,
    external_stage_id TEXT NOT NULL DEFAULT '',
    action_type TEXT NOT NULL DEFAULT 'create_only',
    entity_types TEXT[] NOT NULL DEFAULT ARRAY['deal', 'contact'],
    is_active BOOLEAN NOT NULL DEFAULT true,
    description TEXT,
    name TEXT,
    external_owner_ids TEXT[],
    target_stage_id UUID REFERENCES public.pipeline_stages(id),
    target_pipeline_id UUID REFERENCES public.pipelines(id),
    external_pipeline_ids TEXT[],
    external_stage_ids TEXT[],
    bypass_validation BOOLEAN DEFAULT false,
    validation_level TEXT DEFAULT 'fields_only',
    quarantine_mode TEXT DEFAULT 'stage',
    quarantine_stage_id UUID REFERENCES public.pipeline_stages(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Integration Outbound Stage Map (CRM → AC)
CREATE TABLE IF NOT EXISTS public.integration_outbound_stage_map (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID REFERENCES public.integrations(id) ON DELETE CASCADE,
    internal_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    external_stage_id TEXT NOT NULL,
    external_stage_name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(integration_id, internal_stage_id)
);

-- ═══════════════════════════════════════════════════════════
-- SEED DATA (mesmo que produção)
-- ═══════════════════════════════════════════════════════════

-- Integration (ActiveCampaign)
INSERT INTO public.integrations (id, name, type, provider, is_active)
VALUES ('a2141b92-561f-4514-92b4-9412a068d236', 'ActiveCampaign', 'crm', 'activecampaign', true)
ON CONFLICT (id) DO NOTHING;

-- Pipeline Phases
INSERT INTO public.pipeline_phases (id, name, label, slug, color, order_index) VALUES
('b7b72c29-6091-4c20-a58a-c3b8aed4755a', 'SDR',        'SDR',        'sdr',       'bg-blue-600',   1),
('eafb7dff-663c-4713-bca2-035dcf2093ba', 'Planner',     'Planner',    'planner',   'bg-purple-600', 2),
('95e78a06-92af-447c-9f71-60b2c23f1420', 'Pós-venda',   'Pós-venda',  'pos-venda', 'bg-green-600',  3),
('7e4b7b21-fff2-4cb6-9b33-d9baf771edf7', 'Resolução',   'Resolução',  'resolucao', 'bg-gray-600',   999)
ON CONFLICT (id) DO NOTHING;

-- Pipelines
INSERT INTO public.pipelines (id, nome, produto, descricao) VALUES
('c8022522-4a1d-411c-9387-efe03ca725ee', 'Pipeline Welcome Trips',   'TRIPS',   'Funil comercial e pós-venda de viagens personalizadas'),
('f4611f84-ce9c-48ad-814b-dcd6081f15db', 'Pipeline Welcome Wedding', 'WEDDING', 'Funil de planejamento e execução de casamentos'),
('952fd827-39a1-43cb-b160-a7f02a04678d', 'Pipeline Welcome Corp',    'CORP',    'Funil de eventos e viagens corporativas')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- ETAPA 2: Tabelas de UI (sections, system_fields, stage_field_config)
-- ═══════════════════════════════════════════════════════════

-- Sections
CREATE TABLE IF NOT EXISTS public.sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    color TEXT DEFAULT 'bg-gray-50 text-gray-700 border-gray-100',
    icon TEXT DEFAULT 'layers',
    position TEXT DEFAULT 'left_column' CHECK (position IN ('left_column', 'right_column')),
    order_index INTEGER DEFAULT 0,
    pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL,
    is_governable BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    widget_component TEXT
);

-- System Fields
CREATE TABLE IF NOT EXISTS public.system_fields (
    key TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    type TEXT NOT NULL,
    options JSONB,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    section TEXT DEFAULT 'details',
    is_system BOOLEAN DEFAULT false,
    section_id UUID REFERENCES public.sections(id) ON DELETE SET NULL,
    order_index INTEGER DEFAULT 0
);

-- Stage Field Config
CREATE TABLE IF NOT EXISTS public.stage_field_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    field_key TEXT REFERENCES public.system_fields(key) ON DELETE CASCADE,
    is_visible BOOLEAN DEFAULT true,
    is_required BOOLEAN DEFAULT false,
    show_in_header BOOLEAN DEFAULT false,
    custom_label TEXT,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- Colunas de unified_stage_requirements
    requirement_type TEXT NOT NULL DEFAULT 'field',
    requirement_label TEXT,
    description TEXT,
    is_blocking BOOLEAN DEFAULT true,
    proposal_min_status TEXT,
    task_tipo TEXT,
    task_require_completed BOOLEAN DEFAULT true,
    -- Coluna de integration_quality_gate
    bypass_sources TEXT[] DEFAULT ARRAY[]::TEXT[],
    UNIQUE(stage_id, field_key)
);

-- Verificação
DO $$
BEGIN
    RAISE NOTICE 'Staging bootstrap completo: % integrations, % phases, % pipelines, sections=%, system_fields=%, stage_field_config=%',
        (SELECT COUNT(*) FROM integrations),
        (SELECT COUNT(*) FROM pipeline_phases),
        (SELECT COUNT(*) FROM pipelines),
        (SELECT COUNT(*) FROM sections),
        (SELECT COUNT(*) FROM system_fields),
        (SELECT COUNT(*) FROM stage_field_config);
END $$;
