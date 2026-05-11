-- Add is_admin column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- Migrate existing admins
UPDATE public.profiles SET is_admin = true WHERE role = 'admin';

-- Update is_admin function to check both
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND (role = 'admin' OR is_admin = true)
    );
END;
$$;
