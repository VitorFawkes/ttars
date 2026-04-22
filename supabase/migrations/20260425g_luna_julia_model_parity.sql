-- Paridade de modelos Luna ↔ Julia (workflow n8n tvh1SN7VDgy8V3VI, desligado 2026-04-11)
--
-- Contexto: a Julia rodava gpt-5.1 em 4 dos 5 agentes do pipeline e gpt-5-mini no
-- formatter. A Luna herdou gpt-5.1 só no main e context; data/validator/formatter
-- ficaram em gpt-4.1 / gpt-4.1-mini por default de criação. Esta migration sobe
-- os 3 agentes divergentes para reproduzir exatamente o comportamento Julia.
--
-- Escopo: SÓ a Luna (id 0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8). Outros agentes
-- (Estela, templates novos) não são tocados — cada um pode ter pipeline_models
-- configurado individualmente via UI /settings/ai-agents/:id.
--
-- Reversibilidade: copie os valores antigos abaixo pra reverter se custo pesar:
--   data:      gpt-4.1         (temp 0.2, max 512)
--   validator: gpt-4.1-mini    (temp 0.1, max 512)
--   formatter: gpt-4.1-mini    (temp 0.3, max 1024)

UPDATE ai_agents
SET
  pipeline_models = jsonb_build_object(
    'context',   jsonb_build_object('model', 'gpt-5.1',    'temperature', 0.2, 'max_tokens', 1024),
    'data',      jsonb_build_object('model', 'gpt-5.1',    'temperature', 0.1, 'max_tokens', 800),
    'main',      jsonb_build_object('model', 'gpt-5.1',    'temperature', 0.7, 'max_tokens', 1024),
    'validator', jsonb_build_object('model', 'gpt-5.1',    'temperature', 0.0, 'max_tokens', 500),
    'formatter', jsonb_build_object('model', 'gpt-5-mini', 'temperature', 0.3, 'max_tokens', 1024)
  ),
  updated_at = NOW()
WHERE id = '0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8'; -- Luna (Welcome Trips)

-- Verificação pós-aplicação:
-- SELECT id, nome, pipeline_models FROM ai_agents WHERE id = '0d4fb727-9d25-4ce3-ae0f-f480bb77a4d8';
