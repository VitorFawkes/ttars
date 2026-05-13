-- Adiciona coluna wedding_planner_profile_id em ai_agents.
--
-- Usado pela Patricia (single_agent_v2) para:
--   1. Filtrar a query de conflitos de agenda apenas pelas reuniões da
--      Wedding Planner responsável (não da org inteira).
--   2. Setar responsavel_id ao criar reunião via tool confirm_meeting_slot.
--
-- Nullable: quando vazio, comportamento atual (lê reuniões de qualquer
-- responsável na org). Sem regressão.

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS wedding_planner_profile_id UUID
    REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN ai_agents.wedding_planner_profile_id IS
  'Profile da Wedding Planner (ou T.Planner) responsável por reuniões agendadas por este agente. Usado para filtrar agenda real e setar responsavel_id ao criar reuniao.';

-- Seed inicial: Patricia → Ana Carolina Kuss (T.Planner de Weddings)
UPDATE ai_agents
SET wedding_planner_profile_id = 'f3c7ccd6-3038-469b-be5c-39a324ca64bc'
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';
