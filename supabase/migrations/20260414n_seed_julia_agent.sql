-- Frente B: Inserir Julia como agente normal em ai_agents (idempotente, sem UUID fixo)
-- Propósito: Julia aparece no hub de agentes com execution_backend='n8n'
-- Segurança: só insere se NÃO houver Julia na org Welcome Trips.

INSERT INTO ai_agents (
  org_id, produto, nome, descricao, persona, ativa, modelo, temperature, max_tokens,
  system_prompt, system_prompt_version, tipo, routing_criteria, escalation_rules,
  memory_config, fallback_message, n8n_webhook_url, execution_backend, external_config,
  created_at, updated_at
)
SELECT
  'b0000000-0000-0000-0000-000000000001'::uuid,
  'TRIPS'::app_product,
  'Julia',
  'Consultora de viagens do Welcome que executa no n8n',
  'Consultora de viagens experiente e atenciosa',
  false, -- ativa: registro entra desligado; ativação é decisão do dono da org
  'gpt-5.1',
  0.7,
  1024,
  'Você é Julia, Consultora de viagens do Welcome, executando via n8n.',
  1,
  'sales',
  '{"keywords":["viagem","cotacao","reserva","preco"]}'::jsonb,
  '[]'::jsonb,
  '{"short_term_turns":5,"use_card_context":true,"max_history_turns":20}'::jsonb,
  'Desculpe, estou com dificuldades técnicas. Uma consultora vai entrar em contato em breve!',
  'https://n8n-n8n.ymnmx7.easypanel.host/webhook/welcome-trips-agent',
  'n8n',
  jsonb_build_object(
    'n8n_workflow_id', 'tvh1SN7VDgy8V3VI',
    'n8n_webhook_path', 'welcome-trips-agent',
    'n8n_webhook_url', 'https://n8n-n8n.ymnmx7.easypanel.host/webhook/welcome-trips-agent'
  ),
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM ai_agents
  WHERE org_id = 'b0000000-0000-0000-0000-000000000001'::uuid
    AND nome = 'Julia'
);
