-- Feature flag pra ligar/desligar schema novo (goal/must_include/example_questions/literal_question)
-- sem redeploy. Default FALSE pra zero risco em todos agentes existentes.
-- Liga só pra Estela após migration de dados validada por Vitor no Pipeline Studio.

ALTER TABLE ai_agents
  ADD COLUMN IF NOT EXISTS feature_flag_discovery_v2 BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ai_agents.feature_flag_discovery_v2 IS
  'Quando TRUE, router usa novo schema de slot (goal/must_include/example_questions/literal_question). Default FALSE mantém comportamento legado (deriveSlotQuestion). Liga só pra Estela inicialmente. Permite rollback runtime sem redeploy.';
