-- Migration: Create sections table for dynamic custom sections
-- This enables users to create custom sections (e.g., "Infos Globais") with fields
-- and control their positioning in the CardDetail page.

-- 1. Create sections table
CREATE TABLE IF NOT EXISTS sections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text UNIQUE NOT NULL,              -- Unique identifier (e.g., 'custom_global_info')
    label text NOT NULL,                   -- Display name (e.g., 'Informações Globais')
    color text DEFAULT 'bg-gray-50 text-gray-700 border-gray-100', -- Tailwind color classes
    icon text DEFAULT 'layers',            -- Lucide icon name
    position text DEFAULT 'left_column' CHECK (position IN ('left_column', 'right_column')),
    order_index int DEFAULT 0,             -- For ordering within position
    pipeline_id uuid REFERENCES pipelines(id) ON DELETE SET NULL, -- NULL = global section
    is_governable boolean DEFAULT true,    -- Can fields have visibility rules per stage?
    is_system boolean DEFAULT false,       -- Prevent deletion of system sections
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. Add comment for documentation
COMMENT ON TABLE sections IS 'Dynamic sections for grouping fields in CardDetail. Replaces hardcoded SECTIONS constant.';
COMMENT ON COLUMN sections.position IS 'Which column in CardDetail: left_column (work area) or right_column (context)';
COMMENT ON COLUMN sections.is_governable IS 'If true, fields in this section can have per-stage visibility rules';
COMMENT ON COLUMN sections.is_system IS 'If true, section cannot be deleted (e.g., trip_info, observacoes_criticas)';

-- 3. Seed existing hardcoded sections (from admin.ts SECTIONS constant)
INSERT INTO sections (key, label, color, icon, position, is_system, is_governable, order_index) VALUES
    ('trip_info', 'Informações da Viagem', 'bg-blue-50 text-blue-700 border-blue-100', 'plane', 'right_column', true, true, 10),
    ('observacoes_criticas', 'Informações Importantes', 'bg-red-50 text-red-700 border-red-100', 'alert-triangle', 'left_column', true, true, 10),
    ('people', 'Pessoas / Viajantes', 'bg-purple-50 text-purple-700 border-purple-100', 'users', 'right_column', true, false, 20),
    ('payment', 'Pagamento', 'bg-green-50 text-green-700 border-green-100', 'credit-card', 'right_column', true, false, 30),
    ('system', 'Sistema / Interno', 'bg-gray-50 text-gray-700 border-gray-100', 'settings', 'right_column', true, false, 100)
ON CONFLICT (key) DO UPDATE SET
    label = EXCLUDED.label,
    color = EXCLUDED.color,
    icon = EXCLUDED.icon,
    position = EXCLUDED.position,
    is_system = EXCLUDED.is_system,
    is_governable = EXCLUDED.is_governable,
    order_index = EXCLUDED.order_index;

-- 4. Add section_id FK to system_fields (optional for backward compatibility)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'system_fields' AND column_name = 'section_id'
    ) THEN
        ALTER TABLE system_fields ADD COLUMN section_id uuid REFERENCES sections(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 5. Backfill section_id from existing section text column
UPDATE system_fields sf
SET section_id = s.id
FROM sections s
WHERE sf.section = s.key AND sf.section_id IS NULL;

-- 6. Create index for performance
CREATE INDEX IF NOT EXISTS idx_sections_active_order ON sections(active, order_index);
CREATE INDEX IF NOT EXISTS idx_sections_position ON sections(position) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_system_fields_section_id ON system_fields(section_id);

-- 7. RLS Policies
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- Everyone can read active sections
DROP POLICY IF EXISTS "Public read sections" ON sections;
CREATE POLICY "Public read sections" ON sections 
    FOR SELECT USING (true);

-- Only admins can insert
DROP POLICY IF EXISTS "Admin insert sections" ON sections;
CREATE POLICY "Admin insert sections" ON sections 
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR role = 'admin'))
    );

-- Only admins can update
DROP POLICY IF EXISTS "Admin update sections" ON sections;
CREATE POLICY "Admin update sections" ON sections 
    FOR UPDATE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR role = 'admin'))
    );

-- Only admins can delete non-system sections
DROP POLICY IF EXISTS "Admin delete sections" ON sections;
CREATE POLICY "Admin delete sections" ON sections 
    FOR DELETE USING (
        is_system = false AND
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (is_admin = true OR role = 'admin'))
    );

-- 8. Trigger for updated_at
CREATE OR REPLACE FUNCTION update_sections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sections_updated_at ON sections;
CREATE TRIGGER trigger_sections_updated_at
    BEFORE UPDATE ON sections
    FOR EACH ROW
    EXECUTE FUNCTION update_sections_updated_at();
