-- ============================================================================
-- Migration: Add reset_user_password RPC
-- Purpose: Allow admins to reset a user's password
-- Pattern: Same as delete_user (SECURITY DEFINER + admin check)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_user_password(p_user_id UUID, p_new_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Verify caller has permission (admin) — same pattern as delete_user
    SELECT r.name INTO v_caller_role
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid();

    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = TRUE
        ) THEN
            RAISE EXCEPTION 'Permission denied: only admins can reset passwords';
        END IF;
    END IF;

    -- Prevent resetting own password via admin function
    IF p_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Use profile settings to change your own password';
    END IF;

    -- Validate minimum password length
    IF LENGTH(p_new_password) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters';
    END IF;

    -- Update password in auth.users using pgcrypto from extensions schema
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
        updated_at = NOW()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;
END;
$$;

-- Grant execute to authenticated users (RPC checks admin internally)
GRANT EXECUTE ON FUNCTION public.reset_user_password(UUID, TEXT) TO authenticated;
