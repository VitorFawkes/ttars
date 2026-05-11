-- Backup completo de ai_agent_moments da Estela antes do redesign 2026-05-11.
-- Permite rollback se redesign der errado:
--   UPDATE ai_agent_moments t SET discovery_config = b.discovery_config
--   FROM ai_agent_moments_backup_20260512 b WHERE t.id = b.id;
-- Pode dropar após 90 dias quando Estela estiver estável.

CREATE TABLE IF NOT EXISTS ai_agent_moments_backup_20260512 AS
SELECT * FROM ai_agent_moments
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8';

COMMENT ON TABLE ai_agent_moments_backup_20260512 IS
  'Backup pré-redesign 2026-05-11 dos moments da Estela. Permite rollback. Dropar após 2026-08-11 se Estela estável.';
