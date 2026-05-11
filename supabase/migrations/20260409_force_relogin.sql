-- Adiciona coluna para controlar quando forçar re-login de todos os usuários
ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS force_relogin_after TIMESTAMPTZ DEFAULT NULL;

COMMENT ON COLUMN organizations.force_relogin_after IS 'Quando definido, sessões iniciadas antes deste timestamp são invalidadas no frontend';
