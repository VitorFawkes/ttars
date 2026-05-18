-- 2026-05-18 — Isolamento de cards/contatos de teste de agente IA
--
-- Contexto: a Patricia (e qualquer agente em modo teste) hoje reutiliza
-- contatos+cards REAIS de produção quando uma testadora manda mensagem
-- pelo número que já existe como cliente real no CRM. Resultado:
--   1. Conversa de teste polui o card real
--   2. `reset_agent_test_conversation` (soft-delete em TODOS os cards do
--      contato) destrói cards reais ao zerar conversa de teste
--
-- Esta migration adiciona uma marca dedicada `test_agent_id` em `cards` e
-- `contatos` para que o router-v2 possa criar/usar contato+card ISOLADO
-- quando estiver em modo teste (whitelist não vazia). NULL = produção.

ALTER TABLE public.contatos
  ADD COLUMN IF NOT EXISTS test_agent_id UUID NULL;

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS test_agent_id UUID NULL;

-- Indices parciais — só registros de teste pagam pelo índice
CREATE INDEX IF NOT EXISTS idx_contatos_test_agent_id
  ON public.contatos (test_agent_id, telefone)
  WHERE test_agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cards_test_agent_id
  ON public.cards (test_agent_id, pessoa_principal_id)
  WHERE test_agent_id IS NOT NULL;

-- Garante 1 contato de teste por (agente, telefone) — evita race em
-- INSERT concorrente. Considera telefone normalizado (só dígitos).
CREATE UNIQUE INDEX IF NOT EXISTS uq_contatos_test_agent_phone
  ON public.contatos (test_agent_id, telefone_normalizado)
  WHERE test_agent_id IS NOT NULL AND telefone_normalizado IS NOT NULL;

COMMENT ON COLUMN public.contatos.test_agent_id IS
  'Quando preenchido, este contato é uma identidade de teste de um agente IA específico. Permite isolar conversas de teste de cards/contatos reais com o mesmo telefone.';

COMMENT ON COLUMN public.cards.test_agent_id IS
  'Quando preenchido, este card é um card de teste de um agente IA específico. Permite isolar conversas de teste de cards reais. `reset_agent_test_conversation` apaga só cards com test_agent_id = agent.id.';
