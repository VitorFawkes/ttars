-- ============================================================================
-- SDR Weddings (agente novo "Sofia", ISOLADO) — config editável por UI
-- Módulo wsdr_* : SEM relação/FK com ai_agents/ai_agent_* (Patricia/Estela).
-- A tela edita esta tabela; o n8n lê via RPC wsdr_get_config (sem JWT).
-- ============================================================================

CREATE TABLE IF NOT EXISTS wsdr_agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  slug TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

COMMENT ON TABLE wsdr_agent_config IS 'Config editável do SDR Weddings (agente Sofia, isolado). Lido pelo n8n via wsdr_get_config.';

ALTER TABLE wsdr_agent_config ENABLE ROW LEVEL SECURITY;

-- Par canônico: authenticated org-scoped + service_role full. NUNCA USING(true) p/ authenticated.
DROP POLICY IF EXISTS wsdr_agent_config_org_all ON wsdr_agent_config;
CREATE POLICY wsdr_agent_config_org_all ON wsdr_agent_config TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS wsdr_agent_config_service_all ON wsdr_agent_config;
CREATE POLICY wsdr_agent_config_service_all ON wsdr_agent_config TO service_role
  USING (true) WITH CHECK (true);

-- updated_at automático
CREATE OR REPLACE FUNCTION wsdr_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_wsdr_agent_config_touch ON wsdr_agent_config;
CREATE TRIGGER trg_wsdr_agent_config_touch
  BEFORE UPDATE ON wsdr_agent_config
  FOR EACH ROW EXECUTE FUNCTION wsdr_touch_updated_at();

-- RPC para o n8n (chamado sem sessão/JWT) — recebe o slug por parâmetro.
CREATE OR REPLACE FUNCTION wsdr_get_config(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT config FROM wsdr_agent_config WHERE slug = p_slug LIMIT 1;
$$;

COMMENT ON FUNCTION wsdr_get_config IS 'Retorna a config do SDR Weddings por slug. Usado pelo n8n (sem JWT).';

-- Seed: a Sofia com os valores atuais (mantém comportamento idêntico ao hardcoded).
-- Org Welcome Weddings = b0000000-0000-0000-0000-000000000002.
INSERT INTO wsdr_agent_config (org_id, slug, config)
VALUES (
  'b0000000-0000-0000-0000-000000000002',
  'sofia-weddings',
  jsonb_build_object(
    'persona_nome', 'Sofia',
    'empresa', 'Welcome Weddings',
    'proposta', 'a gente faz destination wedding desde 2012 e já foi premiada como uma das melhores produtoras de destination wedding da América Latina',
    'tom', 'acolhedor',
    'abertura', 'Oi! Aqui é a Sofia, da Welcome Weddings, tudo bem? Como é o nome de vocês? A gente faz destination wedding desde 2012 e já foi premiada como uma das melhores produtoras de destination wedding da América Latina. A ideia aqui é uma conversa rápida pra eu entender o que vocês esperam, tirar dúvidas e, se fizer sentido, marcar um papo com a nossa Wedding Planner. Pra começar: o que é o casamento pra vocês, e como vocês imaginam ele?',
    'etapas', jsonb_build_array(
      'O que é o casamento pra vocês e como imaginam ele',
      'Destino ou região',
      'Número de convidados (estimado)',
      'Faixa de investimento / orçamento'
    ),
    'faixas_orcamento', jsonb_build_array('R$ 80 a 150 mil', 'R$ 150 a 250 mil', 'R$ 250 a 400 mil', 'R$ 400 mil ou mais'),
    'fronteiras', jsonb_build_array(
      'Nunca dar preço fechado nem chutar valor — remeter à Wedding Planner',
      'Nunca inventar data ou horário de reunião — perguntar o melhor período e dizer que reserva com a Planner',
      'Nunca usar clichê (casamento dos sonhos, experiência premium, pode deixar com a gente)'
    )
  )
)
ON CONFLICT (org_id, slug) DO NOTHING;
