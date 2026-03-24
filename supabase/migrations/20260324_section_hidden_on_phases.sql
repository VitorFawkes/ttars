-- Adiciona coluna para ocultar seções inteiras por fase do time do usuário
-- Diferente de collapse_on_phases (que recolhe baseado na fase do card),
-- hidden_on_phases esconde completamente baseado na fase do USUÁRIO logado.

ALTER TABLE sections ADD COLUMN IF NOT EXISTS hidden_on_phases TEXT[] DEFAULT '{}';

COMMENT ON COLUMN sections.hidden_on_phases
  IS 'Slugs de fase do time/usuario onde esta secao fica completamente oculta';
