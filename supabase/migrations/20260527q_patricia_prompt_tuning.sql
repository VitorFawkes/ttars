-- Tuning do prompt da Patricia (SDR Welcome Weddings) — 2026-05-27.
--
-- 1) cognitive_audit_config.audit_viability.zones — remove a 3a zona
--    "viabilidade_normal" com max_per_guest_brl=99999. Essa zona era artefato
--    de UI: o caminho normal é "omitir o flag" (fluxo normal), não emitir flag.
-- 2) voice_config.rules — remove 3 regras que duplicam o que regionalisms +
--    emoji_policy já geram automaticamente em renderVoice.

DO $$
DECLARE
  v_patricia_id UUID := '4d96d9b4-e909-4441-bd85-d3f807cccfa7';
  v_current_zones JSONB;
  v_new_zones JSONB;
  v_current_voice JSONB;
BEGIN
  -- 1) Limpa zones (remove viabilidade_normal com 99999)
  SELECT cognitive_audit_config->'audit_viability'->'zones'
  INTO v_current_zones
  FROM ai_agents
  WHERE id = v_patricia_id;

  IF v_current_zones IS NOT NULL THEN
    SELECT jsonb_agg(z)
    INTO v_new_zones
    FROM jsonb_array_elements(v_current_zones) z
    WHERE NOT (
      (z->>'label') = 'viabilidade_normal'
      OR (z->>'max_per_guest_brl')::numeric > 50000
    );

    UPDATE ai_agents
    SET cognitive_audit_config = jsonb_set(
      cognitive_audit_config,
      '{audit_viability,zones}',
      COALESCE(v_new_zones, '[]'::jsonb)
    )
    WHERE id = v_patricia_id;

    RAISE NOTICE 'Patricia zones limpas: % -> %', jsonb_array_length(v_current_zones), jsonb_array_length(COALESCE(v_new_zones, '[]'::jsonb));
  END IF;

  -- 2) Limpa voice_config.rules (remove duplicações com regionalisms + emoji_policy)
  SELECT voice_config INTO v_current_voice FROM ai_agents WHERE id = v_patricia_id;

  IF v_current_voice IS NOT NULL AND v_current_voice ? 'rules' THEN
    UPDATE ai_agents
    SET voice_config = jsonb_set(
      voice_config,
      '{rules}',
      COALESCE(
        (SELECT jsonb_agg(r)
         FROM jsonb_array_elements_text(voice_config->'rules') r
         WHERE NOT (
           lower(r::text) LIKE '%emoji%'
           OR (lower(r::text) LIKE '%a gente%' AND lower(r::text) LIKE '%nós%')
           OR (lower(r::text) LIKE '%a gente%' AND lower(r::text) LIKE '%nos%')
           OR (lower(r::text) LIKE '%vocês%' AND (lower(r::text) LIKE '%casal%' OR lower(r::text) LIKE '%parceiro%'))
           OR (lower(r::text) LIKE '%voces%' AND (lower(r::text) LIKE '%casal%' OR lower(r::text) LIKE '%parceiro%'))
         )),
        '[]'::jsonb
      )
    )
    WHERE id = v_patricia_id;

    RAISE NOTICE 'Patricia voice_config.rules deduplicado';
  END IF;
END $$;
