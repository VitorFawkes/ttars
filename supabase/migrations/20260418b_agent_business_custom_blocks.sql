-- Blocos customizados de contexto do negócio (2026-04-18)
--
-- Motivo: o schema atual de ai_agent_business_config é específico pra vendas
-- consultivas (preço, processo de vendas, reunião). Para agentes de outros
-- domínios (recrutamento, suporte, clínica, educação, imobiliária, advocacia),
-- os conceitos relevantes são completamente diferentes ("vagas ativas",
-- "convênios aceitos", "SLA por prioridade", "currículo", etc).
--
-- Solução: adicionar um array JSONB livre onde o admin adiciona N blocos
-- com título e conteúdo próprios, que o router injeta no system prompt
-- como contexto do negócio.

ALTER TABLE ai_agent_business_config
  ADD COLUMN IF NOT EXISTS custom_blocks JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN ai_agent_business_config.custom_blocks IS
  'Array de blocos de contexto do negócio: [{ "title": string, "content": string }]. Injetado no system prompt do agente. Use para conceitos específicos do domínio que não se encaixam nos campos estruturados (preço, processo, etc).';
