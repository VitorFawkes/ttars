-- Enable RLS on invitations table (already enabled, but good practice to ensure)
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Policy for Admins to view all invitations
CREATE POLICY "Admins can view all invitations"
ON public.invitations
FOR SELECT
TO authenticated
USING (
  public.is_admin()
);

-- Policy for Admins to create invitations
CREATE POLICY "Admins can create invitations"
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin()
);

-- Policy for Admins to delete invitations
CREATE POLICY "Admins can delete invitations"
ON public.invitations
FOR DELETE
TO authenticated
USING (
  public.is_admin()
);
