-- Adiciona default_collapsed à stage_section_config
-- Permite configurar se uma seção inicia colapsada em etapas específicas
-- Prioridade: stage_section_config.default_collapsed > sections.default_collapsed

ALTER TABLE stage_section_config
ADD COLUMN IF NOT EXISTS default_collapsed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN stage_section_config.default_collapsed IS 'Quando true, seção inicia colapsada nesta etapa específica';
