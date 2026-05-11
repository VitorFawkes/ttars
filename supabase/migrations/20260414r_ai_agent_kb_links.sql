-- ============================================================================
-- C1 - Nova tabela ai_agent_kb_links (N:N agente ↔ knowledge base)
-- ============================================================================
-- Permite que cada agente use múltiplas knowledge bases
-- e controle o compartilhamento entre agentes da conta

CREATE TABLE IF NOT EXISTS ai_agent_kb_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  kb_id UUID NOT NULL REFERENCES ai_knowledge_bases(id) ON DELETE CASCADE,

  -- Se true, outros agentes da account podem usar esta KB também
  shared_with_account BOOLEAN NOT NULL DEFAULT false,

  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(agent_id, kb_id)
);

CREATE INDEX idx_ai_agent_kb_links_agent ON ai_agent_kb_links(agent_id);
CREATE INDEX idx_ai_agent_kb_links_kb ON ai_agent_kb_links(kb_id);
CREATE INDEX idx_ai_agent_kb_links_org ON ai_agent_kb_links(org_id);

ALTER TABLE ai_agent_kb_links ENABLE ROW LEVEL SECURITY;

-- Selects: usuário vê links se consegue ver o agente na sua org
CREATE POLICY "ai_agent_kb_links_select" ON ai_agent_kb_links FOR SELECT TO authenticated
  USING (org_id = requesting_org_id());

-- Inserts: usuário cria link se consegue editar o agente na sua org
CREATE POLICY "ai_agent_kb_links_insert" ON ai_agent_kb_links FOR INSERT TO authenticated
  WITH CHECK (
    org_id = requesting_org_id()
    AND EXISTS (SELECT 1 FROM ai_agents WHERE id = agent_id AND org_id = requesting_org_id())
    AND EXISTS (SELECT 1 FROM ai_knowledge_bases WHERE id = kb_id AND org_id = requesting_org_id())
  );

-- Updates: usuário edita link se consegue editar o agente
CREATE POLICY "ai_agent_kb_links_update" ON ai_agent_kb_links FOR UPDATE TO authenticated
  USING (org_id = requesting_org_id());

-- Deletes: usuário deleta link se consegue editar o agente
CREATE POLICY "ai_agent_kb_links_delete" ON ai_agent_kb_links FOR DELETE TO authenticated
  USING (org_id = requesting_org_id());

-- Service role: acesso total
CREATE POLICY "ai_agent_kb_links_service" ON ai_agent_kb_links FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE ai_agent_kb_links IS
'Relação N:N entre agentes IA e suas knowledge bases.
Cada agente pode usar múltiplas KBs. Se shared_with_account=true, a KB é visible para outros agentes da account.';
