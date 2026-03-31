-- =============================================================================
-- Migration: Roles & Teams Separation
-- Purpose: Create normalized roles table and update profiles for proper RBAC
-- =============================================================================

-- 1. CREATE ROLES TABLE
-- This table will replace the app_role enum for access control
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,           -- e.g., 'admin', 'manager', 'member'
    display_name VARCHAR(100) NOT NULL,         -- e.g., 'Administrador', 'Gerente', 'Membro'
    description TEXT,
    permissions JSONB DEFAULT '{}',             -- Future: granular permissions
    is_system BOOLEAN DEFAULT FALSE,            -- System roles cannot be deleted
    color VARCHAR(50) DEFAULT 'bg-gray-100 text-gray-800', -- Badge styling
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roles_updated_at ON public.roles;
CREATE TRIGGER roles_updated_at
    BEFORE UPDATE ON public.roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 2. SEED DEFAULT ROLES (Mapped from current app_role enum)
INSERT INTO public.roles (name, display_name, description, is_system, color) VALUES
    ('admin', 'Administrador', 'Acesso total ao sistema. Pode gerenciar usuários, configurações e todos os dados.', TRUE, 'bg-red-100 text-red-800'),
    ('manager', 'Gerente', 'Pode gerenciar equipes e visualizar relatórios. Acesso a funcionalidades de gestão.', TRUE, 'bg-purple-100 text-purple-800'),
    ('member', 'Membro', 'Acesso padrão ao sistema. Pode trabalhar em cards e usar funcionalidades básicas.', TRUE, 'bg-blue-100 text-blue-800'),
    ('viewer', 'Visualizador', 'Apenas visualização. Não pode editar ou criar dados.', TRUE, 'bg-gray-100 text-gray-800')
ON CONFLICT (name) DO NOTHING;

-- 3. ADD role_id TO PROFILES
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES public.roles(id);

-- 4. MIGRATE EXISTING DATA
-- Map old app_role enum values to new role_id
-- admin/gestor -> admin (these had full access)
-- sdr/vendas/pos_venda/concierge/financeiro -> member (operational roles)
UPDATE public.profiles p
SET role_id = (SELECT id FROM public.roles WHERE name = 'admin')
WHERE p.role IN ('admin', 'gestor') OR p.is_admin = TRUE;

UPDATE public.profiles p
SET role_id = (SELECT id FROM public.roles WHERE name = 'member')
WHERE p.role_id IS NULL;

-- 5. RLS POLICIES FOR ROLES TABLE
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read roles
DROP POLICY IF EXISTS "Authenticated users can read roles" ON public.roles;
CREATE POLICY "Authenticated users can read roles" ON public.roles
    FOR SELECT
    TO authenticated
    USING (true);

-- Only admins can manage roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.roles;
CREATE POLICY "Admins can manage roles" ON public.roles
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 6. UPDATE is_admin FUNCTION to use new structure
-- Check both legacy is_admin column AND new role_id -> admin role
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.profiles p
        LEFT JOIN public.roles r ON p.role_id = r.id
        WHERE p.id = auth.uid()
        AND (
            p.is_admin = TRUE 
            OR p.role = 'admin' 
            OR r.name = 'admin'
        )
    );
END;
$$;

-- 7. CREATE HELPER FUNCTION to check role by name
CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.profiles p
        JOIN public.roles r ON p.role_id = r.id
        WHERE p.id = auth.uid()
        AND r.name = role_name
    );
END;
$$;

-- 8. CREATE FUNCTION to check if user is manager or admin
CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.profiles p
        LEFT JOIN public.roles r ON p.role_id = r.id
        WHERE p.id = auth.uid()
        AND (
            p.is_admin = TRUE 
            OR p.role IN ('admin', 'gestor')
            OR r.name IN ('admin', 'manager')
        )
    );
END;
$$;

-- 9. ENSURE TEAMS TABLE HAS ALL NEEDED COLUMNS
-- The teams table already exists, but let's ensure it has proper structure
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT 'bg-blue-100 text-blue-800';
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES public.profiles(id);

-- Add updated_at trigger for teams
DROP TRIGGER IF EXISTS teams_updated_at ON public.teams;
CREATE TRIGGER teams_updated_at
    BEFORE UPDATE ON public.teams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 10. CREATE VIEW for profiles with role and team info
CREATE OR REPLACE VIEW public.view_profiles_complete AS
SELECT 
    p.id,
    p.nome,
    p.email,
    p.phone,
    p.avatar_url,
    p.active,
    p.is_admin,
    p.created_at,
    p.updated_at,
    p.role as legacy_role,
    p.produtos,
    -- Role info
    r.id as role_id,
    r.name as role_name,
    r.display_name as role_display_name,
    r.color as role_color,
    -- Team info
    t.id as team_id,
    t.name as team_name,
    t.description as team_description,
    t.color as team_color,
    -- Department info
    d.id as department_id,
    d.name as department_name
FROM public.profiles p
LEFT JOIN public.roles r ON p.role_id = r.id
LEFT JOIN public.teams t ON p.team_id = t.id
LEFT JOIN public.departments d ON t.department_id = d.id;

-- 11. GRANT PERMISSIONS
GRANT SELECT ON public.roles TO authenticated;
GRANT SELECT ON public.view_profiles_complete TO authenticated;

-- 12. CREATE INDEX for performance
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_profiles_team_id ON public.profiles(team_id);
CREATE INDEX IF NOT EXISTS idx_teams_department_id ON public.teams(department_id);
CREATE INDEX IF NOT EXISTS idx_teams_leader_id ON public.teams(leader_id);

-- 13. ADD COMMENT for documentation
COMMENT ON TABLE public.roles IS 'Access control roles for RBAC. Separate from team assignments.';
COMMENT ON COLUMN public.profiles.role_id IS 'FK to roles table. Defines access level (admin/manager/member).';
COMMENT ON COLUMN public.profiles.team_id IS 'FK to teams table. Defines organizational assignment (SDR Team, Planner Team, etc).';
