-- Limpa o system_prompt legacy da Patricia (3.631 chars de texto copiado da
-- Estela durante a clonagem inicial em 2026-05-08).
--
-- Esse campo NÃO é lido pelo engine single_agent_v2 — buildSinglePrompt em
-- supabase/functions/ai-agent-router-v2/prompt_assembler.ts monta o prompt
-- diretamente do playbook + defaults + business_config. system_prompt é
-- usado apenas por engine multi_agent_pipeline (Estela V1).
--
-- Patricia foi clonada da Estela com o system_prompt junto, mas o engine V3
-- já não lê. Continuar com texto velho no banco causa confusão na auditoria
-- do admin e risco de drift se alguém um dia mexer no engine.

UPDATE ai_agents
SET system_prompt = ''
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'
  AND engine = 'single_agent_v2';
