-- Fix: handle_new_user NÃO setava role_id ao criar profile via convite.
-- Resultado: tag de role ficava cinza (fallback para slug cru).
-- Solução: lookup do role_id na tabela roles pelo nome do role.
-- Também inclui backfill de segurança para profiles existentes sem role_id.

-- ─── PASSO 1: Backfill de segurança (profiles ativos sem role_id) ───

UPDATE profiles p
SET role_id = r.id
FROM roles r
WHERE p.role_id IS NULL
  AND p.role IS NOT NULL
  AND r.name = p.role::TEXT
  AND r.is_system = false;

-- ─── PASSO 2: Atualizar trigger handle_new_user ───

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_invite RECORD;
    v_org_id UUID;
    v_role app_role;
    v_role_id UUID;
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

    -- Determine role
    v_role := COALESCE(v_invite.role, 'vendas')::app_role;

    -- Lookup role_id from roles table (garante tag formatada desde o primeiro login)
    SELECT r.id INTO v_role_id
    FROM roles r
    WHERE r.name = v_role::TEXT
      AND r.is_system = false
    LIMIT 1;

    INSERT INTO public.profiles (id, email, nome, role, role_id, team_id, produtos, org_id)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        v_role,
        v_role_id,
        v_invite.team_id,
        COALESCE(v_invite.produtos, ARRAY['TRIPS']),
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
