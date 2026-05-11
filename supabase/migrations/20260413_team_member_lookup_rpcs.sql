-- RPCs de lookup cross-org baseados em team_members.
-- Necessárias porque profile.team_id aponta para team da parent org, mas queries
-- operacionais precisam dos membros da team equivalente na org ativa.
--
-- Nota: só executa se as estruturas necessárias existirem (guarda contra staging incompleto).

DO $migration$
BEGIN

IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='team_members')
   OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='teams' AND column_name='org_id') THEN
    RAISE NOTICE 'Skipping RPC creation: team_members ou teams.org_id não existem neste banco';
    RETURN;
END IF;

-- Retorna user_ids que são membros de QUALQUER team em p_team_ids (via team_members).
-- Inclui também profiles.team_id legacy para não perder usuários não migrados.
EXECUTE $sql$
CREATE OR REPLACE FUNCTION public.get_team_member_ids(p_team_ids uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
    SELECT COALESCE(ARRAY_AGG(DISTINCT user_id), ARRAY[]::uuid[])
    FROM (
        SELECT tm.user_id FROM team_members tm WHERE tm.team_id = ANY(p_team_ids)
        UNION
        SELECT p.id AS user_id FROM profiles p WHERE p.team_id = ANY(p_team_ids)
    ) x;
$body$;
$sql$;

GRANT EXECUTE ON FUNCTION public.get_team_member_ids(uuid[]) TO authenticated, service_role;

-- team_id efetivo do usuário atual na ORG ATIVA (via team_members + team.org_id).
-- Fallback: profile.team_id (legacy).
EXECUTE $sql$
CREATE OR REPLACE FUNCTION public.get_my_active_team_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
    WITH my_org AS (SELECT requesting_org_id() AS org_id),
    active AS (
        SELECT t.id
        FROM team_members tm
        JOIN teams t ON t.id = tm.team_id
        CROSS JOIN my_org
        WHERE tm.user_id = auth.uid()
          AND t.org_id = my_org.org_id
        LIMIT 1
    ),
    legacy AS (SELECT team_id AS id FROM profiles WHERE id = auth.uid())
    SELECT COALESCE((SELECT id FROM active), (SELECT id FROM legacy));
$body$;
$sql$;

GRANT EXECUTE ON FUNCTION public.get_my_active_team_id() TO authenticated, service_role;

-- user_ids dos meus "colegas de time" na org ativa (inclui eu).
EXECUTE $sql$
CREATE OR REPLACE FUNCTION public.get_my_team_peer_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $body$
    WITH my_team AS (SELECT get_my_active_team_id() AS team_id),
    peers AS (
        SELECT DISTINCT tm.user_id
        FROM team_members tm, my_team
        WHERE tm.team_id = my_team.team_id
        UNION
        SELECT p.id AS user_id
        FROM profiles p, my_team
        WHERE p.team_id = my_team.team_id
    )
    SELECT COALESCE(ARRAY_AGG(DISTINCT user_id), ARRAY[]::uuid[]) FROM peers;
$body$;
$sql$;

GRANT EXECUTE ON FUNCTION public.get_my_team_peer_ids() TO authenticated, service_role;

END;
$migration$;
