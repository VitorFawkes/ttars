-- Fix 2.2 (2026-05-24) — Reescreve bloco 2 da abertura da Patricia removendo
-- meta-linguagem ("A ideia aqui é uma conversa rápida para eu entender...").
--
-- Causa raiz: o texto antigo continha "A ideia aqui é uma conversa rápida
-- PARA EU ENTENDER um pouco do que vocês esperam..." — meta-linguagem clássica
-- ("pra eu entender") que viola explicitamente a rule `sem_meta_pergunta`
-- do validator.
--
-- Como moment está em `message_mode="literal"`, validator NÃO reescreve
-- (apenas registra violação e cai pra pass). Resultado: mensagem com violação
-- vai pro WhatsApp do cliente em todo turn 2 da abertura.
--
-- Observado em 23/05 nos cenários 1 (Maria), 7 (Família), 9 (Bruno), 10
-- (Renata) — TODOS dispararam o bloco 2 e violaram a regra.
--
-- Fix: reescrever bloco 2 mantendo o que importa (apresentação Welcome +
-- pergunta de visão) mas sem meta-linguagem.
--
-- ANTES (bloco 2 original — preservado em comentário pra rollback):
--   "Não sei se chegou a ver no nosso site, nós fazemos Destination Wedding
--    desde 2012 e já ganhamos 5 prêmios como a melhor produtora de Destination
--    Wedding da América Latina.
--
--    A ideia aqui é uma conversa rápida para eu entender um pouco do que
--    vocês esperam pro casamento, tirar possíveis dúvidas e, se fizer sentido,
--    marcar uma reunião por vídeo de detalhamento do casamento, com valores
--    e tudo mais com a nossa Wedding Planner, ok?
--
--    Pra começar, me diga:
--    O que é o casamento pra vocês? E como vocês imaginam ele?"
--
-- DEPOIS (versão limpa):
--   "Pra te dar contexto rápido: a Welcome faz Destination Wedding desde 2012,
--    com 5 prêmios consecutivos como melhor produtora da América Latina. Cada
--    casamento é desenhado do zero pro casal, sem pacote fechado.
--
--    O que é o casamento pra vocês? Como vocês imaginam ele?"
--
-- Análise:
--   - Sem "A ideia aqui é uma conversa rápida para eu entender" → não viola sem_meta_pergunta
--   - Sem "se fizer sentido marcar reunião" → não anuncia pitch genérico no início
--   - Mantém apresentação Welcome (desde 2012, 5 prêmios) → respeita curadoria
--   - Pergunta direta de visão (sem "Pra começar, me diga") → entra no que importa
--   - Mais curto e natural pra WhatsApp

-- anchor_text_parts é text[] (array PostgreSQL nativo), não JSONB.
-- Usa array indexing direto (índice 2 = posição 1-based do segundo elemento).
UPDATE ai_agent_moments
SET anchor_text_parts[2] = $$Pra te dar contexto rápido: a Welcome faz Destination Wedding desde 2012, com 5 prêmios consecutivos como melhor produtora da América Latina. Cada casamento é desenhado do zero pro casal, sem pacote fechado.

O que é o casamento pra vocês? Como vocês imaginam ele?$$
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'
  AND moment_key = 'abertura';

-- Sanity check
DO $$
DECLARE
  v_block2 TEXT;
BEGIN
  SELECT anchor_text_parts[2] INTO v_block2
  FROM ai_agent_moments
  WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'
    AND moment_key = 'abertura';

  IF v_block2 IS NULL OR v_block2 NOT LIKE 'Pra te dar contexto rápido%' THEN
    RAISE EXCEPTION 'Bloco 2 não foi atualizado corretamente. Atual: %', v_block2;
  END IF;

  IF v_block2 LIKE '%pra eu entender%' THEN
    RAISE EXCEPTION 'Bloco 2 ainda contém meta-linguagem proibida';
  END IF;

  RAISE NOTICE 'Bloco 2 atualizado: %', LEFT(v_block2, 100);
END $$;
