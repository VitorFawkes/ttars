-- ============================================================================
-- MIGRATION: view ai_agent_v1_v2_comparison
-- Date: 2026-05-02
--
-- Parte do Marco 2a do Playbook Conversacional v2.
--
-- View pra facilitar o card "Comparação v1 × v2" na AiAgentAnalyticsPage
-- (Marco 4). Agrega por agente + versão: conversas, respostas, tokens/
-- resposta médios, taxa de handoff, score médio de qualificação,
-- primeira/última execução.
--
-- Só inclui agentes que têm turnos nos últimos 30 dias pra não inflar
-- com dados antigos.
-- ============================================================================

CREATE OR REPLACE VIEW ai_agent_v1_v2_comparison AS
SELECT
  a.id AS agent_id,
  a.nome AS agent_name,
  a.org_id,
  t.agent_version,

  COUNT(DISTINCT t.conversation_id) AS conversations,
  COUNT(*) FILTER (WHERE t.role = 'assistant') AS responses,

  AVG(COALESCE(t.input_tokens, 0) + COALESCE(t.output_tokens, 0))
    FILTER (WHERE t.role = 'assistant') AS avg_tokens_per_response,

  AVG(t.qualification_score_at_turn)
    FILTER (WHERE t.qualification_score_at_turn IS NOT NULL) AS avg_qual_score,

  COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'escalated') AS escalated_conversations,

  -- Taxa de handoff = conversas escaladas / conversas totais
  CASE
    WHEN COUNT(DISTINCT t.conversation_id) > 0
    THEN COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'escalated')::NUMERIC
       / COUNT(DISTINCT t.conversation_id)::NUMERIC
    ELSE 0
  END AS escalation_rate,

  MIN(t.created_at) AS first_turn_at,
  MAX(t.created_at) AS last_turn_at

FROM ai_conversation_turns t
JOIN ai_conversations c ON c.id = t.conversation_id
JOIN ai_agents a ON a.id = t.agent_id
WHERE t.created_at > now() - interval '30 days'
GROUP BY a.id, a.nome, a.org_id, t.agent_version;

GRANT SELECT ON ai_agent_v1_v2_comparison TO authenticated, service_role;

COMMENT ON VIEW ai_agent_v1_v2_comparison IS
  'Agrega métricas dos últimos 30 dias por (agente × versão). Consumida pelo card "Comparação v1 × v2" na AiAgentAnalyticsPage (Marco 4). Permite validar se v2 está melhor que v1 antes de flipar agentes em produção.';
