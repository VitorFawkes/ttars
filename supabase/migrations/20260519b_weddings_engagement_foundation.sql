-- Fundação do Dashboard de Engajamento de Conversas — Welcome Weddings
--
-- Contexto: hoje as mensagens recebidas das linhas Elopment (Patricia v2) e
-- SDR Weddings (Estela) ficam SÓ em whatsapp_raw_events.message.received
-- e nunca chegam em whatsapp_messages — o pipeline raw → messages tem gap
-- pra essas linhas. Sem isso, dashboard de "taxa de resposta" mostraria zero.
--
-- Esta view unifica:
--   - OUTBOUND: vem de whatsapp_messages (já existe e funciona)
--   - INBOUND: vem de whatsapp_raw_events com event_type='message.received',
--     extraindo body/timestamp/phone do raw_payload JSONB
--
-- O JOIN com whatsapp_linha_config.phone_number_id resolve duas dores:
--   1. whatsapp_messages.phone_number_id é NULL em ~48% das linhas
--   2. SDR Weddings está cadastrado na org-pai Welcome Group; filtrar por
--      whatsapp_linha_config.produto = 'WEDDING' captura ambas as linhas
--      independente da org.
--
-- Não cria tabela nova nem altera tabelas existentes — view + índices apenas.

-- ─────────────────────────────────────────────────────────────────────────
-- Índices de suporte (volume baixo hoje, mas indispensáveis quando escalar)
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_contact_direction_created
  ON whatsapp_messages(contact_id, direction, created_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone_number_id
  ON whatsapp_messages(phone_number_id)
  WHERE phone_number_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_raw_events_received_processed
  ON whatsapp_raw_events(event_type, status, created_at DESC)
  WHERE event_type = 'message.received' AND status = 'processed';

CREATE INDEX IF NOT EXISTS idx_whatsapp_raw_events_contact_received
  ON whatsapp_raw_events(contact_id, created_at DESC)
  WHERE event_type = 'message.received' AND contact_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- View unificada — fonte única pro dashboard de engajamento
-- ─────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS vw_weddings_messages_unified CASCADE;

CREATE VIEW vw_weddings_messages_unified AS
WITH wedding_lines AS (
  SELECT
    id              AS linha_id,
    phone_number_id AS echo_phone_id,
    phone_number_label,
    produto,
    org_id          AS linha_org_id,
    pipeline_id
  FROM whatsapp_linha_config
  WHERE produto = 'WEDDING'
    AND ativo = TRUE
),
outbound AS (
  SELECT
    wm.id                        AS message_id,
    wm.contact_id,
    wm.card_id,
    wl.linha_id                  AS phone_line_id,
    wl.phone_number_label        AS phone_line_label,
    wl.linha_org_id,
    'outbound'::TEXT             AS direction,
    wm.body,
    wm.created_at                AS sent_at,
    wm.status,
    wm.ack_status,
    wm.is_read,
    wm.sent_by_user_id,
    wm.sent_by_user_name,
    wm.ecko_agent_id,
    NULLIF(wm.metadata->>'agent_id', '')::UUID    AS attributed_agent_id,
    wm.metadata,
    CASE
      WHEN wm.sent_by_user_id IS NOT NULL                                       THEN 'human'
      WHEN wm.metadata->>'source' IN ('ai_agent_v2','ai_agent_v2_fallback')     THEN 'ai_agent'
      WHEN wm.metadata->>'cadence_instance_id' IS NOT NULL                      THEN 'cadence'
      WHEN wm.ecko_agent_id IS NOT NULL                                         THEN 'ai_agent'
      ELSE 'unknown'
    END                          AS attribution_mode,
    'whatsapp_messages'::TEXT    AS source_table
  FROM whatsapp_messages wm
  INNER JOIN wedding_lines wl
    ON wl.echo_phone_id = wm.phone_number_id
  WHERE wm.direction = 'outbound'
    AND wm.contact_id IS NOT NULL
),
inbound AS (
  SELECT
    wre.id                                                 AS message_id,
    wre.contact_id,
    wre.card_id,
    wl.linha_id                                            AS phone_line_id,
    wl.phone_number_label                                  AS phone_line_label,
    wl.linha_org_id,
    'inbound'::TEXT                                        AS direction,
    NULLIF(wre.raw_payload->>'text', '')                   AS body,
    COALESCE(
      (wre.raw_payload->>'ts_iso')::TIMESTAMPTZ,
      wre.created_at
    )                                                      AS sent_at,
    'received'::TEXT                                       AS status,
    NULL::INTEGER                                          AS ack_status,
    COALESCE((wre.raw_payload->>'read')::BOOLEAN, FALSE)   AS is_read,
    NULL::UUID                                             AS sent_by_user_id,
    NULL::TEXT                                             AS sent_by_user_name,
    NULL::TEXT                                             AS ecko_agent_id,
    NULL::UUID                                             AS attributed_agent_id,
    wre.raw_payload                                        AS metadata,
    'lead'::TEXT                                           AS attribution_mode,
    'whatsapp_raw_events'::TEXT                            AS source_table
  FROM whatsapp_raw_events wre
  INNER JOIN wedding_lines wl
    ON wl.echo_phone_id = (wre.raw_payload->>'phone_number_id')
  WHERE wre.event_type = 'message.received'
    AND wre.status = 'processed'
    AND wre.contact_id IS NOT NULL
)
SELECT * FROM outbound
UNION ALL
SELECT * FROM inbound;

COMMENT ON VIEW vw_weddings_messages_unified IS
  'Welcome Weddings: mensagens unificadas (outbound de whatsapp_messages + inbound de whatsapp_raw_events.message.received). Filtra por whatsapp_linha_config.produto = WEDDING. Fonte do dashboard de engajamento. Marco 0 de docs/plans/n-s-recebemos-todas-as-streamed-comet.md';

-- View herda RLS das tabelas base (SECURITY INVOKER por default). A RPC
-- analytics_weddings_conversations (próxima migration) usa SECURITY DEFINER
-- e valida que o caller pertence ao workspace WEDDING antes de consultar.

GRANT SELECT ON vw_weddings_messages_unified TO authenticated, service_role;
