-- =============================================================================
-- Migration: Adicionar info de fase do time na view_profiles_complete
-- Problema: teams.phase_id (FK para pipeline_phases) existe mas a view não
--           expõe a fase associada ao time do usuário.
-- Solução: Adicionar LEFT JOIN pipeline_phases e expor phase_id, name, slug, color
-- Data: 2026-02-19
-- =============================================================================

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
    d.name as department_name,
    -- Phase info (fase do pipeline associada ao time)
    pp.id as team_phase_id,
    pp.name as team_phase_name,
    pp.slug as team_phase_slug,
    pp.color as team_phase_color
FROM public.profiles p
LEFT JOIN public.roles r ON p.role_id = r.id
LEFT JOIN public.teams t ON p.team_id = t.id
LEFT JOIN public.departments d ON t.department_id = d.id
LEFT JOIN public.pipeline_phases pp ON t.phase_id = pp.id;

-- Manter security_invoker = true (definido em 20260128210000)
ALTER VIEW public.view_profiles_complete SET (security_invoker = true);

-- Garantir acesso
GRANT SELECT ON public.view_profiles_complete TO authenticated;
