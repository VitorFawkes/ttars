-- ============================================================================
-- BACKFILL: card_created applicable_stage_ids
-- ============================================================================
-- O editor visual de automacoes gravava o filtro de etapa em
-- event_config.initial_stage_id (string), mas o dispatcher SQL
-- process_cadence_entry_on_card_create filtra pela coluna applicable_stage_ids
-- (UUID[]). Resultado: filtro era ignorado e a automacao disparava pra TODOS
-- os cards novos.
--
-- O fix do editor (commit que acompanha esta migration) passa a gravar
-- applicable_stage_ids corretamente. Esta migration roda o backfill pras
-- automacoes ja criadas com o bug, copiando o valor do JSONB pra coluna.
-- ============================================================================

UPDATE cadence_event_triggers
SET applicable_stage_ids = ARRAY[(event_config->>'initial_stage_id')::UUID]
WHERE event_type = 'card_created'
  AND (applicable_stage_ids IS NULL OR array_length(applicable_stage_ids, 1) IS NULL)
  AND event_config ? 'initial_stage_id'
  AND event_config->>'initial_stage_id' IS NOT NULL
  AND event_config->>'initial_stage_id' <> '';

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM cadence_event_triggers
    WHERE event_type = 'card_created'
      AND applicable_stage_ids IS NOT NULL
      AND array_length(applicable_stage_ids, 1) > 0;
    RAISE NOTICE 'card_created triggers com applicable_stage_ids preenchido apos backfill: %', v_count;
END $$;
