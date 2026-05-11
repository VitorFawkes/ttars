-- ============================================================================
-- Migration: Fix generate_invite search_path
-- Problem: generate_invite sets search_path=public but gen_random_bytes is in extensions
-- ============================================================================

-- Drop the function first to avoid "cannot remove parameter defaults" error
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
SET search_path = public, extensions -- Added extensions to search_path
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
