-- v9 — vw_weddings_messages_unified com NORMALIZAÇÃO ROBUSTA de telefone
--
-- A v8 (20260519k) cobria só 1 caso: 12 dígitos começando com 55 → adicionar 9.
-- Eliminava 165 duplicações.
--
-- A v9 cobre TODAS as variações comuns de telefone BR:
--   - Limpa caracteres não-dígitos primeiro (parênteses, hífen, espaço, +)
--   - 13 dígitos começando com 55: formato canônico, mantém
--   - 12 dígitos começando com 55: insere 9 após o DDD (era v8)
--   - 11 dígitos (DDD + 9 + 8 dígitos): prepend 55
--   - 10 dígitos (DDD + 8 dígitos sem 9): prepend 55 + insere 9
--   - 9 ou menos / 14+ dígitos: mantém como veio (não dá pra adivinhar DDD ou pode ser internacional)
--
-- Magnitude: elimina 260 duplicações (vs 165 da v8). Total de 902 telefones
-- distintos cai pra 642 únicos reais.

DROP VIEW IF EXISTS vw_weddings_messages_unified CASCADE;

CREATE VIEW vw_weddings_messages_unified AS
WITH stripped AS (
  SELECT
    wm.*,
    REGEXP_REPLACE(wm.sender_phone, '[^0-9]', '', 'g') AS phone_digits
  FROM whatsapp_messages wm
  WHERE wm.phone_number_label IS NOT NULL
    AND wm.phone_number_label ~* '(elop|sdr.*wedd|welcome.?wedd|teste.*vitor)'
    AND wm.sender_phone IS NOT NULL
)
SELECT
  s.id                                                         AS message_id,
  s.contact_id,
  s.card_id,
  CASE
    WHEN s.phone_digits ~ '^55\d{11}$' THEN s.phone_digits
    WHEN s.phone_digits ~ '^55\d{10}$' THEN
      '55' || SUBSTRING(s.phone_digits, 3, 2) || '9' || SUBSTRING(s.phone_digits, 5)
    WHEN s.phone_digits ~ '^\d{11}$' THEN '55' || s.phone_digits
    WHEN s.phone_digits ~ '^\d{10}$' THEN
      '55' || SUBSTRING(s.phone_digits, 1, 2) || '9' || SUBSTRING(s.phone_digits, 3)
    ELSE s.phone_digits
  END                                                          AS customer_phone,
  s.phone_number_label                                         AS phone_line_label,
  s.direction,
  s.body,
  s.created_at                                                 AS sent_at,
  s.status,
  s.ack_status,
  s.is_read,
  s.sent_by_user_id,
  s.sent_by_user_name,
  s.ecko_agent_id,
  NULLIF(s.metadata->>'agent_id', '')::UUID                    AS attributed_agent_id,
  s.metadata,
  CASE
    WHEN s.direction = 'inbound'                                          THEN 'lead'
    WHEN s.sent_by_user_id IS NOT NULL                                    THEN 'human'
    WHEN s.metadata->>'source' IN ('ai_agent_v2','ai_agent_v2_fallback')  THEN 'ai_agent'
    WHEN s.metadata->>'cadence_instance_id' IS NOT NULL                   THEN 'cadence'
    WHEN s.ecko_agent_id IS NOT NULL                                      THEN 'ai_agent'
    ELSE 'unknown'
  END                                                          AS attribution_mode
FROM stripped s;

COMMENT ON VIEW vw_weddings_messages_unified IS
  'v4 (20260519l): customer_phone normalizado ROBUSTO. Cobre 10/11/12/13 dígitos com ou sem DDI 55 e com ou sem 9 móvel. Limpa parenteses, hifen, espaco antes de aplicar regras.';

GRANT SELECT ON vw_weddings_messages_unified TO authenticated, service_role;
