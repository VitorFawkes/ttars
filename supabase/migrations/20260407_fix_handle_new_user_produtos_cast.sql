-- Fix #2: handle_new_user ainda falhava em produtos
-- Erro: column "produtos" is of type app_product[] but expression is of type text[]
-- O fix anterior corrigiu apenas o cast de role.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_invite RECORD;
    v_org_id UUID;
BEGIN
    -- Check if user was invited
    SELECT i.org_id, i.role, i.team_id, i.produtos
    INTO v_invite
    FROM invitations i
    WHERE i.email = NEW.email
      AND i.used_at IS NULL
      AND i.expires_at > NOW()
    LIMIT 1;

    -- Determine org_id: from invitation or default
    v_org_id := COALESCE(v_invite.org_id, 'a0000000-0000-0000-0000-000000000001'::UUID);

    INSERT INTO public.profiles (id, email, nome, role, team_id, produtos, org_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(v_invite.role, 'vendas')::app_role,
        v_invite.team_id,
        COALESCE(v_invite.produtos, ARRAY['TRIPS'])::app_product[],
        v_org_id
    );

    -- Mark invitation as used
    IF v_invite IS NOT NULL THEN
        UPDATE invitations
        SET used_at = NOW()
        WHERE email = NEW.email
          AND used_at IS NULL
          AND org_id = v_org_id;
    END IF;

    RETURN NEW;
END;
$function$;
