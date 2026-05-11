-- ============================================================================
-- MIGRATION: ai_agent_presentations — apresentação configurável por cenário
-- Date: 2026-04-23
--
-- Hoje a apresentação do agente IA está espalhada: header hardcoded no
-- personaPrompt ("Voce e {nome}, {persona} da {company_name}"),
-- first_message_config (JSONB em ai_agents) só para outbound,
-- e regra negativa ("se primeiro contato, NAO se apresente") no prompt.
-- O admin não tem controle por cenário e fica forçado a editar system_prompt
-- à mão. Esta migration cria uma tabela dedicada a apresentações por
-- (agente × cenário), com modo 'fixed' (template com variáveis) ou
-- 'concept' (diretriz livre que a IA parafrasea).
--
-- V1 cobre os 2 cenários de abertura de conversa:
--   - first_contact_inbound  → lead chega do zero pelo WhatsApp
--   - first_contact_outbound_form → agente aborda pós-formulário
-- Futuros cenários (retomada, pós-qualificação, transição) entram no CHECK.
--
-- Também migra dados existentes de ai_agents.first_message_config para a
-- nova tabela, sem apagar o JSONB (dormant) — limpeza definitiva em marco
-- futuro depois de confirmar que ninguém mais lê.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_agent_presentations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,

  -- Cenário fixo (enum fechada — cada valor tem ponto de consumo no runtime).
  scenario TEXT NOT NULL CHECK (scenario IN (
    'first_contact_inbound',
    'first_contact_outbound_form'
  )),

  -- Modo: texto fixo com variáveis OU diretriz livre que a IA parafrasea.
  mode TEXT NOT NULL CHECK (mode IN ('fixed', 'concept')),

  -- fixed_template: usado quando mode='fixed'. Suporta:
  --   {{contact_name}}, {{agent_name}}, {{company_name}}, {{form_field:<slug>}}
  fixed_template TEXT,

  -- concept_text: usado quando mode='concept'. Texto em linguagem natural
  -- que a IA usa como diretriz. Mantém tom/persona do agente e adapta ao
  -- contexto do lead.
  concept_text TEXT,

  enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agent_id, scenario),

  -- Garante que o conteúdo coerente com o modo está preenchido.
  CHECK (
    (mode = 'fixed' AND fixed_template IS NOT NULL AND length(trim(fixed_template)) > 0)
    OR
    (mode = 'concept' AND concept_text IS NOT NULL AND length(trim(concept_text)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS ai_agent_presentations_agent_idx
  ON ai_agent_presentations(agent_id);

-- Trigger de updated_at (padrão do projeto)
CREATE OR REPLACE FUNCTION trg_ai_agent_presentations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_agent_presentations_set_updated_at ON ai_agent_presentations;
CREATE TRIGGER ai_agent_presentations_set_updated_at
  BEFORE UPDATE ON ai_agent_presentations
  FOR EACH ROW EXECUTE FUNCTION trg_ai_agent_presentations_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: mesmo padrão de ai_agent_special_scenarios — herda org do agente pai.
-- ---------------------------------------------------------------------------

ALTER TABLE ai_agent_presentations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_presentations_select" ON ai_agent_presentations;
CREATE POLICY "ai_presentations_select" ON ai_agent_presentations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ai_agents a
    WHERE a.id = ai_agent_presentations.agent_id
      AND a.org_id = requesting_org_id()
  ));

DROP POLICY IF EXISTS "ai_presentations_insert" ON ai_agent_presentations;
CREATE POLICY "ai_presentations_insert" ON ai_agent_presentations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM ai_agents a
    WHERE a.id = ai_agent_presentations.agent_id
      AND a.org_id = requesting_org_id()
  ));

DROP POLICY IF EXISTS "ai_presentations_update" ON ai_agent_presentations;
CREATE POLICY "ai_presentations_update" ON ai_agent_presentations
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ai_agents a
    WHERE a.id = ai_agent_presentations.agent_id
      AND a.org_id = requesting_org_id()
  ));

DROP POLICY IF EXISTS "ai_presentations_delete" ON ai_agent_presentations;
CREATE POLICY "ai_presentations_delete" ON ai_agent_presentations
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ai_agents a
    WHERE a.id = ai_agent_presentations.agent_id
      AND a.org_id = requesting_org_id()
  ));

DROP POLICY IF EXISTS "ai_presentations_service" ON ai_agent_presentations;
CREATE POLICY "ai_presentations_service" ON ai_agent_presentations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_agent_presentations TO authenticated;
GRANT ALL ON ai_agent_presentations TO service_role;

-- ---------------------------------------------------------------------------
-- Migração de dados: first_message_config → ai_agent_presentations
-- ---------------------------------------------------------------------------
-- first_message_config (JSONB) em ai_agents tinha o shape:
--   { type: 'fixed' | 'ai_generated', fixed_template?, ai_instructions?, delay_seconds? }
-- Mapeamento:
--   type='fixed' + fixed_template     → mode='fixed', fixed_template=<original>
--   type='ai_generated' + ai_instr.   → mode='concept', concept_text=<ai_instructions>
-- Não migra linhas com conteúdo vazio (respeita CHECK).
-- ---------------------------------------------------------------------------

INSERT INTO ai_agent_presentations (agent_id, scenario, mode, fixed_template, concept_text, enabled)
SELECT
  a.id,
  'first_contact_outbound_form',
  CASE (a.first_message_config->>'type')
    WHEN 'fixed' THEN 'fixed'
    WHEN 'ai_generated' THEN 'concept'
  END AS mode,
  CASE (a.first_message_config->>'type')
    WHEN 'fixed' THEN NULLIF(trim(a.first_message_config->>'fixed_template'), '')
    ELSE NULL
  END AS fixed_template,
  CASE (a.first_message_config->>'type')
    WHEN 'ai_generated' THEN NULLIF(trim(a.first_message_config->>'ai_instructions'), '')
    ELSE NULL
  END AS concept_text,
  true
FROM ai_agents a
WHERE a.first_message_config IS NOT NULL
  AND (a.first_message_config->>'type') IN ('fixed', 'ai_generated')
  AND (
    ((a.first_message_config->>'type') = 'fixed'
     AND length(trim(coalesce(a.first_message_config->>'fixed_template', ''))) > 0)
    OR
    ((a.first_message_config->>'type') = 'ai_generated'
     AND length(trim(coalesce(a.first_message_config->>'ai_instructions', ''))) > 0)
  )
ON CONFLICT (agent_id, scenario) DO NOTHING;

COMMENT ON TABLE ai_agent_presentations IS
  'Apresentação configurável do agente IA por cenário. V1: first_contact_inbound + first_contact_outbound_form. Consumida em ai-agent-router (buildPersonaPrompt) e ai-agent-outbound-trigger. Substitui first_message_config (dormant).';

COMMENT ON COLUMN ai_agent_presentations.mode IS
  'fixed: fixed_template é enviado literal com vars substituídas. concept: concept_text é diretriz que a IA parafrasea mantendo persona/tom.';

COMMENT ON COLUMN ai_agent_presentations.fixed_template IS
  'Template de texto fixo. Variáveis: {{contact_name}}, {{agent_name}}, {{company_name}}, {{form_field:<slug>}}. Vars não resolvidas viram string vazia.';

COMMENT ON COLUMN ai_agent_presentations.concept_text IS
  'Diretriz em linguagem natural. IA usa como base para compor mensagem no tom/persona do agente. Não cite "diretriz" ou "instrução" na saída.';
