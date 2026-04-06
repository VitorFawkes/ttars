-- Garante que toda regra de stage_field_config marcada como `is_required = true`
-- tenha um `requirement_type` setado, defaultando para 'field'.
--
-- CONTEXTO: Os panels do Studio (PhaseFieldConfigPanel, StageInspectorDrawer,
-- StudioLayout) gerenciam apenas regras de campo (visibilidade + obrigatoriedade),
-- mas não enviam `requirement_type` no payload do upsert. Isso fazia com que
-- regras criadas via UI ficassem com `requirement_type = NULL`, quebrando o
-- `useStageRequirements` (que filtra `.not('requirement_type', 'is', null)`)
-- e mantendo a regra "fantasma" — gravada no banco, mas invisível na UI do card.
--
-- Esta trigger é a defesa em profundidade: se qualquer caminho criar/atualizar
-- uma regra obrigatória sem requirement_type, o banco preenche automaticamente
-- com 'field' (o tipo gerenciado por todas as UIs de field config).
--
-- Idempotente: usa CREATE OR REPLACE e DROP IF EXISTS na trigger.

CREATE OR REPLACE FUNCTION public.default_stage_field_config_requirement_type()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.is_required IS TRUE AND NEW.requirement_type IS NULL THEN
        NEW.requirement_type := 'field';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_stage_field_config_requirement_type ON public.stage_field_config;

CREATE TRIGGER trg_default_stage_field_config_requirement_type
BEFORE INSERT OR UPDATE ON public.stage_field_config
FOR EACH ROW
EXECUTE FUNCTION public.default_stage_field_config_requirement_type();

-- Backfill: corrige qualquer linha existente nesse estado inconsistente.
UPDATE public.stage_field_config
SET requirement_type = 'field'
WHERE is_required = true
  AND requirement_type IS NULL;
