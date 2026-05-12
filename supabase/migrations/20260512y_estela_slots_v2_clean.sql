-- Estela slots V2 — segunda iteração: enxuga objective + zera example_questions
--
-- Auditoria conceitual (12/05/2026) identificou 2 falhas raiz:
-- 1. Texto admin = instrução invariante. LLM não distingue rationale (privado)
--    de objective (privado-mas-renderizado) de example (referência de tom). Goal
--    com prosa explicativa "(porque taxa de presença é menor)" virou texto
--    verbalizado na resposta ao lead.
-- 2. example_questions com 1 item = template literal. Variância zero faz LLM
--    colapsar em cópia. Pra ser referência de tom precisa ter 3+ exemplos
--    diversos OU zero.
--
-- Fix estrutural:
-- - Goal enxuto: SÓ o objetivo, sem rationale, sem ponto final, sem parênteses.
-- - example_questions = [] em todos os 6 slots. LLM improvisa baseado em
--   goal + voice config + few_shots globais. Mais natural, sem cópia.
-- - must_include preenchido SÓ quando faz sentido como lista atômica
--   (data: ["mês","ano"]). Resto fica sem must_include — goal+voice basta.

UPDATE ai_agent_moments
SET discovery_config = jsonb_set(
  discovery_config,
  '{slots}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN slot->>'key' = 'data' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber o mês e o ano do casamento',
              'must_include', jsonb_build_array('mês', 'ano'),
              'example_questions', '[]'::jsonb,
              'literal_question', null
            )
        WHEN slot->>'key' = 'destino' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber a região ou país que o casal tem em mente pro casamento',
              'must_include', '[]'::jsonb,
              'example_questions', '[]'::jsonb,
              'literal_question', null
            )
        WHEN slot->>'key' = 'convidados' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber quantos convidados realmente vão comparecer',
              'must_include', '[]'::jsonb,
              'example_questions', '[]'::jsonb,
              'literal_question', null
            )
        WHEN slot->>'key' = 'investimento' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber a faixa ideal e o teto de investimento do casal',
              'must_include', '[]'::jsonb,
              'example_questions', '[]'::jsonb,
              'literal_question', null
            )
        WHEN slot->>'key' = 'info_3d8u' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber se o casal viajou internacionalmente fora da América do Sul no último ano',
              'must_include', '[]'::jsonb,
              'example_questions', '[]'::jsonb,
              'literal_question', null
            )
        WHEN slot->>'key' = 'info_779o' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber se a família vai ajudar financeiramente no casamento',
              'must_include', '[]'::jsonb,
              'example_questions', '[]'::jsonb,
              'literal_question', null
            )
        ELSE slot
      END
    )
    FROM jsonb_array_elements(discovery_config->'slots') AS slot
  )
)
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8'
  AND moment_key = 'sondagem';
