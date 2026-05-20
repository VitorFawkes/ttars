-- AI Agent V2 — marca 3 colunas como DEPRECATED (não removidas).
--
-- Estes 3 campos vivem em ai_agents mas o engine V2 (ai-agent-router-v2)
-- não lê nenhum deles. Auditoria estática rigorosa em 2026-05-20 confirmou:
-- só aparecem no SELECT do agente, nunca em prompt ou condicional.
--
-- 1. intelligent_decisions — 12 "decisões inteligentes" curadas pelo admin
--    com texto rico, mas o V2 ignora completamente. Conteúdo equivalente
--    vive nos Princípios de caráter (identity_config.principles_text) +
--    no cérebro analítico (prompts_extra.context).
--
-- 2. context_fields_config — visible_fields / updatable_fields /
--    evidence_level. Era usado no engine V1 (Luna). Quem decide campos
--    atualizáveis hoje é ai_agent_business_config.auto_update_fields.
--
-- 3. handoff_signals — 11 sinais com toggle on/off. V2 ignora.
--    O auto-handoff é controlado por handoff_actions.auto_handoff_invisible
--    (block_threshold + window_turns).
--
-- NÃO dropamos as colunas porque:
--   - Layout antigo (TabDecisoes, TabContextoCampos, TabHandoff legacy)
--     ainda lê/grava (usuários com toggle "voltar p/ layout antigo")
--   - Engine V1 (ai-agent-router, sem -v2) ainda usa em outros agentes
--   - Wizard de criação (ai-agent-from-wizard) ainda popula
--   - DROP COLUMN forçaria refatorar 17 arquivos paralelos
--
-- Quando layout antigo + V1 forem totalmente desmontados, dropar essas
-- colunas em migration de cleanup dedicada.

COMMENT ON COLUMN public.ai_agents.intelligent_decisions IS
  'DEPRECATED 2026-05-20 — engine V2 (ai-agent-router-v2) ignora. Conteúdo equivalente em identity_config.principles_text + prompts_extra.context. Mantido por compat com layout antigo e engine V1.';

COMMENT ON COLUMN public.ai_agents.context_fields_config IS
  'DEPRECATED 2026-05-20 — engine V2 ignora. Quem decide campos atualizáveis é ai_agent_business_config.auto_update_fields/contact_update_fields. Mantido por compat.';

COMMENT ON COLUMN public.ai_agents.handoff_signals IS
  'DEPRECATED 2026-05-20 — engine V2 ignora os 11 toggles. Auto-handoff é controlado por handoff_actions.auto_handoff_invisible (block_threshold + window_turns). Mantido por compat com layout antigo.';
