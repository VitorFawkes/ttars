-- H3-026: registro de aceite de termos, privacidade e DPA
--
-- Usado no fluxo de signup/convite (Sprint A.6).
-- Rastreia qual versão do documento o usuário aceitou, quando e de onde.

CREATE TABLE IF NOT EXISTS terms_acceptance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    org_id UUID REFERENCES organizations(id),
    terms_version TEXT NOT NULL,
    privacy_version TEXT NOT NULL,
    dpa_version TEXT,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address INET,
    user_agent TEXT,
    context TEXT NOT NULL DEFAULT 'signup', -- 'signup', 'terms_update', 're_accept'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terms_acceptance_user_id ON terms_acceptance(user_id);
CREATE INDEX IF NOT EXISTS idx_terms_acceptance_org_id ON terms_acceptance(org_id);
CREATE INDEX IF NOT EXISTS idx_terms_acceptance_accepted_at ON terms_acceptance(accepted_at DESC);

ALTER TABLE terms_acceptance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "terms_acceptance_self_read" ON terms_acceptance;
DROP POLICY IF EXISTS "terms_acceptance_self_insert" ON terms_acceptance;
DROP POLICY IF EXISTS "terms_acceptance_admin_read" ON terms_acceptance;
DROP POLICY IF EXISTS "terms_acceptance_service_all" ON terms_acceptance;

-- Usuário pode ver e inserir seus próprios aceites
CREATE POLICY "terms_acceptance_self_read" ON terms_acceptance
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "terms_acceptance_self_insert" ON terms_acceptance
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Admin da org pode ver todos os aceites da org (auditoria)
CREATE POLICY "terms_acceptance_admin_read" ON terms_acceptance
  FOR SELECT TO authenticated
  USING (
    org_id = requesting_org_id() AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND org_id = requesting_org_id() AND (is_admin = TRUE OR role = 'admin')
    )
  );

CREATE POLICY "terms_acceptance_service_all" ON terms_acceptance
  FOR ALL TO service_role USING (true) WITH CHECK (true);
