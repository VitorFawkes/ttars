-- ============================================================================
-- MIGRATION: Estela consolidação (V3 — fix da ordem do rename)
-- Date: 2026-05-05
--
-- Reaplicação após erros anteriores:
--   - 20260505b: tipo JSONB errado (whitelist é TEXT[])
--   - 20260505c: UNIQUE(org_id, nome) impedia renomear V3 pra "Estela" enquanto
--     V1 ainda tinha esse nome
--
-- Ordem corrigida: deletar V1/V2 ANTES do rename de V3.
-- Idempotente — se V1/V2 já foram apagadas, no-op.
-- ============================================================================

DO $$
DECLARE
  v1_id  CONSTANT UUID := 'c22fe402-2255-43e1-9d58-6ee7183dbbaa';
  v2_id  CONSTANT UUID := '9f46efff-4447-4352-aa00-9879c3a5d1cd';
  v3_id  CONSTANT UUID := '43180319-650c-490a-87be-f275550285f8';
  v3_exists BOOLEAN;
  v2_whitelist TEXT[];
BEGIN
  SELECT EXISTS(SELECT 1 FROM ai_agents WHERE id = v3_id) INTO v3_exists;
  IF NOT v3_exists THEN
    RAISE NOTICE 'V3 (%) não existe — migração no-op', v3_id;
    RETURN;
  END IF;

  -- 1. Copia whitelist da V2 pra V3 (TEXT[])
  SELECT test_mode_phone_whitelist INTO v2_whitelist
  FROM ai_agents WHERE id = v2_id;

  IF v2_whitelist IS NOT NULL AND array_length(v2_whitelist, 1) > 0 THEN
    UPDATE ai_agents
    SET test_mode_phone_whitelist = v2_whitelist,
        updated_at = NOW()
    WHERE id = v3_id;
    RAISE NOTICE 'Whitelist copiada da V2 pra V3: %', v2_whitelist;
  END IF;

  -- 2. Migra phone_line_config V2 → V3
  DELETE FROM ai_agent_phone_line_config plc_v3
  WHERE plc_v3.agent_id = v3_id
    AND plc_v3.phone_line_id IN (
      SELECT phone_line_id FROM ai_agent_phone_line_config WHERE agent_id = v2_id
    );

  UPDATE ai_agent_phone_line_config
  SET agent_id = v3_id
  WHERE agent_id = v2_id;

  RAISE NOTICE 'Phone lines da V2 migrados pra V3';

  -- 3. Migra conversas (preserva histórico)
  UPDATE ai_conversations
  SET primary_agent_id = v3_id, updated_at = NOW()
  WHERE primary_agent_id IN (v1_id, v2_id);

  UPDATE ai_conversations
  SET current_agent_id = v3_id, updated_at = NOW()
  WHERE current_agent_id IN (v1_id, v2_id);

  UPDATE ai_conversation_turns
  SET agent_id = v3_id
  WHERE agent_id IN (v1_id, v2_id);

  RAISE NOTICE 'Conversas e turnos migrados pra V3';

  -- 4. Ativa V3 (sem rename ainda — UNIQUE(org_id, nome) bloqueia)
  UPDATE ai_agents
  SET ativa = true,
      ativa_changed_at = NOW(),
      updated_at = NOW()
  WHERE id = v3_id;

  -- 5. Desativa V1 e V2 antes do delete
  UPDATE ai_agents
  SET ativa = false,
      ativa_changed_at = NOW(),
      updated_at = NOW()
  WHERE id IN (v1_id, v2_id);

  -- 6. Deleta V1 e V2 (CASCADE limpa configs auxiliares)
  DELETE FROM ai_agents WHERE id IN (v1_id, v2_id);

  RAISE NOTICE 'V1 e V2 deletadas';

  -- 7. AGORA pode renomear V3 pra "Estela" (V1 já saiu, nome livre)
  UPDATE ai_agents
  SET nome = 'Estela',
      descricao = 'SDR IA da Welcome Weddings — qualifica casais via WhatsApp e agenda reunião com a Wedding Planner.',
      updated_at = NOW()
  WHERE id = v3_id;

  RAISE NOTICE 'V3 renomeada pra "Estela". Estela única em produção.';
END $$;

-- Verificação final
DO $$
DECLARE
  estela_count INT;
BEGIN
  SELECT COUNT(*) INTO estela_count
  FROM ai_agents
  WHERE org_id = 'b0000000-0000-0000-0000-000000000002'
    AND lower(nome) LIKE '%estela%';
  RAISE NOTICE 'Estelas restantes: % (esperado 1 em prod, 0 em staging)', estela_count;
END $$;
