-- ============================================================================
-- Migration: Add update_user_email RPC
-- Purpose: Allow admins to change a user's login email
-- Pattern: Same as reset_user_password (SECURITY DEFINER + admin check)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_user_email(p_user_id UUID, p_new_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
    v_trimmed_email TEXT;
BEGIN
    -- Normalize email
    v_trimmed_email := LOWER(TRIM(p_new_email));

    -- Verify caller has permission (admin) — same pattern as reset_user_password
    SELECT r.name INTO v_caller_role
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = TRUE
        ) THEN
            RAISE EXCEPTION 'Permission denied: only admins can change user emails';
        END IF;
    END IF;

    -- Prevent changing own email via admin function
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Use profile settings to change your own email';
    END IF;

    -- Validate email format
    IF v_trimmed_email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
        RAISE EXCEPTION 'Invalid email format';
    END IF;

    -- Check uniqueness in auth.users
    IF EXISTS (
        SELECT 1 FROM auth.users
        WHERE email = v_trimmed_email AND id != p_user_id
    ) THEN
        RAISE EXCEPTION 'Email already in use by another user';
    END IF;

    -- Update auth.users (login credential)
    UPDATE auth.users
    SET email = v_trimmed_email,
        email_confirmed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    -- Update profiles table (display/query)
    UPDATE public.profiles
    SET email = v_trimmed_email,
        updated_at = NOW()
    WHERE id = p_user_id;
END;
$$;

-- Grant execute to authenticated users (RPC checks admin internally)
GRANT EXECUTE ON FUNCTION public.update_user_email(UUID, TEXT) TO authenticated;
