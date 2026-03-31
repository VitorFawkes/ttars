-- Migration: Unified Field Governance
-- Description: Unifies field management by upgrading system_fields and creating stage_field_config.

-- 0. Update Check Constraint to allow 'json'
ALTER TABLE system_fields DROP CONSTRAINT IF EXISTS system_fields_type_check;
ALTER TABLE system_fields ADD CONSTRAINT system_fields_type_check 
CHECK (type IN ('text', 'number', 'date', 'currency', 'select', 'multiselect', 'boolean', 'json'));

-- 1. Upgrade system_fields table
ALTER TABLE system_fields 
ADD COLUMN IF NOT EXISTS section text DEFAULT 'details',
ADD COLUMN IF NOT EXISTS is_system boolean DEFAULT false;

-- 2. Create stage_field_config table (The Rules Engine)
CREATE TABLE IF NOT EXISTS stage_field_config (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id uuid REFERENCES pipeline_stages(id) ON DELETE CASCADE,
    field_key text REFERENCES system_fields(key) ON DELETE CASCADE,
    is_visible boolean DEFAULT true,
    is_required boolean DEFAULT false,
    show_in_header boolean DEFAULT false,
    custom_label text,
    "order" integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(stage_id, field_key)
);

-- 3. Enable RLS
ALTER TABLE stage_field_config ENABLE ROW LEVEL SECURITY;

-- 4. Policies for stage_field_config
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'stage_field_config' AND policyname = 'Public read access'
    ) THEN
        CREATE POLICY "Public read access" ON stage_field_config FOR SELECT USING (true);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'stage_field_config' AND policyname = 'Admin full access'
    ) THEN
        CREATE POLICY "Admin full access" ON stage_field_config FOR ALL USING (
            auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')
        );
    END IF;
END
$$;

-- 5. Seed System Fields (Idempotent)
INSERT INTO system_fields (key, label, type, section, is_system, active) VALUES
-- Meta/Header Fields
('data_viagem_inicio', 'Data da Viagem', 'date', 'header', true, true),
('valor_estimado', 'Valor Estimado', 'currency', 'header', true, true),
('prioridade', 'Prioridade', 'select', 'header', true, true),
('proxima_tarefa', 'Próxima Tarefa', 'text', 'header', true, true),
('ultima_interacao', 'Última Interação', 'date', 'header', true, true),
('created_at', 'Data de Criação', 'date', 'header', true, true),
('updated_at', 'Última Atualização', 'date', 'header', true, true),

-- Product Data Fields (Trip Info)
('destinos', 'Destinos', 'text', 'trip_info', true, true),
('epoca_viagem', 'Época da Viagem', 'text', 'trip_info', true, true),
('orcamento', 'Orçamento', 'currency', 'trip_info', true, true),
('motivo', 'Motivo da Viagem', 'text', 'trip_info', true, true),
('taxa_planejamento', 'Taxa de Planejamento', 'currency', 'trip_info', true, true),

-- People
('pessoas', 'Viajantes', 'json', 'people', true, true),

-- Validation/System
('origem', 'Origem do Lead', 'text', 'system', true, true),
('external_id', 'ID Externo', 'text', 'system', true, true),
('campaign_id', 'ID Campanha', 'text', 'system', true, true)

ON CONFLICT (key) DO UPDATE SET
    section = EXCLUDED.section,
    is_system = EXCLUDED.is_system,
    label = EXCLUDED.label;
