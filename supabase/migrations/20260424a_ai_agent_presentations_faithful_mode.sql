-- ============================================================================
-- MIGRATION: ai_agent_presentations — adicionar modo 'faithful' (diretriz fiel)
-- Date: 2026-04-24
--
-- Problema real: modo 'concept' ficou frouxo demais. O prompt atual diz pro
-- LLM "use como base, mantenha seu tom e persona, adapte". Isso convida o
-- LLM a parafrasear e adicionar etapas que não estão na diretriz. A Estela
-- vazou "Wedding Planner em vídeo" e "antes de te passar" mesmo com o
-- concept_text não mencionando nada disso.
--
-- Modo 'fixed' no outro extremo é rígido demais — obriga texto EXATAMENTE
-- igual, o que fica robótico em conversas reais.
--
-- Introdução do modo 'faithful': estrutura e conteúdo obrigatórios, LLM só
-- adapta nome do lead e pequenas palavras de conexão. Sem inventar etapas,
-- sem puxar informação do resto do prompt.
--
-- Esta migration só amplia o CHECK. Dados existentes ficam intocados —
-- linhas com mode='concept' continuam valendo. O admin escolhe migrar
-- manualmente para 'faithful' onde fizer sentido.
-- ============================================================================

ALTER TABLE ai_agent_presentations
  DROP CONSTRAINT IF EXISTS ai_agent_presentations_mode_check;

ALTER TABLE ai_agent_presentations
  ADD CONSTRAINT ai_agent_presentations_mode_check
  CHECK (mode IN ('fixed', 'faithful', 'concept'));

-- Também precisamos ampliar o CHECK de conteúdo: 'faithful' usa o mesmo
-- campo que 'concept' (texto em linguagem natural), mas com semântica
-- diferente no runtime. Refatora pra aceitar os 3 modos corretamente.

ALTER TABLE ai_agent_presentations
  DROP CONSTRAINT IF EXISTS ai_agent_presentations_check;

ALTER TABLE ai_agent_presentations
  ADD CONSTRAINT ai_agent_presentations_content_check CHECK (
    (mode = 'fixed' AND fixed_template IS NOT NULL AND length(trim(fixed_template)) > 0)
    OR
    (mode IN ('faithful', 'concept')
      AND concept_text IS NOT NULL
      AND length(trim(concept_text)) > 0)
  );

COMMENT ON COLUMN ai_agent_presentations.mode IS
  'fixed: fixed_template enviado literal com vars substituídas. faithful: concept_text como estrutura obrigatória — LLM só adapta nome/variações mínimas, não inventa etapas. concept: concept_text como diretriz livre que o LLM parafrasea mantendo persona/tom (mais criativo, menos fiel).';
