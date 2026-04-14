-- ============================================================
-- Reativação v4 — Tabela de supressões (não contactar)
-- ============================================================

CREATE TABLE IF NOT EXISTS reactivation_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
  suppressed_until TIMESTAMPTZ,
  reason TEXT NOT NULL CHECK (reason IN ('opt_out','working_elsewhere','bad_data','wrong_profile','other')),
  note TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_suppression_per_org UNIQUE(org_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_suppressions_lookup
  ON reactivation_suppressions(contact_id, org_id, suppressed_until);

CREATE INDEX IF NOT EXISTS idx_suppressions_org_active
  ON reactivation_suppressions(org_id)
  WHERE suppressed_until IS NULL OR suppressed_until > now();

ALTER TABLE reactivation_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY reactivation_suppressions_org_all ON reactivation_suppressions
  TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY reactivation_suppressions_service_all ON reactivation_suppressions
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE reactivation_suppressions IS
  'Marca contatos que não devem aparecer na Reativação. suppressed_until NULL = permanente.';
