-- ============================================================================
-- Migration: Invite Cleanup Trigger
-- Purpose: When an invite is deleted, clean up orphaned auth.users records
--          to prevent "email already exists" errors on future invites.
-- ============================================================================

-- Create the cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_user_on_invite_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_last_sign_in TIMESTAMPTZ;
    v_profile_exists BOOLEAN;
BEGIN
    -- Check if a user exists with the deleted invite's email
    SELECT id, last_sign_in_at 
    INTO v_user_id, v_last_sign_in
    FROM auth.users
    WHERE email = OLD.email;
    
    -- If no user found, nothing to clean up
    IF v_user_id IS NULL THEN
        RETURN OLD;
    END IF;
    
    -- SAFETY CHECK: Only delete if user has NEVER signed in
    -- This protects real users who completed their signup
    IF v_last_sign_in IS NOT NULL THEN
        -- User has signed in at least once, don't delete them
        RETURN OLD;
    END IF;
    
    -- Check if user has any meaningful profile data (activity logs, cards, etc.)
    -- If they have activity, they're probably a real user even without login
    IF EXISTS (
        SELECT 1 FROM public.activities WHERE user_id = v_user_id LIMIT 1
    ) THEN
        RETURN OLD;
    END IF;
    
    -- Safe to delete: user never signed in and has no activity
    -- First delete the profile (to avoid FK constraint issues)
    DELETE FROM public.profiles WHERE id = v_user_id;
    
    -- Then delete from auth.users
    DELETE FROM auth.users WHERE id = v_user_id;
    
    RAISE NOTICE 'Cleaned up orphaned user % for email %', v_user_id, OLD.email;
    
    RETURN OLD;
END;
$$;

-- Create the trigger on the invitations table
DROP TRIGGER IF EXISTS trigger_cleanup_orphaned_user_on_invite_delete ON public.invitations;

CREATE TRIGGER trigger_cleanup_orphaned_user_on_invite_delete
    AFTER DELETE ON public.invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.cleanup_orphaned_user_on_invite_delete();

-- Add comment for documentation
COMMENT ON FUNCTION public.cleanup_orphaned_user_on_invite_delete IS 
    'Cleans up orphaned auth.users records when an invite is deleted. Only deletes users who never signed in and have no activity.';
