-- 20260508c_patricia_clone_agent_fix.sql
--
-- Fix: clone_agent original removia created_at/updated_at do JSON antes do
-- jsonb_populate_record, mas a coluna é NOT NULL e o populate passa NULL
-- (não respeita o DEFAULT now() do schema). Resultado: violation 23502.
--
-- Correção: setar created_at e updated_at explicitamente como now() no override
-- jsonb, em vez de removê-los. Mesma lógica pra `last_synced_at` em KB
-- (nullable, então pode ficar como remoção).

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
  v_now_iso TEXT := to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
BEGIN
  SELECT org_id INTO v_source_org_id
  FROM ai_agents WHERE id = p_source_agent_id;

  IF v_source_org_id IS NULL THEN
    RAISE EXCEPTION 'Agente fonte não encontrado: %', p_source_agent_id;
  END IF;

  IF p_new_engine NOT IN ('multi_agent_pipeline', 'single_agent_v2') THEN
    RAISE EXCEPTION 'Engine inválido: %. Use multi_agent_pipeline ou single_agent_v2.', p_new_engine;
  END IF;

  -- 2.1. Clone ai_agents
  INSERT INTO ai_agents
  SELECT (jsonb_populate_record(
    NULL::ai_agents,
    to_jsonb(a)
      || jsonb_build_object(
        'id', v_new_agent_id,
        'nome', p_new_name,
        'engine', p_new_engine,
        'ativa', false,
        'system_prompt_version', 1,
        'created_at', v_now_iso,
        'updated_at', v_now_iso,
        'ativa_changed_at', NULL,
        'ativa_changed_by', NULL
      )
  )).*
  FROM ai_agents a WHERE a.id = p_source_agent_id;

  -- 2.2. ai_agent_business_config (1:1)
  INSERT INTO ai_agent_business_config
  SELECT (jsonb_populate_record(
    NULL::ai_agent_business_config,
    to_jsonb(b)
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id,
        'created_at', v_now_iso,
        'updated_at', v_now_iso
      )
  )).*
  FROM ai_agent_business_config b WHERE b.agent_id = p_source_agent_id;

  -- 2.3. ai_agent_qualification_flow
  INSERT INTO ai_agent_qualification_flow
  SELECT (jsonb_populate_record(
    NULL::ai_agent_qualification_flow,
    to_jsonb(q)
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id,
        'created_at', v_now_iso,
        'updated_at', v_now_iso
      )
  )).*
  FROM ai_agent_qualification_flow q WHERE q.agent_id = p_source_agent_id;

  -- 2.4. ai_agent_special_scenarios
  INSERT INTO ai_agent_special_scenarios
  SELECT (jsonb_populate_record(
    NULL::ai_agent_special_scenarios,
    to_jsonb(s)
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id,
        'created_at', v_now_iso,
        'updated_at', v_now_iso
      )
  )).*
  FROM ai_agent_special_scenarios s WHERE s.agent_id = p_source_agent_id;

  -- 2.5. ai_agent_skills
  INSERT INTO ai_agent_skills
  SELECT (jsonb_populate_record(
    NULL::ai_agent_skills,
    to_jsonb(sk)
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id,
        'created_at', v_now_iso
      )
  )).*
  FROM ai_agent_skills sk WHERE sk.agent_id = p_source_agent_id;

  -- 2.6. ai_agent_scoring_config (1:1, PK = agent_id)
  INSERT INTO ai_agent_scoring_config
  SELECT (jsonb_populate_record(
    NULL::ai_agent_scoring_config,
    to_jsonb(sc)
      || jsonb_build_object(
        'agent_id', v_new_agent_id,
        'updated_at', v_now_iso
      )
  )).*
  FROM ai_agent_scoring_config sc WHERE sc.agent_id = p_source_agent_id;

  -- 2.7. ai_agent_scoring_rules
  INSERT INTO ai_agent_scoring_rules
  SELECT (jsonb_populate_record(
    NULL::ai_agent_scoring_rules,
    to_jsonb(sr)
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id,
        'created_at', v_now_iso,
        'updated_at', v_now_iso
      )
  )).*
  FROM ai_agent_scoring_rules sr WHERE sr.agent_id = p_source_agent_id;

  -- 2.8. ai_agent_moments
  INSERT INTO ai_agent_moments
  SELECT (jsonb_populate_record(
    NULL::ai_agent_moments,
    to_jsonb(m)
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id,
        'created_at', v_now_iso,
        'updated_at', v_now_iso
      )
  )).*
  FROM ai_agent_moments m WHERE m.agent_id = p_source_agent_id;

  -- 2.9. ai_agent_few_shot_examples
  INSERT INTO ai_agent_few_shot_examples
  SELECT (jsonb_populate_record(
    NULL::ai_agent_few_shot_examples,
    to_jsonb(f)
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id,
        'created_at', v_now_iso,
        'updated_at', v_now_iso
      )
  )).*
  FROM ai_agent_few_shot_examples f WHERE f.agent_id = p_source_agent_id;

  -- 2.10. ai_agent_silent_signals
  INSERT INTO ai_agent_silent_signals
  SELECT (jsonb_populate_record(
    NULL::ai_agent_silent_signals,
    to_jsonb(ss)
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id,
        'created_at', v_now_iso,
        'updated_at', v_now_iso
      )
  )).*
  FROM ai_agent_silent_signals ss WHERE ss.agent_id = p_source_agent_id;

  -- 2.11. ai_agent_presentations
  INSERT INTO ai_agent_presentations
  SELECT (jsonb_populate_record(
    NULL::ai_agent_presentations,
    to_jsonb(p)
      || jsonb_build_object(
        'id', gen_random_uuid(),
        'agent_id', v_new_agent_id,
        'created_at', v_now_iso,
        'updated_at', v_now_iso
      )
  )).*
  FROM ai_agent_presentations p WHERE p.agent_id = p_source_agent_id;

  -- 2.12. Knowledge Bases
  FOR v_kb_record IN
    SELECT kb.id AS source_kb_id, lnk.shared_with_account
    FROM ai_knowledge_bases kb
    JOIN ai_agent_kb_links lnk ON lnk.kb_id = kb.id
    WHERE lnk.agent_id = p_source_agent_id
  LOOP
    v_new_kb_id := gen_random_uuid();

    INSERT INTO ai_knowledge_bases
    SELECT (jsonb_populate_record(
      NULL::ai_knowledge_bases,
      to_jsonb(kb)
        || jsonb_build_object(
          'id', v_new_kb_id,
          'created_at', v_now_iso,
          'last_synced_at', NULL
        )
    )).*
    FROM ai_knowledge_bases kb WHERE kb.id = v_kb_record.source_kb_id;

    INSERT INTO ai_knowledge_base_items
    SELECT (jsonb_populate_record(
      NULL::ai_knowledge_base_items,
      to_jsonb(i)
        || jsonb_build_object(
          'id', gen_random_uuid(),
          'kb_id', v_new_kb_id,
          'created_at', v_now_iso,
          'updated_at', v_now_iso
        )
    )).*
    FROM ai_knowledge_base_items i WHERE i.kb_id = v_kb_record.source_kb_id;

    INSERT INTO ai_agent_kb_links (agent_id, kb_id, shared_with_account, org_id, created_at, updated_at)
    VALUES (v_new_agent_id, v_new_kb_id, COALESCE(v_kb_record.shared_with_account, false), v_source_org_id, NOW(), NOW());
  END LOOP;

  RETURN v_new_agent_id;
END;
$$;

GRANT EXECUTE ON FUNCTION clone_agent(UUID, TEXT, TEXT) TO service_role, authenticated;
