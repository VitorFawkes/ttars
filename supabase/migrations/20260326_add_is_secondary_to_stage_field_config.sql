-- Adiciona is_secondary à stage_field_config
-- Campos secundários ficam ocultos atrás de "Ver mais" no card detail
-- is_visible=true + is_secondary=false → sempre visível (primário)
-- is_visible=true + is_secondary=true  → visível atrás de "Ver mais" (secundário)
-- is_visible=false                     → oculto

ALTER TABLE stage_field_config
ADD COLUMN IF NOT EXISTS is_secondary BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN stage_field_config.is_secondary IS 'Quando true, campo aparece colapsado atrás de "Ver mais" no card detail';
