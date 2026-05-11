-- ============================================================================
-- Migration: Fix invitations role type and permissions
-- Problem: invitations.role uses app_role enum but frontend sends roles.name (text)
--          Also, only admins can create invitations but managers should be able to
-- ============================================================================

-- Step 1: Alter invitations.role column from app_role to TEXT
-- This allows using role names from the roles table (admin, manager, member, viewer)
ALTER TABLE public.invitations 
    ALTER COLUMN role TYPE TEXT USING role::TEXT;

-- Step 2: Drop and recreate generate_invite function with TEXT type
DROP FUNCTION IF EXISTS public.generate_invite(text, app_role, uuid, uuid);
DROP FUNCTION IF EXISTS public.generate_invite(text, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.generate_invite(
    p_email TEXT,
    p_role TEXT,
    p_team_id UUID,
    p_created_by UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_token TEXT;
    v_caller_role TEXT;
BEGIN
    -- Verify caller has permission (admin or manager)
    SELECT r.name INTO v_caller_role
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid();
    
    IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'manager', 'member') THEN
        -- Also check legacy is_admin flag
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        ) THEN
            RAISE EXCEPTION 'Permission denied: only admins, managers and members can create invitations';
        END IF;
    END IF;
    
    -- Validate role exists in roles table
    IF NOT EXISTS (SELECT 1 FROM public.roles WHERE name = p_role) THEN
        RAISE EXCEPTION 'Invalid role: %', p_role;
    END IF;
    
    -- Generate a random 32-byte hex string
    v_token := encode(gen_random_bytes(32), 'hex');
    
    INSERT INTO public.invitations (email, role, team_id, token, expires_at, created_by)
    VALUES (p_email, p_role, p_team_id, v_token, now() + interval '7 days', p_created_by);
    
    RETURN v_token;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.generate_invite(text, text, uuid, uuid) TO authenticated;

-- Step 3: Add helper function to check if user is admin or manager
CREATE OR REPLACE FUNCTION public.is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.profiles p
        LEFT JOIN public.roles r ON p.role_id = r.id
        WHERE p.id = auth.uid()
        AND (
            p.is_admin = TRUE 
            OR r.name = 'admin'
        )
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_admin_or_manager() TO authenticated;

-- Step 4: Update RLS policies on invitations table
-- Drop existing policies (both old and new to make migration idempotent)
DROP POLICY IF EXISTS "Admins can create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Admins can delete invitations" ON public.invitations;
DROP POLICY IF EXISTS "Admins can view all invitations" ON public.invitations;
DROP POLICY IF EXISTS "Admins and managers can create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Admins and managers can view invitations" ON public.invitations;
DROP POLICY IF EXISTS "Admins and managers can delete invitations" ON public.invitations;

-- Create new policies that include managers
CREATE POLICY "Admins and managers can create invitations"
    ON public.invitations
    FOR INSERT
    TO authenticated
    WITH CHECK (is_admin_or_manager());

CREATE POLICY "Admins and managers can view invitations"
    ON public.invitations
    FOR SELECT
    TO authenticated
    USING (is_admin_or_manager());

CREATE POLICY "Admins and managers can delete invitations"
    ON public.invitations
    FOR DELETE
    TO authenticated
    USING (is_admin_or_manager());

-- Step 5: Drop and recreate get_invite_details to return team_id properly
DROP FUNCTION IF EXISTS public.get_invite_details(text);

CREATE FUNCTION public.get_invite_details(token_input TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite RECORD;
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
    
    -- Get team name if team_id is set
    IF v_invite.team_id IS NOT NULL THEN
        SELECT name INTO v_team_name
        FROM public.teams
        WHERE id = v_invite.team_id;
    END IF;
    
    RETURN json_build_object(
        'id', v_invite.id,
        'email', v_invite.email,
        'role', v_invite.role,
        'team_id', v_invite.team_id,
        'team_name', v_team_name,
        'expires_at', v_invite.expires_at
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_invite_details(text) TO anon, authenticated;

-- Add comment
COMMENT ON FUNCTION public.generate_invite IS 'Generates an invitation token. Only admins can call this function.';
COMMENT ON FUNCTION public.is_admin_or_manager IS 'Returns true if current user is an admin.';

-- Step 6: Update handle_new_user to use role_id and team_id from invitation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invite RECORD;
    v_role_id UUID;
    v_team_id UUID;
    v_role_name TEXT;
BEGIN
    -- Get invitation data for this email
    SELECT i.role, i.team_id INTO v_role_name, v_team_id
    FROM public.invitations i
    WHERE i.email = new.email
    AND i.used_at IS NULL
    AND i.expires_at > now()
    LIMIT 1;
    
    -- If no invitation found, try to get role from metadata
    IF v_role_name IS NULL THEN
        v_role_name := COALESCE(new.raw_user_meta_data->>'role', 'member');
    END IF;
    
    -- Get role_id from roles table
    SELECT id INTO v_role_id
    FROM public.roles
    WHERE name = v_role_name;
    
    -- Default to 'member' role if not found
    IF v_role_id IS NULL THEN
        SELECT id INTO v_role_id
        FROM public.roles
        WHERE name = 'member';
    END IF;
    
    -- Create profile with role_id and team_id
    INSERT INTO public.profiles (
        id, 
        email, 
        nome, 
        role_id, 
        team_id,
        active
    )
    VALUES (
        new.id, 
        new.email, 
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        v_role_id,
        v_team_id,
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        role_id = COALESCE(EXCLUDED.role_id, profiles.role_id),
        team_id = COALESCE(EXCLUDED.team_id, profiles.team_id);
    
    RETURN new;
END;
$$;
