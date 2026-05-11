-- ============================================================
-- MIGRATION: Estela — paridade com formato esperado pelo router
-- Date: 2026-04-21
--
-- Bugs descobertos auditando a Estela:
-- 1. pipeline_models.{data,main,validator,formatter,backoffice}.modelo → o
--    router lê `.model` (inglês). Com "modelo" (pt), o override por etapa é
--    ignorado e tudo cai no fallback agent.modelo. Todos os campos customizados
--    por etapa eram dead config.
-- 2. pipeline_models.backoffice → o router lê `pipeline_models.context` para
--    o Backoffice/Context Agent. "backoffice" é dead config — renomeamos para
--    `context` preservando os mesmos valores.
-- 3. test_mode_phone_whitelist=null → sem proteção de envio real. Setamos
--    ["5511964293533"] para alinhar com padrão de teste da Luna.
-- 4. ai_agent_phone_line_config.routing_filter=null → o vínculo da Estela
--    aceita qualquer telefone. Setamos allowed_phones para o número de teste
--    enquanto ativa=false; ao ligar para produção, zerar ambos.
-- ============================================================

-- 1. Corrige pipeline_models: modelo → model, backoffice → context
UPDATE ai_agents
SET pipeline_models = jsonb_build_object(
  'data', jsonb_build_object(
    'model', pipeline_models->'data'->>'modelo',
    'temperature', (pipeline_models->'data'->>'temperature')::numeric,
    'max_tokens', (pipeline_models->'data'->>'max_tokens')::int
  ),
  'main', jsonb_build_object(
    'model', pipeline_models->'main'->>'modelo',
    'temperature', (pipeline_models->'main'->>'temperature')::numeric,
    'max_tokens', (pipeline_models->'main'->>'max_tokens')::int
  ),
  'context', jsonb_build_object(
    'model', pipeline_models->'backoffice'->>'modelo',
    'temperature', (pipeline_models->'backoffice'->>'temperature')::numeric,
    'max_tokens', (pipeline_models->'backoffice'->>'max_tokens')::int
  ),
  'validator', jsonb_build_object(
    'model', pipeline_models->'validator'->>'modelo',
    'temperature', (pipeline_models->'validator'->>'temperature')::numeric,
    'max_tokens', (pipeline_models->'validator'->>'max_tokens')::int
  ),
  'formatter', jsonb_build_object(
    'model', pipeline_models->'formatter'->>'modelo',
    'temperature', (pipeline_models->'formatter'->>'temperature')::numeric,
    'max_tokens', (pipeline_models->'formatter'->>'max_tokens')::int
  )
)
WHERE id = 'c22fe402-2255-43e1-9d58-6ee7183dbbaa'
  AND pipeline_models->'backoffice' IS NOT NULL;

-- 2. Adiciona proteção test_mode_phone_whitelist
UPDATE ai_agents
SET test_mode_phone_whitelist = ARRAY['5511964293533']
WHERE id = 'c22fe402-2255-43e1-9d58-6ee7183dbbaa'
  AND test_mode_phone_whitelist IS NULL;

-- 3. Adiciona routing_filter no vínculo de linha (defesa em profundidade)
UPDATE ai_agent_phone_line_config
SET routing_filter = jsonb_build_object('allowed_phones', jsonb_build_array('5511964293533'))
WHERE agent_id = 'c22fe402-2255-43e1-9d58-6ee7183dbbaa'
  AND routing_filter IS NULL;
