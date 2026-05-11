-- H2: Tabela organizations — fundação multi-tenant
-- Aditiva pura, sem impacto em código existente

CREATE TABLE IF NOT EXISTS organizations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    logo_url    TEXT,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: Welcome Group (org única por enquanto)
INSERT INTO organizations (id, name, slug)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Welcome Group', 'welcome-group')
ON CONFLICT (id) DO NOTHING;

-- RLS básica (tudo visível por enquanto — 1 org)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "organizations_read_authenticated"
    ON organizations FOR SELECT TO authenticated
    USING (TRUE);

COMMENT ON TABLE organizations IS 'H2: Organizações/tenants do sistema. Seed: Welcome Group.';
