-- Migration: Defaults de campos por seção (section_field_config)
-- Camada intermediária: stage_field_config > section_field_config > system defaults (tudo visível)
-- Permite definir "na seção X, campo Y é oculto por padrão" sem repetir por stage.
-- Padrão: campo visível. Rows com is_visible=false ocultam o campo na seção.

-- 1. Criar tabela section_field_config
CREATE TABLE IF NOT EXISTS section_field_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_key TEXT NOT NULL REFERENCES sections(key) ON DELETE CASCADE,
    field_key TEXT NOT NULL REFERENCES system_fields(key) ON DELETE CASCADE,
    is_visible BOOLEAN NOT NULL DEFAULT true,
    is_required BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(section_key, field_key)
);

CREATE INDEX IF NOT EXISTS idx_section_field_config_section ON section_field_config(section_key);
CREATE INDEX IF NOT EXISTS idx_section_field_config_field ON section_field_config(field_key);

COMMENT ON TABLE section_field_config IS 'Defaults de visibilidade/obrigatoriedade de campos por seção. Ausência = visível (default true). Override por stage via stage_field_config.';

-- 2. RLS (mesmo padrão de stage_section_config)
ALTER TABLE section_field_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'section_field_config' AND policyname = 'Public read access'
    ) THEN
        CREATE POLICY "Public read access" ON section_field_config FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'section_field_config' AND policyname = 'Admin full access'
    ) THEN
        CREATE POLICY "Admin full access" ON section_field_config FOR ALL USING (
            auth.uid() IN (SELECT id FROM profiles WHERE is_admin = true)
        );
    END IF;
END
$$;
