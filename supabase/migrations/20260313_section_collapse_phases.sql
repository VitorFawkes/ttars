-- Adiciona coluna collapse_on_phases à tabela sections
-- Permite configurar em quais fases do pipeline cada seção auto-recolhe
ALTER TABLE sections ADD COLUMN IF NOT EXISTS collapse_on_phases TEXT[] DEFAULT '{}';

COMMENT ON COLUMN sections.collapse_on_phases
  IS 'Slugs de fase onde esta seção auto-recolhe (ex: {planner, pos_venda})';
