-- Frente B: Associar Julia à linha WhatsApp "SDR Trips" (idempotente, busca Julia por nome)

INSERT INTO ai_agent_phone_line_config (agent_id, phone_line_id, ativa, priority, created_at)
SELECT a.id, w.id, false, 10, NOW() -- ativa=false por padrão; ativação é manual
FROM ai_agents a
JOIN whatsapp_linha_config w
  ON w.phone_number_label = 'SDR Trips'
WHERE a.nome = 'Julia'
  AND a.org_id = 'b0000000-0000-0000-0000-000000000001'::uuid
  AND a.execution_backend = 'n8n'
  AND NOT EXISTS (
    SELECT 1 FROM ai_agent_phone_line_config c
    WHERE c.agent_id = a.id AND c.phone_line_id = w.id
  );
