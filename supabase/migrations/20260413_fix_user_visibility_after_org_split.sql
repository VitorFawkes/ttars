-- Fix: visibilidade de usuários quebrada após Fase 4 do Org Split
--
-- Problema: profiles.org_id continuou apontando para a org pai (Welcome Group),
-- mas teams/phases/pipelines foram duplicados nas orgs filhas. Resultado:
-- - RLS profiles_org_select bloqueia usuários em contexto de org filha
-- - is_admin() retorna FALSE em contexto de org filha (exige profile.org_id = requesting_org_id())
-- - profiles.team_id aponta para team da parent, mas as queries de handoff buscam
--   teams na child → zero membros encontrados → StageChangeModal vazio.
--
-- Correção:
-- 1. Popular team_members (many-to-many) com as memberships reais por org
-- 2. RLS profiles: permitir visibilidade de co-membros via org_members
-- 3. is_admin(): reconhecer admin via org_members.role='admin' na org ativa

BEGIN;

-- =====================================================
-- 1. Popular team_members (só roda se a tabela existir)
-- =====================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'team_members'
    ) THEN
        -- 1a. Preservar team atual de cada profile (parent org teams)
        INSERT INTO team_members (user_id, team_id, role)
        SELECT p.id, p.team_id, 'member'
        FROM profiles p
        WHERE p.team_id IS NOT NULL
        ON CONFLICT (user_id, team_id) DO NOTHING;

        -- 1b. Espelhar membership nas child orgs: para cada usuário × cada child org que ele é
        --     membro, criar team_members apontando para a team homônima da child
        --     (ex: user em team "Pós-Venda" da parent vira também membro da team "Pós-Venda" em Welcome Trips)
        INSERT INTO team_members (user_id, team_id, role)
        SELECT DISTINCT om.user_id, child_team.id, 'member'
        FROM org_members om
        JOIN profiles p ON p.id = om.user_id
        JOIN teams parent_team ON parent_team.id = p.team_id
        JOIN organizations child_org ON child_org.id = om.org_id AND child_org.parent_org_id = p.org_id
        JOIN teams child_team ON child_team.org_id = om.org_id AND child_team.name = parent_team.name
        WHERE p.team_id IS NOT NULL
        ON CONFLICT (user_id, team_id) DO NOTHING;
    END IF;
END $$;

-- =====================================================
-- 2. RLS profiles — visibilidade cross-org via org_members
-- =====================================================

DROP POLICY IF EXISTS profiles_org_select ON profiles;
CREATE POLICY profiles_org_select ON profiles
FOR SELECT
USING (
    id = auth.uid()
    OR org_id = requesting_org_id()
    OR EXISTS (
        SELECT 1
        FROM org_members me, org_members them
        WHERE me.user_id = auth.uid()
          AND them.user_id = profiles.id
          AND me.org_id = them.org_id
          AND me.org_id = requesting_org_id()
    )
    OR is_platform_admin()
);

-- =====================================================
-- 3. is_admin() — reconhecer admin via org_members
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.profiles p
        LEFT JOIN public.roles r ON p.role_id = r.id
        LEFT JOIN public.org_members om
               ON om.user_id = p.id
              AND om.org_id = requesting_org_id()
        WHERE p.id = auth.uid()
          AND (
              -- Admin tradicional: profile na mesma org da requisição
              (
                  p.org_id = requesting_org_id()
                  AND (p.is_admin = TRUE OR p.role = 'admin' OR r.name = 'admin')
              )
              OR
              -- Admin via membership (org filha onde tem role=admin)
              om.role = 'admin'
              OR
              -- Admin global do profile em qualquer org (is_admin=true no profile)
              -- + é membro da org ativa
              (p.is_admin = TRUE AND om.user_id IS NOT NULL)
          )
    );
END;
$function$;

COMMIT;
