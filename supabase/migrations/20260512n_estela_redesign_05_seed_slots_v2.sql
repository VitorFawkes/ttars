-- Popula os 4 campos novos (goal, must_include, example_questions, literal_question)
-- nos 6 slots da Sondagem da Estela. Mantém campos antigos (must_collect, questions,
-- coverage_notes) intocados pra preservar caminho legado em rollback.
--
-- Mapeamento baseado em anchor_text + must_collect + questions atuais (snapshot 2026-05-11).
-- Vitor revisa cada slot no Pipeline Studio antes de ativar feature_flag_discovery_v2.

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
              'example_questions', jsonb_build_array('E sobre o destino, já têm uma região ou país em mente?'),
              'literal_question', null
            )
        WHEN slot->>'key' = 'convidados' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber quantos convidados realmente vão comparecer (em destination wedding a taxa de presença é menor que casamento na cidade)',
              'must_include', '[]'::jsonb,
              'example_questions', jsonb_build_array('Dos convidados, quantos vocês acreditam que realmente vão? Destination wedding costuma ter taxa de presença diferente de casamento na cidade.'),
              'literal_question', null
            )
        WHEN slot->>'key' = 'investimento' THEN
          slot
            || jsonb_build_object(
              'goal', 'Saber a faixa de investimento ideal e o máximo que o casal pode investir',
              'must_include', '[]'::jsonb,
              'example_questions', jsonb_build_array('Sobre o investimento: qual é o valor que vocês desejam investir e o máximo que podem chegar?'),
              'literal_question', null
            )
        WHEN slot->>'key' = 'info_3d8u' THEN
          slot
            || jsonb_build_object(
              'goal', 'Descobrir se o casal viajou internacionalmente fora da América do Sul no último ano. Sinal de poder aquisitivo.',
              'must_include', '[]'::jsonb,
              'example_questions', jsonb_build_array('E só uma curiosidade, vocês viajaram internacionalmente esse último ano?'),
              'literal_question', null
            )
        WHEN slot->>'key' = 'info_779o' THEN
          slot
            || jsonb_build_object(
              'goal', 'Descobrir se a família vai ajudar financeiramente no casamento. Sinal de co-financiamento.',
              'must_include', '[]'::jsonb,
              'example_questions', jsonb_build_array('E sobre o investimento, é algo que vocês irão fazer por conta própria ou tem apoio da familia?'),
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
