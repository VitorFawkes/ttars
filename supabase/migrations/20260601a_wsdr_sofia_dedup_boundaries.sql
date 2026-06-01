-- ============================================================================
-- Redesign da tela: dedup das fronteiras.
-- A lista boundaries.custom da Sofia tinha 3 itens que eram EXATAMENTE as
-- garantias de qualidade já fixas (preço fechado / inventar data / clichê) —
-- redundantes com os toggles read-only e com as linhas vermelhas hardcoded no
-- cérebro. O editor novo mostra UMA lista só ("O que a Sofia nunca faz" =
-- boundaries.comportamentos). Aqui limpamos boundaries.custom (zero perda de
-- comportamento — tudo já é garantido em outro lugar). Idempotente.
-- ============================================================================

UPDATE wsdr_agent_config
SET config = jsonb_set(config, '{boundaries,custom}', '[]'::jsonb)
WHERE slug = 'sofia-weddings'
  AND org_id = 'b0000000-0000-0000-0000-000000000002'
  AND jsonb_array_length(COALESCE(config->'boundaries'->'custom', '[]'::jsonb)) > 0;
