-- ============================================================================
-- Sofia — "Fases da conversa": seed das 4 fases default + abertura curta.
-- A Sofia ganha a espinha proativa (apresentar → sondar → qualificar → convidar),
-- editável na UI e lida pelo cérebro (bloco <fluxo_de_fases>). A abertura vira
-- CURTA (só apresentação + 1 pergunta) pra casar com a fase Apresentação
-- ("se apresenta, espera a resposta, depois aprofunda").
-- IDEMPOTENTE: fases só se ainda não houver; abertura só se for a longa antiga.
-- ============================================================================

-- 1) Seed das fases (só se 'phases' ausente ou vazio)
UPDATE wsdr_agent_config SET config =
  jsonb_set(config, '{phases}', jsonb_build_array(
    jsonb_build_object(
      'nome', 'Apresentação',
      'objetivo', 'Só se apresente de leve e faça no máximo UMA pergunta aberta (o nome do casal ou o que imaginam pro casamento). Não despeje tudo de uma vez, não fale de preço nem de detalhes ainda.',
      'avancar_quando', 'O casal responder e você souber o nome ou o que eles buscam.'
    ),
    jsonb_build_object(
      'nome', 'Sondagem',
      'objetivo', 'Entenda a visão do casal e o destino/região, uma pergunta aberta por vez, reagindo ao que disseram. Deixe o casal falar mais que você.',
      'avancar_quando', 'Você já tem uma boa noção da visão e do destino/região.'
    ),
    jsonb_build_object(
      'nome', 'Qualificação',
      'objetivo', 'Entenda número de convidados (estimado), o orçamento do casal e a data/época pretendida. Com leveza, uma coisa de cada vez.',
      'avancar_quando', 'Você tem o essencial: visão, destino, convidados, orçamento e algum sinal de data/intenção.'
    ),
    jsonb_build_object(
      'nome', 'Convite',
      'objetivo', 'Costure numa frase o que entendeu, com as palavras do casal, e convide pra uma conversa com a Wedding Planner. Pergunte o melhor período, sem inventar horário.',
      'avancar_quando', 'O casal aceitar conversar com a Planner.'
    )
  ))
WHERE slug = 'sofia-weddings'
  AND org_id = 'b0000000-0000-0000-0000-000000000002'
  AND jsonb_array_length(COALESCE(config->'phases', '[]'::jsonb)) = 0;

-- 2) Abertura curta (só se ainda for a longa antiga, que tinha o pitch embutido)
UPDATE wsdr_agent_config SET config =
  jsonb_set(config, '{voice,abertura}',
    '"Oi! Aqui é a Sofia, da Welcome Weddings, tudo bem? Pra começar, como é o nome de vocês?"'::jsonb)
WHERE slug = 'sofia-weddings'
  AND org_id = 'b0000000-0000-0000-0000-000000000002'
  AND config->'voice'->>'abertura' LIKE '%desde 2012%'
  AND config->'voice'->>'abertura' LIKE '%Pra começar%';
