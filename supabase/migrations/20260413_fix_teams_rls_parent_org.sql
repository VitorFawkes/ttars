-- =========================================================================
-- Fix teams_org_select — users em org filha não viam teams da parent
-- =========================================================================
-- Contexto: profiles.team_id aponta para teams com org_id=Welcome Group
-- (parent). User logado em org filha (Trips/Weddings) via requesting_org_id()
-- só via teams da própria filha — logo qualquer JOIN profile→team retornava
-- team NULL, quebrando agrupamento por time em UIs (ex: dropdown de
-- Responsável no SmartTaskModal).
--
-- Fix: alinhar com o padrão de contatos/profiles — aceitar match em
-- parent_org_id. Admins já tinham acesso via teams_org_admin_all.
-- =========================================================================

DROP POLICY IF EXISTS teams_org_select ON public.teams;

CREATE POLICY teams_org_select ON public.teams
FOR SELECT
USING (
    org_id = requesting_org_id()
    OR org_id = requesting_parent_org_id()
);

COMMENT ON POLICY teams_org_select ON public.teams IS
'Team é visível para qualquer user da mesma org ou da org-parent (padrão grupo compartilhado Welcome Group → Trips/Weddings). Alinhado com contatos_org_select e profiles_org_select.';
