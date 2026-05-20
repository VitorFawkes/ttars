-- AI Agent V2 — palavras-chave de detecção customizáveis por sinal silencioso.
--
-- Hoje, o router tem 2 blocos hardcoded de regex pra detectar respostas
-- do lead a perguntas indiretas (ww_sdr_ajuda_familia e
-- ww_sdr_perfil_viagem_internacional da Patricia). Essas regex assumem
-- os nomes dos campos e o vocabulário da Patricia — qualquer agente novo
-- nasce sem essa proteção.
--
-- Esta coluna permite definir por sinal, na UI, as 3 listas de palavras:
-- 1. question_keywords: indicam que o AGENTE fez a pergunta sobre o tema
-- 2. answer_yes_keywords: indicam resposta positiva do lead
-- 3. answer_no_keywords: indicam resposta negativa do lead
--
-- Quando preenchido, o router roda esse matching como fallback ao LLM
-- (mesma lógica do hardcoded da Patricia, mas configurável).
-- Estrutura:
--   {
--     "question_keywords": ["família", "ajuda", "apoio"],
--     "answer_yes_keywords": ["sim", "ajudam", "pais"],
--     "answer_no_keywords": ["não", "sozinho", "conta própria"],
--     "max_answer_length": 200       -- opcional, default 200
--   }
--
-- NULL = sem fallback (LLM é a única forma de detectar). Aditiva, sem
-- impacto em agentes existentes.

ALTER TABLE public.ai_agent_silent_signals
  ADD COLUMN IF NOT EXISTS detection_patterns JSONB DEFAULT NULL;

COMMENT ON COLUMN public.ai_agent_silent_signals.detection_patterns IS
  'Palavras-chave editáveis pelo admin pra detectar resposta do lead a pergunta indireta. Estrutura: { question_keywords[], answer_yes_keywords[], answer_no_keywords[], max_answer_length? }. NULL = só LLM detecta.';
