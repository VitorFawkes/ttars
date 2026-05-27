-- Patricia: trocar "Ana Carolina" por "Wedding Planner" no banco
-- (few-shots + moments) — 2026-05-27.
--
-- O Vitor pediu que Patricia NÃO use o nome próprio da Wedding Planner durante
-- a conversa. Use sempre o título genérico ("Wedding Planner", "nossa Wedding
-- Planner"). O nome real só sai da boca dela no MOMENTO do agendamento real.
--
-- Motivo: o time de Wedding Planners pode crescer (outras pessoas além da Ana
-- Carolina). Citar nome próprio engessa o roteamento real.

DO $$
DECLARE
  v_patricia_id UUID := '4d96d9b4-e909-4441-bd85-d3f807cccfa7';
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM ai_agents WHERE id = v_patricia_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE NOTICE 'Patricia não existe neste ambiente (staging). Skip silencioso.';
    RETURN;
  END IF;

  -- 1) Few-shot 8a3576f5 (objecao_preco): "A Ana Carolina detalha" → "A Wedding Planner detalha"
  UPDATE ai_agent_few_shot_examples
  SET agent_response = REPLACE(
        REPLACE(agent_response, 'A Ana Carolina', 'A Wedding Planner'),
        'a Ana Carolina', 'a Wedding Planner'
      )
  WHERE agent_id = v_patricia_id
    AND id = '8a3576f5-97cd-4cd3-805d-552ff2b2e1e7';

  -- 2) Few-shot 749a1731 (handoff_humano_invisivel): "com a Ana Carolina" → "com a equipe"
  -- Esse é cenário INTERNO (checar com equipe antes de responder), faz mais
  -- sentido manter genérico "equipe" mesmo (não é momento de revelar o nome).
  UPDATE ai_agent_few_shot_examples
  SET agent_response = REPLACE(agent_response, 'com a Ana Carolina', 'com a equipe')
  WHERE agent_id = v_patricia_id
    AND id = '749a1731-1f64-4ee9-9a08-7e6f6f0f5cf2';

  -- Fallback em outros few-shots ainda existentes (defesa em profundidade)
  UPDATE ai_agent_few_shot_examples
  SET agent_response = REPLACE(
        REPLACE(agent_response, 'A Ana Carolina', 'A Wedding Planner'),
        'a Ana Carolina', 'a Wedding Planner'
      )
  WHERE agent_id = v_patricia_id
    AND agent_response LIKE '%Ana Carolina%';

  -- 3) Moment handoff_humano_invisivel: anchor_text + must_cover
  UPDATE ai_agent_moments
  SET anchor_text = REPLACE(anchor_text, 'checar com a Ana Carolina', 'checar com a Wedding Planner'),
      must_cover = (
        SELECT jsonb_agg(
          CASE
            WHEN item::text LIKE '%Ana Carolina%'
            THEN to_jsonb(REPLACE(item::text, 'Ana Carolina', 'Wedding Planner'))
            ELSE item
          END
        )
        FROM jsonb_array_elements(must_cover) item
      )
  WHERE agent_id = v_patricia_id
    AND moment_key = 'handoff_humano_invisivel';

  -- 4) Outros moments que possam mencionar Ana Carolina genericamente
  -- (revelar nome só no desfecho_qualificado).
  UPDATE ai_agent_moments
  SET anchor_text = REPLACE(REPLACE(anchor_text, 'a Ana Carolina', 'a Wedding Planner'), 'A Ana Carolina', 'A Wedding Planner')
  WHERE agent_id = v_patricia_id
    AND moment_key NOT IN ('desfecho_qualificado')  -- desfecho mantém pq usa {wedding_planner_name} via placeholder
    AND anchor_text LIKE '%Ana Carolina%';

  RAISE NOTICE 'Patricia: Ana Carolina → Wedding Planner aplicado em few-shots + moments';
END $$;
