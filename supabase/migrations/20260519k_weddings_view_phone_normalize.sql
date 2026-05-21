-- v8 — vw_weddings_messages_unified com customer_phone NORMALIZADO
--
-- BUG diagnosticado pelo Vitor: Gabriela Valladares responde no WhatsApp mas
-- aparece como "Nunca respondeu" no dashboard. Causa: sender_phone tem 2
-- formatos no banco — outbound usa "5531997710192" (13 dígitos, com o 9 móvel),
-- inbound usa "553197710192" (12 dígitos, sem o 9). A view trata como pessoas
-- distintas. Magnitude: 165 telefones duplicados em 902 distintos.
--
-- Correção: normalizar pra formato canônico de 13 dígitos (55 + DDD + 9 + 8).
-- Quando o número tem 12 dígitos começando com 55, inserir "9" depois do DDD.
--
-- A view atual era a v2 (20260519d). Esta é uma recriação que preserva tudo
-- exceto adiciona normalização de customer_phone.

DROP VIEW IF EXISTS vw_weddings_messages_unified CASCADE;

CREATE VIEW vw_weddings_messages_unified AS
SELECT
  wm.id                                                         AS message_id,
  wm.contact_id,
  wm.card_id,
  -- Normalização de telefone celular BR:
  -- 55XX9NNNNNNNN (13) → mantém
  -- 55XXNNNNNNNN  (12) → insere "9" depois do DDD
  -- outros formatos: mantém como vier
  CASE
    WHEN wm.sender_phone ~ '^55\d{10}$' AND LENGTH(wm.sender_phone) = 12
      THEN '55' || SUBSTRING(wm.sender_phone, 3, 2) || '9' || SUBSTRING(wm.sender_phone, 5)
    ELSE wm.sender_phone
  END                                                           AS customer_phone,
  wm.phone_number_label                                         AS phone_line_label,
  wm.direction,
  wm.body,
  wm.created_at                                                 AS sent_at,
  wm.status,
  wm.ack_status,
  wm.is_read,
  wm.sent_by_user_id,
  wm.sent_by_user_name,
  wm.ecko_agent_id,
  NULLIF(wm.metadata->>'agent_id', '')::UUID                    AS attributed_agent_id,
  wm.metadata,
  CASE
    WHEN wm.direction = 'inbound'                                          THEN 'lead'
    WHEN wm.sent_by_user_id IS NOT NULL                                    THEN 'human'
    WHEN wm.metadata->>'source' IN ('ai_agent_v2','ai_agent_v2_fallback')  THEN 'ai_agent'
    WHEN wm.metadata->>'cadence_instance_id' IS NOT NULL                   THEN 'cadence'
    WHEN wm.ecko_agent_id IS NOT NULL                                      THEN 'ai_agent'
    ELSE 'unknown'
  END                                                           AS attribution_mode
FROM whatsapp_messages wm
WHERE wm.phone_number_label IS NOT NULL
  AND wm.phone_number_label ~* '(elop|sdr.*wedd|welcome.?wedd|teste.*vitor)'
  AND wm.sender_phone IS NOT NULL;

COMMENT ON VIEW vw_weddings_messages_unified IS
  'v3 (20260519k): customer_phone normalizado pra formato BR canônico (13 dígitos com 9 móvel). Resolve duplicação onde inbound e outbound tinham formatos diferentes do mesmo número.';

GRANT SELECT ON vw_weddings_messages_unified TO authenticated, service_role;
