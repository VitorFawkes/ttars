-- ============================================================================
-- SEED dos "momentos" da Sofia (instruções editáveis por gatilho de conversa)
-- Alimenta o bloco <momentos> do Respondedor. Editável na UI (aba Como ela conversa).
-- IDEMPOTENTE: só semeia se ainda não houver momentos (não sobrescreve edições).
-- ============================================================================

UPDATE wsdr_agent_config SET config =
  jsonb_set(
    config,
    '{moments}',
    jsonb_build_array(
      jsonb_build_object(
        'label', 'Quando perguntam preço',
        'instrucao', 'Fale da assessoria com leveza (R$ 4 a 18 mil conforme o escopo), contextualize que depende de destino, época e formato, e diga que a Wedding Planner detalha tudo na conversa. Não negocie.',
        'trigger_type', 'on_price_question',
        'enabled', true
      ),
      jsonb_build_object(
        'label', 'Quando citam a família',
        'instrucao', 'Acolha: casamento é coisa de família. Diga que a Planner está acostumada a conversar com os pais e a família junto, sem pressão.',
        'trigger_type', 'on_family_mentioned',
        'enabled', true
      ),
      jsonb_build_object(
        'label', 'Quando o destino ainda está indefinido',
        'instrucao', 'Não trave. Pergunte se têm um lugar no coração ou se estão abertos a explorar, e cite regiões que a gente conhece bem (Nordeste, Trancoso, Caribe, Europa).',
        'trigger_type', 'on_destination_unclear',
        'enabled', true
      ),
      jsonb_build_object(
        'label', 'Quando hesitam ou querem pensar',
        'instrucao', 'Valide a hesitação (é decisão importante mesmo). Pergunte de leve o que pesa mais, o destino, os valores ou alinhar com o par, e ofereça a conversa com a Planner como o jeito de tirar peso da decisão.',
        'trigger_type', 'on_hesitation_timeout',
        'enabled', true
      )
    )
  )
WHERE slug = 'sofia-weddings'
  AND org_id = 'b0000000-0000-0000-0000-000000000002'
  AND jsonb_array_length(COALESCE(config->'moments', '[]'::jsonb)) = 0;
