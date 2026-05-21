-- Limpa dead weight da Patricia (4d96d9b4-e909-4441-bd85-d3f807cccfa7).
-- Texto monolítico do prompt (princípios + DIFF cognitivo + regras de gravação
-- + boundaries) agora vive em código (supabase/functions/ai-agent-router-v2/defaults/*.ts).
-- O banco mantém SOMENTE parâmetros editáveis pelo admin:
--   - toggles ON/OFF de auditorias cognitivas
--   - zonas + cotações de viabilidade
--   - brand_active (quais boundaries de marca aplicar)
--   - competitors_to_avoid (chips de concorrentes)
--   - auto_handoff_invisible (threshold, window, enabled)
-- Decisão tomada em 2026-05-21 após auditoria — ver docs/patricia-prompt-ideal-v3.md.
--
-- Antes desta migration, Patricia rodava com mistura de:
--   (a) configs NOVAS fragmentadas (12 principles + 5 routines + 8 data_update_rules)
--   (b) configs LEGADAS monolíticas (principles_text 9.6k + prompts_extra.context 2.5k + .data_update 3.3k)
-- (a) ganhava, mas (b) ficava como dead weight no banco gerando confusão.
-- Agora: (a) e (b) saem do banco; texto canônico vive no código.

-- ============================================================================
-- 1. principles[] (NOVO fragmentado) + principles_text (LEGADO monolítico)
--    Texto canônico vive em patricia_principles.ts.
-- ============================================================================
UPDATE ai_agents
SET identity_config = identity_config - 'principles' - 'principles_text'
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

-- ============================================================================
-- 2. prompts_extra.context (LEGADO DIFF COGNITIVO de 2.517 chars)
--    + prompts_extra.data_update (LEGADO regras de gravação de 3.312 chars)
--    Texto canônico vive em patricia_diff_cognitivo.ts e patricia_data_update_rules.ts.
--    Mantemos prompts_extra.validator e .formatting (não foram afetados).
-- ============================================================================
UPDATE ai_agents
SET prompts_extra = prompts_extra - 'context' - 'data_update'
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

-- ============================================================================
-- 3. data_update_rules (NOVO fragmentado em 8 items)
--    Texto canônico vive em patricia_data_update_rules.ts.
--    Coluna tem NOT NULL constraint → seta array vazio em vez de NULL.
-- ============================================================================
UPDATE ai_agents
SET data_update_rules = '[]'::jsonb
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

-- ============================================================================
-- 4. tool_descriptions — DEFAULT_TOOL_DESCRIPTIONS hardcoded é a fonte.
--    Patricia já tinha vazio, mas garantimos.
-- ============================================================================
UPDATE ai_agents
SET tool_descriptions = '{}'::jsonb
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

-- ============================================================================
-- 5. boundaries_config — substitui formato legacy (library_active de 16 IDs +
--    custom + custom_by_category + by_category) por formato novo simples
--    (brand_active de até 7 IDs + competitors_to_avoid de chips).
--    Quando brand_active = NULL ou ausente, código usa default_active dos 7
--    boundaries de marca em patricia_boundaries.ts (todos ON).
--    Os outros 11 "nuncas" técnicos viraram Grupo B (PATRICIA_DESIGN_BOUNDARIES),
--    hardcoded e invisíveis pro admin.
-- ============================================================================
UPDATE ai_agents
SET boundaries_config = (
  COALESCE(boundaries_config, '{}'::jsonb)
  - 'library_active'
  - 'custom'
  - 'custom_by_category'
  - 'by_category'
)
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

-- ============================================================================
-- 6. cognitive_audit_config — mantém SOMENTE parâmetros editáveis pelo admin.
--    Remove a chave 'instruction' de cada routine (era textarea, violava regra
--    "UI nunca expõe textão de prompt"). Texto canônico vive em código.
--    Mantém:
--      - .enabled por routine (5 toggles que admin controla)
--      - .audit_viability.zones + .currency_rates + .budget_field + .guests_field
--    Remove:
--      - .instruction de cada routine
--      - .detect_pitch_saturation.pitch_keywords / .window_turns / .threshold
--        (não suportado mais — params hardcoded em ROUTINE_TEXTS)
-- ============================================================================
UPDATE ai_agents
SET cognitive_audit_config = (
  COALESCE(cognitive_audit_config, '{}'::jsonb)
)
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

DO $$
DECLARE
  v_cfg jsonb;
  v_new_cfg jsonb := '{}'::jsonb;
  v_routine jsonb;
  v_key text;
BEGIN
  SELECT cognitive_audit_config INTO v_cfg
  FROM ai_agents WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';

  IF v_cfg IS NULL THEN
    -- Sem config: deixa como está (defaults do código rodam tudo ON)
    RETURN;
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(v_cfg)
  LOOP
    v_routine := v_cfg->v_key;
    IF v_key = 'audit_viability' THEN
      v_new_cfg := v_new_cfg || jsonb_build_object(v_key, jsonb_strip_nulls(
        jsonb_build_object(
          'enabled', COALESCE(v_routine->'enabled', 'true'::jsonb),
          'zones', v_routine->'zones',
          'currency_rates', v_routine->'currency_rates',
          'budget_field', v_routine->'budget_field',
          'guests_field', v_routine->'guests_field'
        )
      ));
    ELSE
      v_new_cfg := v_new_cfg || jsonb_build_object(v_key, jsonb_build_object(
        'enabled', COALESCE(v_routine->'enabled', 'true'::jsonb)
      ));
    END IF;
  END LOOP;

  UPDATE ai_agents SET cognitive_audit_config = v_new_cfg
  WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';
END $$;

-- ============================================================================
-- Verificação manual (rodar depois da migration pra confirmar):
--
-- SELECT
--   length(coalesce(identity_config->>'principles_text','')) AS legado_principles, -- esperado 0
--   jsonb_array_length(coalesce(identity_config->'principles','[]'::jsonb)) AS novo_principles, -- esperado 0
--   length(coalesce(prompts_extra->>'context','')) AS legado_context, -- esperado 0
--   length(coalesce(prompts_extra->>'data_update','')) AS legado_data_update, -- esperado 0
--   jsonb_array_length(coalesce(data_update_rules,'[]'::jsonb)) AS data_update_rules_count, -- esperado 0
--   tool_descriptions, -- esperado {}
--   boundaries_config, -- esperado {} (ou só com brand_active/competitors quando admin configurar)
--   cognitive_audit_config -- esperado só com toggles + audit_viability params (sem .instruction)
-- FROM ai_agents WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7';
-- ============================================================================
