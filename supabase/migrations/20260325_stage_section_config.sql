-- Migration: Unificar visibilidade de seções por etapa do card
-- Substitui hidden_on_phases (por time) e collapse_on_phases (por fase) por regra única por stage.
-- Padrão: seção visível. Rows com is_visible=false ocultam a seção naquela etapa.

-- 1. Criar tabela stage_section_config (espelha stage_field_config)
CREATE TABLE IF NOT EXISTS stage_section_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
    section_key TEXT NOT NULL REFERENCES sections(key) ON DELETE CASCADE,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(stage_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_stage_section_config_stage ON stage_section_config(stage_id);
CREATE INDEX IF NOT EXISTS idx_stage_section_config_key ON stage_section_config(section_key);

COMMENT ON TABLE stage_section_config IS 'Visibilidade de seções por etapa do pipeline. Ausência = visível (default true).';

-- 2. Migrar dados de collapse_on_phases → stage_section_config (is_visible = false)
INSERT INTO stage_section_config (stage_id, section_key, is_visible)
SELECT ps.id, s.key, false
FROM sections s
CROSS JOIN LATERAL unnest(s.collapse_on_phases) AS phase_slug
JOIN pipeline_phases pp ON pp.slug = phase_slug
JOIN pipeline_stages ps ON ps.phase_id = pp.id
WHERE s.collapse_on_phases IS NOT NULL
  AND array_length(s.collapse_on_phases, 1) > 0
ON CONFLICT (stage_id, section_key) DO NOTHING;

-- 3. Dropar colunas obsoletas
ALTER TABLE sections DROP COLUMN IF EXISTS collapse_on_phases;
ALTER TABLE sections DROP COLUMN IF EXISTS hidden_on_phases;

-- 4. RLS (mesmo padrão de stage_field_config)
ALTER TABLE stage_section_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'stage_section_config' AND policyname = 'Public read access'
    ) THEN
        CREATE POLICY "Public read access" ON stage_section_config FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'stage_section_config' AND policyname = 'Admin full access'
    ) THEN
        CREATE POLICY "Admin full access" ON stage_section_config FOR ALL USING (
            auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
        );
    END IF;
END
$$;
