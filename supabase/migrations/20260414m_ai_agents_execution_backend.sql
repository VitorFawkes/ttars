-- Frente B1: Adicionar execution_backend e external_config em ai_agents
-- Propósito: Permitir agentes executados em n8n (Julia) ou edge functions (Luna)

-- Adiciona coluna execution_backend
ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS execution_backend TEXT NOT NULL DEFAULT 'edge_function'
CHECK (execution_backend IN ('edge_function', 'n8n', 'external_webhook'));

-- Adiciona coluna external_config para armazenar dados de execução externa (JSON)
ALTER TABLE ai_agents
ADD COLUMN IF NOT EXISTS external_config JSONB;

-- Comentário descritivo
COMMENT ON COLUMN ai_agents.execution_backend IS 'Backend de execução: edge_function (Luna), n8n (Julia), external_webhook (futuro)';
COMMENT ON COLUMN ai_agents.external_config IS 'Configuração específica do backend (ex: n8n_workflow_id, n8n_webhook_url para n8n)';
