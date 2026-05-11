-- H3-031: get_invite_details retorna org_id
--
-- Bug: o InvitePage registra aceite de termos em terms_acceptance com o
-- org_id do convite. Mas a função get_invite_details() não retornava org_id
-- no JSON, então o registro ficava com org_id null (auditoria órfã).
--
-- Fix: adicionar org_id ao json_build_object retornado.

CREATE OR REPLACE FUNCTION public.get_invite_details(token_input text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite    RECORD;
    v_team_name TEXT;
BEGIN
    SELECT * INTO v_invite
    FROM public.invitations
    WHERE token = token_input
      AND used_at IS NULL
      AND expires_at > now();

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_invite.team_id IS NOT NULL THEN
        SELECT name INTO v_team_name
        FROM public.teams
        WHERE id = v_invite.team_id;
    END IF;

    RETURN json_build_object(
        'id',        v_invite.id,
        'email',     v_invite.email,
        'role',      v_invite.role,
        'team_id',   v_invite.team_id,
        'team_name', v_team_name,
        'expires_at', v_invite.expires_at,
        'produtos',  v_invite.produtos,
        'org_id',    v_invite.org_id  -- H3-031: necessário para terms_acceptance
    );
END;
$$;
