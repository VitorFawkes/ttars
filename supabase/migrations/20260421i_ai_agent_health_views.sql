-- Views para painel de saúde dos agentes IA.
-- Consumidas em src/pages/admin/AiAgentHealthPage.tsx via hook useAiAgentHealth.
-- Cada view retorna agregados por agent_id, filtrados por org_id no frontend via RLS.

-- ============================================================
-- 1. ai_agent_health_stats — contadores das últimas 24h e 7d
-- ============================================================
CREATE OR REPLACE VIEW public.ai_agent_health_stats AS
WITH turns_24h AS (
  -- Mensagens user são atribuídas ao agente via current_agent_id da conversa.
  -- Mensagens assistant já têm t.agent_id próprio (o agente que respondeu).
  SELECT
    COALESCE(t.agent_id, c.current_agent_id, c.primary_agent_id) AS agent_id,
    COUNT(*) FILTER (WHERE t.role = 'user')       AS user_turns_24h,
    COUNT(*) FILTER (WHERE t.role = 'assistant')  AS agent_turns_24h,
    SUM(COALESCE(t.input_tokens, 0))              AS input_tokens_24h,
    SUM(COALESCE(t.output_tokens, 0))             AS output_tokens_24h
  FROM ai_conversation_turns t
  JOIN ai_conversations c ON c.id = t.conversation_id
  WHERE t.created_at > NOW() - INTERVAL '24 hours'
  GROUP BY 1
),
turns_7d AS (
  SELECT
    COALESCE(t.agent_id, c.current_agent_id, c.primary_agent_id) AS agent_id,
    COUNT(*) FILTER (WHERE t.role = 'user')       AS user_turns_7d,
    COUNT(*) FILTER (WHERE t.role = 'assistant')  AS agent_turns_7d,
    SUM(COALESCE(t.input_tokens, 0))              AS input_tokens_7d,
    SUM(COALESCE(t.output_tokens, 0))             AS output_tokens_7d
  FROM ai_conversation_turns t
  JOIN ai_conversations c ON c.id = t.conversation_id
  WHERE t.created_at > NOW() - INTERVAL '7 days'
  GROUP BY 1
),
tool_stats_24h AS (
  SELECT
    agent_id,
    COUNT(*)                                  AS tool_calls_24h,
    COUNT(*) FILTER (WHERE success = false)   AS tool_failures_24h
  FROM ai_skill_usage_logs
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY agent_id
),
whatsapp_failed_24h AS (
  SELECT
    (metadata->>'agent_id')::uuid AS agent_id,
    COUNT(*)                      AS whatsapp_failed_24h,
    COUNT(*) FILTER (WHERE status = 'blocked_test_mode') AS whatsapp_blocked_test_24h
  FROM whatsapp_messages
  WHERE created_at > NOW() - INTERVAL '24 hours'
    AND direction = 'outbound'
    AND (metadata->>'source') = 'ai_agent'
    AND status IN ('failed', 'blocked_test_mode')
  GROUP BY 1
),
convs_24h AS (
  SELECT
    COALESCE(current_agent_id, primary_agent_id) AS agent_id,
    COUNT(*)                                     AS conversations_24h,
    COUNT(*) FILTER (WHERE status = 'escalated') AS escalated_24h
  FROM ai_conversations
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY 1
)
SELECT
  a.id   AS agent_id,
  a.nome AS agent_name,
  a.ativa,
  a.org_id,
  COALESCE(t24.user_turns_24h, 0)            AS user_turns_24h,
  COALESCE(t24.agent_turns_24h, 0)           AS agent_turns_24h,
  COALESCE(t24.input_tokens_24h, 0)          AS input_tokens_24h,
  COALESCE(t24.output_tokens_24h, 0)         AS output_tokens_24h,
  COALESCE(t7.user_turns_7d, 0)              AS user_turns_7d,
  COALESCE(t7.agent_turns_7d, 0)             AS agent_turns_7d,
  COALESCE(t7.input_tokens_7d, 0)            AS input_tokens_7d,
  COALESCE(t7.output_tokens_7d, 0)           AS output_tokens_7d,
  COALESCE(ts.tool_calls_24h, 0)             AS tool_calls_24h,
  COALESCE(ts.tool_failures_24h, 0)          AS tool_failures_24h,
  CASE
    WHEN COALESCE(ts.tool_calls_24h, 0) = 0 THEN NULL
    ELSE ROUND((1 - ts.tool_failures_24h::numeric / ts.tool_calls_24h) * 100, 1)
  END                                        AS tool_success_rate_pct,
  COALESCE(wf.whatsapp_failed_24h, 0) - COALESCE(wf.whatsapp_blocked_test_24h, 0)
                                             AS whatsapp_failed_24h,
  COALESCE(wf.whatsapp_blocked_test_24h, 0)  AS whatsapp_blocked_test_24h,
  COALESCE(c24.conversations_24h, 0)         AS conversations_24h,
  COALESCE(c24.escalated_24h, 0)             AS escalated_24h
FROM ai_agents a
LEFT JOIN turns_24h         t24 ON t24.agent_id = a.id
LEFT JOIN turns_7d          t7  ON t7.agent_id  = a.id
LEFT JOIN tool_stats_24h    ts  ON ts.agent_id  = a.id
LEFT JOIN whatsapp_failed_24h wf ON wf.agent_id = a.id
LEFT JOIN convs_24h         c24 ON c24.agent_id = a.id;

COMMENT ON VIEW public.ai_agent_health_stats IS
  'Agregados 24h/7d por agente IA para painel de saúde. Lido por useAiAgentHealth/AiAgentHealthPage. Views herdam RLS da ai_agents.';

-- ============================================================
-- 2. ai_agent_recent_errors — últimos 5 erros por agente
-- ============================================================
CREATE OR REPLACE VIEW public.ai_agent_recent_errors AS
WITH tool_errors AS (
  SELECT
    agent_id,
    created_at,
    'tool_failure' AS error_source,
    COALESCE(error, (output->>'error')::text, 'Unknown tool error') AS error_message,
    jsonb_build_object(
      'skill_id', skill_id,
      'input', input,
      'output', output,
      'duration_ms', duration_ms
    ) AS details
  FROM ai_skill_usage_logs
  WHERE success = false
    AND created_at > NOW() - INTERVAL '7 days'
),
whatsapp_errors AS (
  SELECT
    (metadata->>'agent_id')::uuid AS agent_id,
    created_at,
    'whatsapp_send' AS error_source,
    COALESCE(error_message, status, 'WhatsApp send failure') AS error_message,
    jsonb_build_object(
      'status', status,
      'sender_phone', sender_phone,
      'phone_number_id', phone_number_id,
      'body_preview', LEFT(body, 120)
    ) AS details
  FROM whatsapp_messages
  WHERE direction = 'outbound'
    AND (metadata->>'source') = 'ai_agent'
    AND status = 'failed'
    AND created_at > NOW() - INTERVAL '7 days'
),
all_errors AS (
  SELECT * FROM tool_errors
  UNION ALL
  SELECT * FROM whatsapp_errors
)
SELECT
  agent_id,
  created_at,
  error_source,
  error_message,
  details,
  ROW_NUMBER() OVER (PARTITION BY agent_id ORDER BY created_at DESC) AS rn
FROM all_errors;

COMMENT ON VIEW public.ai_agent_recent_errors IS
  'Últimos erros (tool + whatsapp) agrupados por agente, com ranking rn. Frontend filtra rn <= 5.';

-- ============================================================
-- 3. Permissões
-- ============================================================
GRANT SELECT ON public.ai_agent_health_stats TO authenticated;
GRANT SELECT ON public.ai_agent_recent_errors TO authenticated;
