-- Calendly webhook log + idempotência
-- Tabela global (per-org column populada no match) seguindo padrão de integration_outbox.
-- RLS: service_role total; authenticated lê só do próprio workspace (ou unmatched).

CREATE TABLE IF NOT EXISTS calendly_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_uuid TEXT,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    signature_header TEXT,
    signature_valid BOOLEAN,
    invitee_email TEXT,
    invitee_name TEXT,
    invitee_phone TEXT,
    event_start_time TIMESTAMPTZ,
    event_end_time TIMESTAMPTZ,
    event_uri TEXT,
    event_name TEXT,
    meeting_location_type TEXT,
    meeting_join_url TEXT,
    organizer_email TEXT,
    org_id UUID REFERENCES organizations(id),
    card_id UUID REFERENCES cards(id),
    contato_id UUID REFERENCES contatos(id),
    tarefa_id UUID REFERENCES tarefas(id),
    processed_at TIMESTAMPTZ,
    processed_status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS calendly_webhook_events_event_uuid_uniq
    ON calendly_webhook_events(event_uuid)
    WHERE event_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS calendly_webhook_events_created_at_idx
    ON calendly_webhook_events(created_at DESC);
CREATE INDEX IF NOT EXISTS calendly_webhook_events_org_id_idx
    ON calendly_webhook_events(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS calendly_webhook_events_status_idx
    ON calendly_webhook_events(processed_status);
CREATE INDEX IF NOT EXISTS calendly_webhook_events_invitee_email_idx
    ON calendly_webhook_events(lower(invitee_email)) WHERE invitee_email IS NOT NULL;

ALTER TABLE calendly_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendly_webhook_events_service_all ON calendly_webhook_events;
CREATE POLICY calendly_webhook_events_service_all ON calendly_webhook_events
    TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS calendly_webhook_events_auth_read ON calendly_webhook_events;
CREATE POLICY calendly_webhook_events_auth_read ON calendly_webhook_events
    FOR SELECT TO authenticated
    USING (org_id IS NULL OR org_id = requesting_org_id());

COMMENT ON TABLE calendly_webhook_events IS
  'Global: log técnico de webhooks do Calendly. Coluna org_id populada quando match com card é feito.';
