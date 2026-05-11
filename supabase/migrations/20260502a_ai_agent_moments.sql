-- ============================================================================
-- MIGRATION: ai_agent_moments — momentos configuráveis do Playbook Conversacional v2
-- Date: 2026-05-02
--
-- Parte do Marco 2a do projeto Playbook Conversacional v2 (plano aprovado
-- em 2026-04-24 em /plans/voc-um-especialista-snappy-marshmallow.md).
--
-- Cada linha representa um "momento" da conversa (abertura, sondagem,
-- objeção_preço, desfecho, etc.) com frase-âncora configurável, regras
-- de detecção (trigger) e linhas vermelhas específicas daquele momento.
--
-- A runtime v2 (runPersonaAgent_v2) detecta qual momento ativar em cada
-- turno usando detecção híbrida: determinística primeiro (trigger_type),
-- LLM fallback (backoffice classifica), last_moment como último recurso.
--
-- Só aplicada quando ai_agents.playbook_enabled=true. Zero impacto no v1.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_agent_moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,

  -- Identificação
  moment_key TEXT NOT NULL,        -- slug: 'abertura', 'sondagem', 'objecao_preco'
  moment_label TEXT NOT NULL,      -- rótulo humano: "Abertura"
  display_order INT NOT NULL,

  -- Detecção: quando este momento é ativo
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('primeiro_contato','lead_respondeu','keyword','score_threshold','always','custom')),
  trigger_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- primeiro_contato: {}
  -- lead_respondeu: {} (usa ctx.lead_replied_now)
  -- keyword: {"keywords": ["preço","quanto custa","valor"]}
  -- score_threshold: {"operator": "gte", "value": 25}
  -- always: {}
  -- custom: {"expression": "..."} — reservado pra v2.1, ignorado no v2.0

  -- Como a IA deve responder neste momento
  message_mode TEXT NOT NULL DEFAULT 'faithful'
    CHECK (message_mode IN ('literal','faithful','free')),
  anchor_text TEXT,  -- frase-âncora (literal/faithful) ou descrição do objetivo (free)

  -- Linhas vermelhas específicas deste momento (array de strings curtas)
  red_lines TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Campos do CRM que este momento coleta (referência a system_fields.key)
  collects_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  enabled BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agent_id, moment_key),

  -- Conteúdo coerente com o modo
  CHECK (
    (message_mode IN ('literal','faithful') AND anchor_text IS NOT NULL AND length(trim(anchor_text)) > 0)
    OR (message_mode = 'free')
  )
);

-- Nota: NÃO colocar UNIQUE em (agent_id, display_order) porque reordenação
-- via drag-and-drop precisa swap temporário. Usar trigger pra compactar ordem
-- ao deletar linha (implementado em migration 20260502b ou via hook frontend).

CREATE INDEX IF NOT EXISTS ai_agent_moments_agent_order_idx
  ON ai_agent_moments(agent_id, display_order);

-- Trigger updated_at (padrão do projeto)
CREATE OR REPLACE FUNCTION trg_ai_agent_moments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_agent_moments_set_updated_at ON ai_agent_moments;
CREATE TRIGGER ai_agent_moments_set_updated_at
  BEFORE UPDATE ON ai_agent_moments
  FOR EACH ROW EXECUTE FUNCTION trg_ai_agent_moments_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: herda org do agente pai (mesmo padrão de ai_agent_presentations)
-- ---------------------------------------------------------------------------

ALTER TABLE ai_agent_moments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_moments_select" ON ai_agent_moments;
CREATE POLICY "ai_moments_select" ON ai_agent_moments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ai_agents a
    WHERE a.id = ai_agent_moments.agent_id
      AND a.org_id = requesting_org_id()
  ));

DROP POLICY IF EXISTS "ai_moments_insert" ON ai_agent_moments;
CREATE POLICY "ai_moments_insert" ON ai_agent_moments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM ai_agents a
    WHERE a.id = ai_agent_moments.agent_id
      AND a.org_id = requesting_org_id()
  ));

DROP POLICY IF EXISTS "ai_moments_update" ON ai_agent_moments;
CREATE POLICY "ai_moments_update" ON ai_agent_moments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ai_agents a
    WHERE a.id = ai_agent_moments.agent_id
      AND a.org_id = requesting_org_id()
  ));

DROP POLICY IF EXISTS "ai_moments_delete" ON ai_agent_moments;
CREATE POLICY "ai_moments_delete" ON ai_agent_moments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM ai_agents a
    WHERE a.id = ai_agent_moments.agent_id
      AND a.org_id = requesting_org_id()
  ));

DROP POLICY IF EXISTS "ai_moments_service" ON ai_agent_moments;
CREATE POLICY "ai_moments_service" ON ai_agent_moments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ai_agent_moments TO authenticated;
GRANT ALL ON ai_agent_moments TO service_role;

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE ai_agent_moments IS
  'Momentos da conversa do Playbook v2. Cada linha = fase configurável com frase-âncora, trigger de detecção e linhas vermelhas. Consumida por runPersonaAgent_v2 no ai-agent-router quando ai_agents.playbook_enabled=true. Ver /plans/voc-um-especialista-snappy-marshmallow.md.';

COMMENT ON COLUMN ai_agent_moments.trigger_type IS
  'primeiro_contato: só no primeiro turno. lead_respondeu: ctx.lead_replied_now=true. keyword: trigger_config.keywords bate no conteúdo. score_threshold: qualification_score atinge valor. always: sempre elegível (fallback). custom: reservado v2.1.';

COMMENT ON COLUMN ai_agent_moments.message_mode IS
  'literal: IA responde EXATAMENTE anchor_text (só substitui variáveis). faithful: segue estrutura/conteúdo obrigatório, adapta nome e pequenas palavras. free: tem liberdade, anchor_text vira descrição do objetivo.';

COMMENT ON COLUMN ai_agent_moments.red_lines IS
  'Lista de coisas que a IA NUNCA faz neste momento específico. Complementa ai_agents.boundaries_config (linhas vermelhas globais).';

COMMENT ON COLUMN ai_agent_moments.collects_fields IS
  'Array de keys de system_fields que este momento tem como objetivo coletar. Usado pra formatar bloco <qualification_status> no prompt dinâmico.';
