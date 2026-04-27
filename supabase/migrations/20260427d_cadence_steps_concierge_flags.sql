-- =====================================================================
-- Módulo Concierge — Marco 1 (Fundação)
-- 20260427d: estender cadence_steps com flags pra geração de atendimento concierge
--
-- Quando um cadence_step tem gera_atendimento_concierge=true, o motor de
-- cadências (que já cria tarefas) também cria o complemento atendimentos_concierge.
-- =====================================================================

ALTER TABLE cadence_steps
  ADD COLUMN IF NOT EXISTS gera_atendimento_concierge BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS tipo_concierge TEXT
    CHECK (tipo_concierge IS NULL OR tipo_concierge IN ('oferta', 'reserva', 'suporte', 'operacional')),
  ADD COLUMN IF NOT EXISTS categoria_concierge TEXT,
  ADD COLUMN IF NOT EXISTS condicao_extra JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN cadence_steps.gera_atendimento_concierge IS
  'Se true, o motor de cadência também cria atendimentos_concierge linkado à tarefa criada';
COMMENT ON COLUMN cadence_steps.tipo_concierge IS
  'Tipo do atendimento concierge a ser criado (oferta/reserva/suporte/operacional)';
COMMENT ON COLUMN cadence_steps.categoria_concierge IS
  'Categoria do atendimento concierge (passaporte, check_in, welcome_letter, etc.)';
COMMENT ON COLUMN cadence_steps.condicao_extra IS
  'Condições extras pra disparar o step. Exemplo: {"requer_lua_de_mel": true, "requer_hospedagem": true}';

-- Constraint: se gera_atendimento_concierge=true, precisa ter tipo + categoria
ALTER TABLE cadence_steps DROP CONSTRAINT IF EXISTS cadence_steps_concierge_consistency;
ALTER TABLE cadence_steps ADD CONSTRAINT cadence_steps_concierge_consistency
  CHECK (
    gera_atendimento_concierge = false
    OR (tipo_concierge IS NOT NULL AND categoria_concierge IS NOT NULL)
  );
