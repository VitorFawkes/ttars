-- 20260508a_patricia_engine_and_clone.sql
--
-- Adiciona coluna `engine` em ai_agents (multi_agent_pipeline | single_agent_v2)
-- e função clone_agent(source_id, new_name, new_engine) que duplica um agente
-- inteiro (row + 11 tabelas filhas + KB com embeddings) numa transação atômica.
--
-- Default 'multi_agent_pipeline' preserva comportamento de TODOS os agentes
-- existentes (Estela, Luna, Amélia, etc) — nenhum precisa ser tocado.

-- ============================================================================
-- 1. Coluna engine
-- ============================================================================

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS engine TEXT NOT NULL
    DEFAULT 'multi_agent_pipeline'
    CHECK (engine IN ('multi_agent_pipeline', 'single_agent_v2'));

CREATE INDEX IF NOT EXISTS idx_ai_agents_engine
  ON ai_agents(engine) WHERE ativa = true;

COMMENT ON COLUMN ai_agents.engine IS
  'Pipeline de execução do agente: multi_agent_pipeline (default, ai-agent-router 5-step) ou single_agent_v2 (ai-agent-router-v2, single-agent + brand validator).';

-- ============================================================================
-- 2. Função clone_agent
-- ============================================================================
--
-- Copia row de ai_agents + tabelas filhas pertencentes ao agente.
-- Retorna o id do novo agente.
--
-- Forçado:
--   - ativa = false (admin precisa ativar manualmente depois)
--   - engine = parâmetro
--   - nome = parâmetro
--   - id = novo UUID
--   - created_at/updated_at = NOW()
--   - ativa_changed_at/ativa_changed_by = NULL
--
-- Tabelas copiadas (todas via to_jsonb + jsonb_populate_record pra robustez
-- contra adição de colunas):
--   ai_agents (1)
--   ai_agent_business_config (1:1)
--   ai_agent_qualification_flow (1:N)
--   ai_agent_special_scenarios (1:N)
--   ai_agent_skills (1:N)
--   ai_agent_scoring_config (1:1)
--   ai_agent_scoring_rules (1:N)
--   ai_agent_moments (1:N)
--   ai_agent_few_shot_examples (1:N)
--   ai_agent_silent_signals (1:N)
--   ai_agent_presentations (1:N)
--   ai_knowledge_bases + ai_knowledge_base_items (cópia física com embeddings)
--   ai_agent_kb_links (linka novo agent às novas KBs)
--
-- NÃO copia:
--   ai_agent_phone_line_config (vinculação manual a outra linha)
--   ai_conversations / ai_messages (Patricia começa do zero)
--   validator_rules (já está dentro do JSONB de ai_agents)

CREATE OR REPLACE FUNCTION clone_agent(
  p_source_agent_id UUID,
  p_new_name TEXT,
  p_new_engine TEXT DEFAULT 'single_agent_v2'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_agent_id UUID := gen_random_uuid();
  v_source_org_id UUID;
  v_kb_record RECORD;
  v_new_kb_id UUID;
BEGIN
  -- Validar que o agente fonte existe
  SELECT org_id INTO v_source_org_id
  FROM ai_agents
  WHERE id = p_source_agent_id;

  IF v_source_org_id IS NULL THEN
    RAISE EXCEPTION 'Agente fonte não encontrado: %', p_source_agent_id;
  END IF;

  -- Validar engine
  IF p_new_engine NOT IN ('multi_agent_pipeline', 'single_agent_v2') THEN
    RAISE EXCEPTION 'Engine inválido: %. Use multi_agent_pipeline ou single_agent_v2.', p_new_engine;
  END IF;

  -- ===========================================================================
  -- 2.1. Clonar ai_agents (row principal)
  -- ===========================================================================
  INSERT INTO ai_agents
  SELECT (jsonb_populate_record(
    NULL::ai_agents,
    to_jsonb(a)
      - 'created_at' - 'updated_at'
      - 'ativa_changed_at' - 'ativa_changed_by'
      || jsonb_build_object(
        'id', v_new_agent_id,
        'nome', p_new_name,
        'engine', p_new_engine,
        'ativa', false,
        'system_prompt_version', 1
      )
  )).*
  FROM ai_agents a
  WHERE a.id = p_source_agent_id;

  -- ===========================================================================
  -- 2.2. Clonar ai_agent_business_config (1:1)
  -- ===========================================================================
  INSERT INTO ai_agent_business_config
  SELECT (jsonb_populate_record(
    NULL::ai_agent_business_config,
    to_jsonb(b)
      - 'created_at' - 'updated_at'
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id
      )
  )).*
  FROM ai_agent_business_config b
  WHERE b.agent_id = p_source_agent_id;

  -- ===========================================================================
  -- 2.3. Clonar ai_agent_qualification_flow (1:N)
  -- ===========================================================================
  INSERT INTO ai_agent_qualification_flow
  SELECT (jsonb_populate_record(
    NULL::ai_agent_qualification_flow,
    to_jsonb(q)
      - 'created_at' - 'updated_at'
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id
      )
  )).*
  FROM ai_agent_qualification_flow q
  WHERE q.agent_id = p_source_agent_id;

  -- ===========================================================================
  -- 2.4. Clonar ai_agent_special_scenarios (1:N)
  -- ===========================================================================
  INSERT INTO ai_agent_special_scenarios
  SELECT (jsonb_populate_record(
    NULL::ai_agent_special_scenarios,
    to_jsonb(s)
      - 'created_at' - 'updated_at'
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id
      )
  )).*
  FROM ai_agent_special_scenarios s
  WHERE s.agent_id = p_source_agent_id;

  -- ===========================================================================
  -- 2.5. Clonar ai_agent_skills (1:N)
  -- ===========================================================================
  INSERT INTO ai_agent_skills
  SELECT (jsonb_populate_record(
    NULL::ai_agent_skills,
    to_jsonb(sk)
      - 'created_at'
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id
      )
  )).*
  FROM ai_agent_skills sk
  WHERE sk.agent_id = p_source_agent_id;

  -- ===========================================================================
  -- 2.6. Clonar ai_agent_scoring_config (1:1, PK = agent_id)
  -- ===========================================================================
  INSERT INTO ai_agent_scoring_config
  SELECT (jsonb_populate_record(
    NULL::ai_agent_scoring_config,
    to_jsonb(sc)
      - 'updated_at'
      || jsonb_build_object('agent_id', v_new_agent_id)
  )).*
  FROM ai_agent_scoring_config sc
  WHERE sc.agent_id = p_source_agent_id;

  -- ===========================================================================
  -- 2.7. Clonar ai_agent_scoring_rules (1:N)
  -- ===========================================================================
  INSERT INTO ai_agent_scoring_rules
  SELECT (jsonb_populate_record(
    NULL::ai_agent_scoring_rules,
    to_jsonb(sr)
      - 'created_at' - 'updated_at'
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id
      )
  )).*
  FROM ai_agent_scoring_rules sr
  WHERE sr.agent_id = p_source_agent_id;

  -- ===========================================================================
  -- 2.8. Clonar ai_agent_moments (1:N)
  -- ===========================================================================
  INSERT INTO ai_agent_moments
  SELECT (jsonb_populate_record(
    NULL::ai_agent_moments,
    to_jsonb(m)
      - 'created_at' - 'updated_at'
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id
      )
  )).*
  FROM ai_agent_moments m
  WHERE m.agent_id = p_source_agent_id;

  -- ===========================================================================
  -- 2.9. Clonar ai_agent_few_shot_examples (1:N)
  -- ===========================================================================
  INSERT INTO ai_agent_few_shot_examples
  SELECT (jsonb_populate_record(
    NULL::ai_agent_few_shot_examples,
    to_jsonb(f)
      - 'created_at' - 'updated_at'
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id
      )
  )).*
  FROM ai_agent_few_shot_examples f
  WHERE f.agent_id = p_source_agent_id;

  -- ===========================================================================
  -- 2.10. Clonar ai_agent_silent_signals (1:N)
  -- ===========================================================================
  INSERT INTO ai_agent_silent_signals
  SELECT (jsonb_populate_record(
    NULL::ai_agent_silent_signals,
    to_jsonb(ss)
      - 'created_at' - 'updated_at'
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id
      )
  )).*
  FROM ai_agent_silent_signals ss
  WHERE ss.agent_id = p_source_agent_id;

  -- ===========================================================================
  -- 2.11. Clonar ai_agent_presentations (1:N)
  -- ===========================================================================
  INSERT INTO ai_agent_presentations
  SELECT (jsonb_populate_record(
    NULL::ai_agent_presentations,
    to_jsonb(p)
      - 'created_at' - 'updated_at'
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id
      )
  )).*
  FROM ai_agent_presentations p
  WHERE p.agent_id = p_source_agent_id;

  -- ===========================================================================
  -- 2.12. Clonar Knowledge Bases (linkadas via ai_agent_kb_links)
  -- ===========================================================================
  -- Para cada KB linkada ao agente fonte:
  --   1. Cria uma nova ai_knowledge_bases (mesmo conteúdo, novo id)
  --   2. Copia ai_knowledge_base_items (com embeddings) pra nova KB
  --   3. Cria ai_agent_kb_links linkando o novo agente à nova KB
  -- ===========================================================================
  FOR v_kb_record IN
    SELECT kb.id AS source_kb_id, lnk.shared_with_account
    FROM ai_knowledge_bases kb
    JOIN ai_agent_kb_links lnk ON lnk.kb_id = kb.id
    WHERE lnk.agent_id = p_source_agent_id
  LOOP
    v_new_kb_id := gen_random_uuid();

    -- Copiar a KB em si
    INSERT INTO ai_knowledge_bases
    SELECT (jsonb_populate_record(
      NULL::ai_knowledge_bases,
      to_jsonb(kb)
        - 'created_at' - 'last_synced_at'
        || jsonb_build_object('id', v_new_kb_id)
    )).*
    FROM ai_knowledge_bases kb
    WHERE kb.id = v_kb_record.source_kb_id;

    -- Copiar items (com embeddings)
    INSERT INTO ai_knowledge_base_items
    SELECT (jsonb_populate_record(
      NULL::ai_knowledge_base_items,
      to_jsonb(i)
        - 'created_at' - 'updated_at'
        || jsonb_build_object(
          'id', gen_random_uuid(),
          'kb_id', v_new_kb_id
        )
    )).*
    FROM ai_knowledge_base_items i
    WHERE i.kb_id = v_kb_record.source_kb_id;

    -- Criar link (org_id explícito porque SECURITY DEFINER + requesting_org_id() = NULL)
    INSERT INTO ai_agent_kb_links (agent_id, kb_id, shared_with_account, org_id)
    VALUES (v_new_agent_id, v_new_kb_id, COALESCE(v_kb_record.shared_with_account, false), v_source_org_id);
  END LOOP;

  RETURN v_new_agent_id;
END;
$$;

COMMENT ON FUNCTION clone_agent(UUID, TEXT, TEXT) IS
  'Duplica um agente inteiro (row + 11 tabelas filhas + KB com embeddings) numa transação atômica. Retorna o novo agent_id. O novo agente nasce com ativa=false e o engine especificado. ai_agent_phone_line_config NÃO é copiada (vinculação manual depois).';

-- Permissão: service_role (script staging) e authenticated com permissão de admin
GRANT EXECUTE ON FUNCTION clone_agent(UUID, TEXT, TEXT) TO service_role, authenticated;
