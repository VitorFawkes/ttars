-- ============================================================================
-- MIGRATION: ai_agents colunas v2 — feature flag + identity/voice/boundaries
-- Date: 2026-05-02
--
-- Parte do Marco 2a do Playbook Conversacional v2.
--
-- Adiciona:
--   - playbook_enabled BOOLEAN: feature flag por agente. Quando true, runtime
--     executa runPersonaAgent_v2 em vez do v1. Default false → zero impacto
--     em agentes existentes (Estela, Luna, Amélia continuam em v1).
--   - identity_config JSONB: papel, missão em 1 linha, override de descrição.
--   - voice_config JSONB: tom, formalidade, emoji, regionalismos, frases típicas/proibidas.
--   - boundaries_config JSONB: linhas vermelhas globais (biblioteca ativada + custom).
--
-- Por que JSONB em vez de tabelas separadas: cada um é objeto único por
-- agente com shape conhecido e sem queries complexas. Mesmo padrão já
-- usado em handoff_signals, intelligent_decisions, prompts_extra.
-- ============================================================================

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS playbook_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS identity_config JSONB DEFAULT NULL;
-- Shape esperado:
-- {
--   "role": "SDR" | "Suporte" | "Pós-venda" | "Vendedor" | "custom",
--   "role_custom": "..." (null quando role != 'custom'),
--   "mission_one_liner": "Entende o que casais buscam e conecta com especialista",
--   "company_description_override": null | "texto que sobrepõe business_config.company_description"
-- }

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS voice_config JSONB DEFAULT NULL;
-- Shape esperado:
-- {
--   "tone_tags": ["empática","elegante","direta"],  // até 3
--   "formality": 3,  // 1-5
--   "emoji_policy": "never" | "after_rapport" | "anytime",
--   "regionalisms": {
--     "uses_a_gente": true,
--     "uses_voces_casal": true,
--     "uses_gerundio": false,
--     "casual_tu_mano": false
--   },
--   "typical_phrases": ["Que bom que você me chamou", "Minha ideia aqui é..."],
--   "forbidden_phrases": ["Prezado cliente", "Casamento dos sonhos", "Experiência premium"]
-- }

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS boundaries_config JSONB DEFAULT NULL;
-- Shape esperado:
-- {
--   "library_active": ["never_price","never_transfer_explicit","never_ai_mention"],
--     // ids de itens do catálogo frontend src/lib/playbook/boundariesLibrary.ts
--   "custom": ["Nunca usa emoji primeira mensagem", "Nunca usa clichê 'casamento dos sonhos'"]
-- }

-- Index pra busca rápida de agentes v2 ao listar
CREATE INDEX IF NOT EXISTS ai_agents_playbook_enabled_idx
  ON ai_agents(playbook_enabled, org_id)
  WHERE playbook_enabled = true;

COMMENT ON COLUMN ai_agents.playbook_enabled IS
  'Feature flag v2. true = runtime executa runPersonaAgent_v2 (ai_agent_moments + voice_config + boundaries + scoring + silent_signals + few_shot). false = v1 intocado (ai_agent_presentations + qualification_flow). Rollback = flip. Plano em /plans/voc-um-especialista-snappy-marshmallow.md.';

COMMENT ON COLUMN ai_agents.identity_config IS
  'JSONB: role, role_custom, mission_one_liner, company_description_override. Vira header do prompt v2. Preenchido via aba Playbook > Identidade.';

COMMENT ON COLUMN ai_agents.voice_config IS
  'JSONB: tone_tags, formality, emoji_policy, regionalisms, typical_phrases, forbidden_phrases. Vira bloco <voice> do prompt v2.';

COMMENT ON COLUMN ai_agents.boundaries_config IS
  'JSONB: library_active (catálogo), custom (linhas personalizadas). Vira bloco <boundaries> do prompt v2. Complementa red_lines por momento em ai_agent_moments.';
