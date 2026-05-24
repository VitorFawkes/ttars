-- Fix 2.1 (2026-05-24) — Refina condition da rule `nunca_preco` no validator
-- da Patricia pra eliminar falso positivo observado no teste de 10 cenários
-- (23/05): cenário João ("Qual o valor?") foi bloqueado com `nunca_preco`,
-- mesmo Patricia respondendo corretamente com a faixa de honorário R$ 4-18k
-- (que era PERMITIDO pela própria condition).
--
-- Causa raiz: a condition antiga era textualmente ambígua. Diz "permitido
-- honorário R$ 4-18k" e "proibido custo do casamento", mas SEM exemplos
-- concretos. Validator (gpt-5.1, modelo menor) errava na distinção sutil
-- entre "explicar a faixa de honorário" e "estimar custo do casamento".
--
-- Fix: adicionar 3 exemplos POSITIVOS (deve passar) e 3 NEGATIVOS (deve
-- bloquear) explícitos na condition. LLM-judge tem âncoras concretas.
--
-- BACKUP da condition antiga (pra rollback):
--   "{agent_name} fala preço/valor do CASAMENTO em si (montante total do
--    evento, custo por convidado, valor do pacote/experiência Welcome) antes
--    da reunião com a Wedding Planner. PERMITIDO falar a faixa de
--    contrato/assessoria (entre R$ 4 mil e R$ 18 mil, deixando claro que
--    varia muito conforme o porte/destino/perfil do casamento) quando o lead
--    pergunta especificamente sobre o valor da ASSESSORIA. BLOQUEIA apenas
--    quando ela tenta estimar/cotar o CASAMENTO inteiro antes da reunião."

UPDATE ai_agents
SET validator_rules = (
  SELECT jsonb_agg(
    CASE
      WHEN rule->>'id' = 'nunca_preco' THEN jsonb_set(
        rule,
        '{condition}',
        to_jsonb($$
{agent_name} fala valor/preço/custo do CASAMENTO inteiro (cerimônia + recepção + fornecedores + decoração + gastronomia + produção) ANTES da reunião com a Wedding Planner.

PERMITIDO (NÃO MARQUE VIOLAÇÃO):
- Citar a faixa de HONORÁRIO da assessoria (R$ 4 mil a R$ 18 mil): essa é a cobrança da Welcome pelo trabalho dela, NÃO é valor do casamento.
- Explicar a SEPARAÇÃO entre honorário (R$ 4-18k, cobrado pela Welcome) e custo do casamento (que varia bastante e ela não passa por aqui).
- Dizer "o casamento em si varia muito porque cada projeto é desenhado do zero, sem pacote fechado" (afirmação sobre formato, sem cifra).

PROIBIDO (MARQUE VIOLAÇÃO):
- Dar estimativa do CASAMENTO em reais: "um casamento em Punta Cana sai uns R$ 80-120k" / "pra 100 convidados fica em torno de R$ 90 mil".
- Dar valor por pessoa: "o ticket fica em torno de R$ 1.500/conv".
- Citar valor médio: "nossos casamentos giram entre R$ 50k e R$ 200k".

EXEMPLOS POSITIVOS (DEVE PASSAR — não marque violação):
1. "O honorário da assessoria fica entre R$ 4 mil e R$ 18 mil conforme porte, destino e complexidade."
2. "Tem dois valores separados: o honorário da Welcome (R$ 4-18k) e o custo do casamento em si, que varia bastante porque cada projeto é desenhado do zero."
3. "A gente não trabalha com pacote fechado, cada casamento é desenhado do zero — quem detalha custo do casamento com exemplos reais é a Wedding Planner na reunião."

EXEMPLOS NEGATIVOS (DEVE BLOQUEAR — marque violação):
1. "Um casamento em Maldivas pra 80 convidados sai uns R$ 100 mil."
2. "Nossos projetos ficam entre R$ 60k e R$ 200k."
3. "Pra esse seu orçamento de R$ 30k, o casamento por pessoa fica em R$ 200."
$$::TEXT)
      )
      ELSE rule
    END
  )
  FROM jsonb_array_elements(validator_rules) AS rule
)
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';
