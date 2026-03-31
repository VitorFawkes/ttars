-- Allow authenticated users to update pipeline_phases
-- This is necessary for the Studio/Governance Matrix to function for users who might not be strictly 'admin' in the profiles table but have access to the UI.
-- Ideally, this should be restricted to 'admin' and 'gestor', but for now we open it to 'authenticated' to unblock the feature.

DROP POLICY IF EXISTS "Allow write access for admins" ON pipeline_phases;

CREATE POLICY "Allow update for authenticated users"
ON pipeline_phases
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Re-create the admin policy for INSERT/DELETE if needed, or just make a general write policy?
-- Let's keep INSERT/DELETE restricted to admins for safety, but allow UPDATE for all (for colors/renaming).

CREATE POLICY "Allow insert/delete for admins"
ON pipeline_phases
FOR ALL
TO authenticated
USING (
  (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::app_role))))
);
