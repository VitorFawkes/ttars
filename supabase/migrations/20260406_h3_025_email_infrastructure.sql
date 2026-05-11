-- H3-025: Email transacional — tabelas de auditoria e templates customizados
--
-- Usado pela Edge Function send-email (Sprint A.4).
--
-- Estratégia: templates default ficam no código (templates.ts). Tabela email_templates
-- é opcional — quando existir registro para (org_id, key), a Edge Function usa a customização.
-- Por enquanto, apenas email_log é usado ativamente. email_templates fica criada como
-- infraestrutura para customização por org no futuro.

-- =============================================================================
-- email_log — registro de todos os envios (sucesso ou falha)
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    to_email TEXT NOT NULL,
    template_key TEXT,              -- 'invite', 'password_reset', 'raw', etc.
    subject TEXT,
    status TEXT NOT NULL,           -- 'queued', 'sent', 'failed', 'bounced'
    provider TEXT DEFAULT 'resend', -- 'resend', 'sendgrid', etc.
    provider_id TEXT,               -- ID retornado pelo provider
    error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_log_org_id ON email_log(org_id);
CREATE INDEX IF NOT EXISTS idx_email_log_to_email ON email_log(to_email);
CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON email_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_log_org_select" ON email_log;
DROP POLICY IF EXISTS "email_log_service_all" ON email_log;

-- Apenas admins da org podem ver logs (auditoria)
CREATE POLICY "email_log_org_select" ON email_log
  FOR SELECT TO authenticated
  USING (
    org_id = requesting_org_id() AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND org_id = requesting_org_id() AND (is_admin = TRUE OR role = 'admin')
    )
  );

CREATE POLICY "email_log_service_all" ON email_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================================
-- email_templates — customização por org (opcional, futuro)
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL = template global default
    template_key TEXT NOT NULL,     -- 'invite', 'password_reset', 'lead_assigned', 'org_welcome'
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,
    variables JSONB DEFAULT '[]'::JSONB,  -- lista de variáveis aceitas
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_org_id ON email_templates(org_id);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_templates_org_select" ON email_templates;
DROP POLICY IF EXISTS "email_templates_org_admin_all" ON email_templates;
DROP POLICY IF EXISTS "email_templates_service_all" ON email_templates;

CREATE POLICY "email_templates_org_select" ON email_templates
  FOR SELECT TO authenticated
  USING (org_id IS NULL OR org_id = requesting_org_id());

CREATE POLICY "email_templates_org_admin_all" ON email_templates
  FOR ALL TO authenticated
  USING (
    org_id = requesting_org_id() AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND org_id = requesting_org_id() AND (is_admin = TRUE OR role = 'admin')
    )
  );

CREATE POLICY "email_templates_service_all" ON email_templates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
