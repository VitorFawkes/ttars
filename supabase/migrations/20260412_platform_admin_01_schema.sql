-- Platform Admin Fase 1: Schema
-- Separa o papel de "dono do SaaS" (platform_admin) do papel de tenant admin.
-- Welcome Group deixa de ser o super-admin hardcoded e vira tenant comum.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.platform_audit_log;
--   ALTER TABLE organizations DROP COLUMN IF EXISTS status;
--   ALTER TABLE organizations DROP COLUMN IF EXISTS suspended_at;
--   ALTER TABLE organizations DROP COLUMN IF EXISTS suspended_reason;
--   ALTER TABLE profiles DROP COLUMN IF EXISTS is_platform_admin;

-- 1. Flag de platform admin em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.is_platform_admin IS
  'TRUE = dono/operador do SaaS (acesso ao /platform console). '
  'Independente de is_admin (que é admin da própria org).';

CREATE INDEX IF NOT EXISTS idx_profiles_is_platform_admin
  ON public.profiles(is_platform_admin)
  WHERE is_platform_admin = TRUE;

-- 2. Status de organização (suspender/arquivar sem apagar)
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'archived'));

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT;

COMMENT ON COLUMN public.organizations.status IS
  'Status da org: active (operando), suspended (bloqueada temporariamente, pode retomar), '
  'archived (desativada permanentemente, mantida para histórico).';

CREATE INDEX IF NOT EXISTS idx_organizations_status
  ON public.organizations(status)
  WHERE status <> 'active';

-- 3. Audit log platform-wide
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_audit_log IS
  'Trilha de auditoria de ações executadas por platform_admins. '
  'Inclui: provisionamento de org, suspensão, impersonate, mudança de permissões platform.';

CREATE INDEX IF NOT EXISTS idx_platform_audit_log_actor
  ON public.platform_audit_log(actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_log_target
  ON public.platform_audit_log(target_type, target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_audit_log_action
  ON public.platform_audit_log(action, created_at DESC);

-- RLS do audit log (só platform admins leem/escrevem)
ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

-- Policies serão criadas em 03_rls_bypass.sql (depois da função is_platform_admin existir)
