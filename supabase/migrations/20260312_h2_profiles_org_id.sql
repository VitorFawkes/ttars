-- H2: Adicionar org_id a profiles
-- DEFAULT garante que novos users (via auth trigger) são atribuídos à Welcome Group
-- Backfill garante que profiles existentes também recebem org_id

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS org_id UUID
    REFERENCES organizations(id)
    DEFAULT 'a0000000-0000-0000-0000-000000000001';

-- Backfill: todos os profiles existentes → Welcome Group
UPDATE profiles
SET org_id = 'a0000000-0000-0000-0000-000000000001'
WHERE org_id IS NULL;

-- Tornar NOT NULL após backfill
ALTER TABLE profiles
    ALTER COLUMN org_id SET NOT NULL;

COMMENT ON COLUMN profiles.org_id IS 'H2: Organização do usuário. Default: Welcome Group. Será usado em JWT claims (H2 task 4).';
