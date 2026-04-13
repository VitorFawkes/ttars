-- =========================================================================
-- Fix profiles_org_select — users não-admin não viam membros da mesma org
-- =========================================================================
-- Bug: users não-admin logados em org filha (Trips/Weddings via OrgSwitcher)
-- viam apenas a si mesmos em qualquer UI de seleção de responsável/assignee
-- (SmartTaskModal, etc.), porque profiles.org_id aponta pra parent (Welcome
-- Group) e não pra org ativa.
--
-- Causa raiz: a policy antiga tentava resolver visibilidade via EXISTS em
-- org_members cruzando dois aliases (me/them) — mas a RLS
-- `org_members_select_own` permite ao user ler apenas a própria linha, logo
-- `them` nunca matchava outros users e o EXISTS sempre retornava FALSE.
--
-- Admins não sofriam o bug porque `profiles_admin_all` já cobria via
-- `requesting_parent_org_id()`.
--
-- Fix: alinhar com o padrão de `contatos_org_select` e `profiles_admin_all`
-- — aceitar match direto no parent_org_id, sem depender de org_members.
-- =========================================================================

-- Garantir que requesting_parent_org_id() existe (produção já tem; staging
-- pode estar em drift). Idempotente.
CREATE OR REPLACE FUNCTION public.requesting_parent_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
    SELECT parent_org_id FROM organizations WHERE id = requesting_org_id();
$function$;

DROP POLICY IF EXISTS profiles_org_select ON public.profiles;

CREATE POLICY profiles_org_select ON public.profiles
FOR SELECT
USING (
    id = auth.uid()
    OR org_id = requesting_org_id()
    OR org_id = requesting_parent_org_id()
    OR is_platform_admin()
);

COMMENT ON POLICY profiles_org_select ON public.profiles IS
'Profile é visível se: (1) é o próprio user, (2) está na mesma org ativa (requesting_org_id), (3) está na org-parent da ativa (padrão funcionários compartilhados entre orgs filhas de um mesmo grupo — ex: Welcome Group → Trips/Weddings), (4) platform admin. Substitui o EXISTS em org_members que não funcionava para não-admins por conta da RLS org_members_select_own.';
