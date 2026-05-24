-- Fix 2.1 REVERT (2026-05-24) — Reverter refinamento da condition de nunca_preco
--
-- A migration 20260524a refinou a condition de nunca_preco adicionando 3 exemplos
-- POSITIVOS e 3 NEGATIVOS. Mas isso introduziu REGRESSÃO na validação:
--
-- Validação dos 10 cenários (24/05) mostrou validator bloqueando indevidamente
-- em casos onde antes (23/05) funcionava perfeito:
--   - Cenário 4 (Carlos R$30k/150): Patricia ia desqualificar corretamente
--     ("R$ 200 por convidado, abaixo do nosso padrão"). Validator BLOQUEOU
--     com nunca_preco. Antes da migration: passava limpo.
--   - Cenário 3 (Ana €100k Bali): Patricia ia confirmar conversão (R$600k).
--     Validator BLOQUEOU. Antes: passava limpo.
--   - Cenário 6 (Pedro 15k/100): trigger inviabilidade precoce disparou
--     desfecho_nao_qualificado corretamente, MAS validator bloqueou a
--     resposta gerada pelo LLM.
--
-- A condition nova ficou interpretada como "qualquer menção de valor numérico
-- é violação", mesmo quando Patricia está em desfecho_nao_qualificado e PRECISA
-- mencionar o valor pra recusar com honestidade ("R$ 200/conv não sustenta").
--
-- Decisão: voltar à condition original (mais permissiva, menos exemplos)
-- e tratar o falso positivo do João (cenário 2) por outra via — talvez via
-- MOMENT_EXCEPTIONS quando moment for objecao_preco ou desfecho_nao_qualificado.

UPDATE ai_agents
SET validator_rules = (
  SELECT jsonb_agg(
    CASE
      WHEN rule->>'id' = 'nunca_preco' THEN jsonb_set(
        rule,
        '{condition}',
        to_jsonb($${agent_name} fala preço/valor do CASAMENTO em si (montante total do evento, custo por convidado, valor do pacote/experiência Welcome) antes da reunião com a Wedding Planner. PERMITIDO falar a faixa de contrato/assessoria (entre R$ 4 mil e R$ 18 mil, deixando claro que varia muito conforme o porte/destino/perfil do casamento) quando o lead pergunta especificamente sobre o valor da ASSESSORIA. BLOQUEIA apenas quando ela tenta estimar/cotar o CASAMENTO inteiro antes da reunião.$$::TEXT)
      )
      ELSE rule
    END
  )
  FROM jsonb_array_elements(validator_rules) AS rule
)
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';
