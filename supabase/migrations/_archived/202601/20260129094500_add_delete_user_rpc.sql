-- ============================================================================
-- Migration: Add delete_user RPC
-- Purpose: Allow admins to delete users from auth.users (cascades to profiles)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_user(user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_role TEXT;
BEGIN
    -- Verify caller has permission (admin)
    SELECT r.name INTO v_caller_role
    FROM public.profiles p
    JOIN public.roles r ON p.role_id = r.id
    WHERE p.id = auth.uid();
    
    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
        -- Also check legacy is_admin flag
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND is_admin = TRUE
        ) THEN
            RAISE EXCEPTION 'Permission denied: only admins can delete users';
        END IF;
    END IF;

    -- Delete from auth.users (this will cascade to profiles via FK)
    DELETE FROM auth.users WHERE id = user_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.delete_user(UUID) TO authenticated;
