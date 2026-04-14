-- ============================================================================
-- Gap 1: Tornar ai_agents.ativa a fonte autoritativa de ON/OFF da IA
-- ============================================================================
-- Contexto: em 2026-04-14 clientes receberam mensagens indevidas porque a UI
-- desligava ai_agents.ativa mas o router lia apenas ai_agent_phone_line_config.ativa.
-- Esta migration:
--   1. Adiciona auditoria de quem/quando desligou o agente
--   2. Cascade: desligar o agente desliga automaticamente todas as configs de linha
--   3. NÃO cascateia reativação (religar agente não religa configs pausadas manualmente)
-- ============================================================================

-- 1. Colunas de auditoria
ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS ativa_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ativa_changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN ai_agents.ativa_changed_at IS 'Timestamp da última mudança de ativa (setado pelo trigger trg_ai_agents_ativa_audit)';
COMMENT ON COLUMN ai_agents.ativa_changed_by IS 'Quem fez a última mudança de ativa (auth.uid no momento do UPDATE)';

-- 2. Trigger de auditoria + cascade
CREATE OR REPLACE FUNCTION ai_agents_ativa_audit_cascade()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só age quando ativa mudou
  IF NEW.ativa IS DISTINCT FROM OLD.ativa THEN
    NEW.ativa_changed_at := NOW();
    NEW.ativa_changed_by := auth.uid();

    -- Cascade: desligar o agente desliga todas as configs de linha
    -- Religar NÃO religa automaticamente (regra de "menos surpreendente")
    IF NEW.ativa = false THEN
      UPDATE ai_agent_phone_line_config
      SET ativa = false
      WHERE agent_id = NEW.id
        AND ativa = true;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_agents_ativa_audit ON ai_agents;
CREATE TRIGGER trg_ai_agents_ativa_audit
  BEFORE UPDATE OF ativa ON ai_agents
  FOR EACH ROW
  EXECUTE FUNCTION ai_agents_ativa_audit_cascade();

COMMENT ON FUNCTION ai_agents_ativa_audit_cascade() IS
  'Gap 1 (incidente Luna 2026-04-14): preenche ativa_changed_at/by e cascata desligamento para ai_agent_phone_line_config';
