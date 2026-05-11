-- ai_agents.test_mode_phone_whitelist
-- Defesa em profundidade: quando não-nula, ai-agent-router e ai-agent-outbound-trigger
-- SÓ enviam mensagens via Echo para telefones presentes nesta lista.
-- Complementa routing_filter.allowed_phones (que é inbound-only por linha).
-- NULL = comportamento normal (sem whitelist).

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS test_mode_phone_whitelist TEXT[];

COMMENT ON COLUMN public.ai_agents.test_mode_phone_whitelist IS
  'Whitelist de telefones (formato E.164 sem +, ex: 5511964293533) para modo teste. NULL desativa o filtro. Quando populada, nenhum envio via Echo é feito para telefones fora desta lista, tanto no fluxo de resposta (ai-agent-router) quanto no outbound-trigger.';
