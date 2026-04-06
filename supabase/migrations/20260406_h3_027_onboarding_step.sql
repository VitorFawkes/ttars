-- H3-027: onboarding_step em organizations
--
-- Rastreia progresso do wizard de onboarding do admin da org.
-- 0 = wizard não completado, 6 = completado.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'onboarding_step'
  ) THEN
    ALTER TABLE organizations ADD COLUMN onboarding_step INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE organizations ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- Para orgs existentes (Welcome Group), marcar como completado
UPDATE organizations
SET onboarding_step = 6, onboarding_completed_at = now()
WHERE id = 'a0000000-0000-0000-0000-000000000001'::UUID AND onboarding_step = 0;
