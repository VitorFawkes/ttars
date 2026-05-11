-- Fix Estela: slot "Viagens Internacionais" da Sondagem caía em deriveSlotQuestion()
-- e gerava pergunta gramaticalmente quebrada porque must_collect tinha frase
-- descritiva ("Saber se viajou...") em vez de lista atômica de substantivos.
-- O LLM (gpt-5.1) tentava reformular e alucinava "Só pra eu entender a sua pergunta..."
-- Conserto: popular questions[] com pergunta natural — isso pula deriveSlotQuestion.
-- Evidência completa: conversa b60b3e0f-05f3-4b04-b61b-c2bc0ea3fc66, turn 73167143

UPDATE ai_agent_moments
SET discovery_config = jsonb_set(
  discovery_config,
  '{slots}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN slot->>'key' = 'info_3d8u' THEN
          jsonb_set(slot, '{questions}', '["E só uma curiosidade, vocês viajaram internacionalmente esse último ano?"]'::jsonb)
        ELSE slot
      END
    )
    FROM jsonb_array_elements(discovery_config->'slots') AS slot
  )
)
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8'
  AND moment_key = 'sondagem';
