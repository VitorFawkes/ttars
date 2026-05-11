-- ============================================================================
-- MIGRATION: ai_agent_moments — kind (flow/play) + discovery_config (slots)
-- Date: 2026-04-25
--
-- Refinamento do Playbook v2 baseado em conversa com o Vitor (2026-04-25):
-- a UI de "Momentos da conversa" estava misturando dois conceitos diferentes:
--
--   1) FASES DO FUNIL (flow)        — Abertura, Sondagem, Desfecho qualificado,
--      sequenciais, ordem importa,    Desfecho não qualificado
--      lead progride por elas
--
--   2) JOGADAS SITUACIONAIS (play)  — Objeção de preço, Lua de mel junto
--      disparam por gatilho dentro    (palavras-chave) e voltam pra fase atual
--      de qualquer fase, ordem
--      irrelevante
--
-- Esta migration adiciona a coluna `kind` pra separar conceitualmente, e o
-- backfill marca os momentos atuais conforme trigger_type.
--
-- Adiciona também `discovery_config` JSONB pra fases de Sondagem armazenarem
-- a lista de "informações a coletar" (slots) — cada slot tem rótulo, ícone,
-- flag obrigatório, perguntas escritas (opcional, agente improvisa se vazio)
-- e ligação opcional a um campo do CRM.
--
-- Não destrutivo. Reversível. Zero impacto no runtime atual (kind é apenas
-- metadado pra UI/render; discovery_config é opcional e null pra todos).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Coluna `kind` pra separar fase do funil de jogada situacional
-- ---------------------------------------------------------------------------

ALTER TABLE ai_agent_moments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'flow'
    CHECK (kind IN ('flow', 'play'));

CREATE INDEX IF NOT EXISTS ai_agent_moments_kind_idx
  ON ai_agent_moments(agent_id, kind, display_order);

COMMENT ON COLUMN ai_agent_moments.kind IS
  'flow = fase do funil (sequencial, ordem importa, lead progride). play = jogada situacional (interrupção, dispara por gatilho dentro de qualquer fase, ordem irrelevante). UI separa os dois em listas distintas.';

-- ---------------------------------------------------------------------------
-- 2. Coluna `discovery_config` pra armazenar slots da Sondagem
-- ---------------------------------------------------------------------------

ALTER TABLE ai_agent_moments
  ADD COLUMN IF NOT EXISTS discovery_config JSONB;

COMMENT ON COLUMN ai_agent_moments.discovery_config IS
  'Configuração de slots da fase de Sondagem (Discovery). Shape: {slots: [{key, label, icon, required, questions[], crm_field_key}]}. Null para fases que não são de descoberta. Cada slot pode ter perguntas escritas (agente usa) ou ficar vazio (agente improvisa baseado em key/label).';

-- ---------------------------------------------------------------------------
-- 3. Backfill: marcar como 'play' os momentos cujo trigger é keyword
--    (objeção de preço, lua de mel junto, pedido de humano, etc.)
-- ---------------------------------------------------------------------------

UPDATE ai_agent_moments
   SET kind = 'play'
 WHERE trigger_type = 'keyword'
   AND kind = 'flow';  -- só atualiza linhas que ainda estão no default

-- Os demais (primeiro_contato, lead_respondeu, score_threshold, always, custom)
-- ficam como 'flow' (default), refletindo que são fases sequenciais do funil.

-- ---------------------------------------------------------------------------
-- 4. CHECK constraint: discovery_config só pode estar populado em fases
--    (kind = 'flow'). Jogadas situacionais não têm slots de descoberta.
-- ---------------------------------------------------------------------------

ALTER TABLE ai_agent_moments
  ADD CONSTRAINT ai_agent_moments_discovery_only_in_flow
  CHECK (discovery_config IS NULL OR kind = 'flow');

-- ---------------------------------------------------------------------------
-- 5. Comments de auditoria
-- ---------------------------------------------------------------------------

COMMENT ON CONSTRAINT ai_agent_moments_discovery_only_in_flow ON ai_agent_moments IS
  'discovery_config só faz sentido em fases (kind=flow). Jogadas situacionais (kind=play) respondem a gatilhos sem coletar info estruturada.';
