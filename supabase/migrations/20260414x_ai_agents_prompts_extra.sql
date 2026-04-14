-- C2a — adiciona coluna prompts_extra (4 blocos complementares ao system_prompt)
-- Blocos: context, data_update, formatting, validator (seção 5.2 do plano mestre)
-- Idempotente.

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS prompts_extra JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN ai_agents.prompts_extra IS
  'Blocos de prompt além do system_prompt principal: { context, data_update, formatting, validator }. Consumido pelo pipeline Luna/n8n.';
