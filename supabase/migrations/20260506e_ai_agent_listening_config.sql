-- ai_agents.listening_config — configuração de "Responsividade Conversacional"
--
-- Conceito: como o agente reage quando o cliente NÃO segue o roteiro da agente
-- (devolve pergunta social, faz comentário, manda várias mensagens em sequência).
-- Não é tom (Voz), não é proibição (Linhas Vermelhas) — é responsividade em fluxo.
--
-- Renderizada como bloco <listening> no prompt v2 (prompt_builder_v2.ts).
--
-- Schema do JSON:
--   {
--     "echo_social_questions": boolean (responder "e você?", "tudo bem?")
--     "acknowledge_observations": boolean (reconhecer "que legal!", "vi vocês no Insta")
--     "handle_message_bursts": boolean (tratar pacote de msgs como 1 turno)
--     "never_ignore_lead": boolean (conversa de 2 lados, não formulário)
--     "examples": string[] (exemplos livres, opcional)
--   }

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS listening_config jsonb NOT NULL DEFAULT '{
    "echo_social_questions": true,
    "acknowledge_observations": true,
    "handle_message_bursts": true,
    "never_ignore_lead": true,
    "examples": []
  }'::jsonb;

COMMENT ON COLUMN ai_agents.listening_config IS
  'Responsividade conversacional: como o agente reage quando o lead foge do roteiro (pergunta social devolvida, comentário, múltiplas mensagens em sequência). Renderizado como <listening> em prompt_builder_v2.';
