-- ============================================================================
-- Sofia v3 — modelo de dados pós painel de especialistas (2026-05-31)
-- Evolui a config (v2->v3): glossário de voz, momentos estruturados, critérios de
-- qualificação, política de preço (catálogo real), comportamentos (fronteiras),
-- encaminhamentos/alertas por tópico, modo de entrega. + tabelas de estado e buffer.
-- Tudo aditivo e idempotente (não clobbera valores já editados).
-- ============================================================================

-- --- 1) Config v3 (backfill da Sofia; só se ainda não for v3) ---
UPDATE wsdr_agent_config SET config =
  config
  || jsonb_build_object('config_version', 3)
  -- voz: + glossário (palavras usar/evitar)
  || jsonb_build_object('voice', (config->'voice')
       || jsonb_build_object('glossary', jsonb_build_object('marca', '[]'::jsonb, 'proibida', '[]'::jsonb)))
  -- qualificação: + critérios editáveis (importância) que alimentam a nota do Qualificador
  || jsonb_build_object('qualification', (config->'qualification')
       || jsonb_build_object('criteria', '[]'::jsonb))
  -- momentos estruturados (label/instrução/gatilho/modo/ordem) — seed via Patricia depois
  || jsonb_build_object('moments', '[]'::jsonb)
  -- política de preço (catálogo real por destino × convidados)
  || jsonb_build_object('pricing', jsonb_build_object(
       'mention_fee', true,
       'fee_min_brl', 4000,
       'fee_max_brl', 18000,
       'reveal_strategy', 'on_question',     -- always | on_question | on_hesitation | hand_to_planner
       'tone_on_pushback', 'empathetic',     -- empathetic | firm
       'can_negotiate', false,               -- padrão: não negocia (editável)
       'destination_ranges', '[
         {"destino":"Europa","moeda":"EUR","tiers":[{"convidados":20,"a_partir":18000},{"convidados":50,"a_partir":55000},{"convidados":100,"a_partir":120000}],"contexto":"a partir de, conforme escopo; inclui assessoria + cerimônia + jantar + festa; não inclui hospedagem/viagem"},
         {"destino":"Mendoza","moeda":"USD","tiers":[{"convidados":20,"a_partir":15000},{"convidados":50,"a_partir":26000},{"convidados":100,"a_partir":52000}],"contexto":"a partir de, conforme escopo"},
         {"destino":"Nordeste","moeda":"BRL","tiers":[{"convidados":20,"a_partir":40000},{"convidados":50,"a_partir":100000},{"convidados":100,"a_partir":200000}],"contexto":"a partir de, conforme escopo"},
         {"destino":"Caribe","moeda":"USD","tiers":[{"convidados":20,"a_partir":5000},{"convidados":50,"a_partir":10000},{"convidados":100,"a_partir":17000}],"contexto":"a partir de, conforme escopo"}
       ]'::jsonb))
  -- fronteiras: + comportamentos custom (linguagem simples: "nunca revele X", "não prometa Y")
  || jsonb_build_object('boundaries', (config->'boundaries')
       || jsonb_build_object('comportamentos', '[]'::jsonb))
  -- encaminhamentos/alertas por tópico (ex: lua de mel -> Agente de Viagem + alerta)
  || jsonb_build_object('referrals', jsonb_build_object(
       'enabled', true,
       'rules', '[
         {"topico":"lua de mel / viagem dos noivos","frase":"A lua de mel quem cuida é um Agente de Viagem aqui da equipe, já sinalizo pra ele falar com vocês","alerta":"notificar_travel_agent"}
       ]'::jsonb))
  -- entrega: modo único/faseado + espera adaptativa (debounce por silêncio)
  || jsonb_build_object('capabilities', (config->'capabilities')
       || jsonb_build_object('memory', COALESCE(config->'capabilities'->'memory','{}'::jsonb)
            || jsonb_build_object('delivery_mode', 'single', 'adaptive_wait', true, 'debounce_ms', 8000)))
WHERE slug = 'sofia-weddings'
  AND COALESCE(config->>'config_version','2') <> '3';

-- --- 2) Estado consolidado da conversa (o "cérebro humano" — Agente 1 escreve aqui) ---
CREATE TABLE IF NOT EXISTS wsdr_conversation_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  agent_slug TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  resumo TEXT NOT NULL DEFAULT '',        -- fatos estáveis do casal
  contexto TEXT NOT NULL DEFAULT '',      -- cronologia/estado da conversa
  sinais JSONB NOT NULL DEFAULT '{}'::jsonb, -- sinais silenciosos detectados {fuga:true, ...}
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, agent_slug, contact_phone)
);
COMMENT ON TABLE wsdr_conversation_state IS 'Estado consolidado por conversa (Agente Consolidador). Resumo+contexto+sinais.';
ALTER TABLE wsdr_conversation_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wsdr_cstate_org_all ON wsdr_conversation_state;
CREATE POLICY wsdr_cstate_org_all ON wsdr_conversation_state TO authenticated
  USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
DROP POLICY IF EXISTS wsdr_cstate_service_all ON wsdr_conversation_state;
CREATE POLICY wsdr_cstate_service_all ON wsdr_conversation_state TO service_role
  USING (TRUE) WITH CHECK (TRUE);
DROP TRIGGER IF EXISTS trg_wsdr_cstate_touch ON wsdr_conversation_state;
CREATE TRIGGER trg_wsdr_cstate_touch BEFORE UPDATE ON wsdr_conversation_state
  FOR EACH ROW EXECUTE FUNCTION wsdr_touch_updated_at();

-- --- 3) Buffer de mensagens (debounce por silêncio — espera o turno terminar) ---
CREATE TABLE IF NOT EXISTS wsdr_message_buffer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id),
  agent_slug TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,  -- mensagens acumuladas do turno
  last_at TIMESTAMPTZ NOT NULL DEFAULT now(),   -- timestamp da última msg (reinicia a espera)
  processing BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (org_id, agent_slug, contact_phone)
);
COMMENT ON TABLE wsdr_message_buffer IS 'Buffer p/ debounce por silêncio (última msg vence). Acumula o turno antes de responder.';
ALTER TABLE wsdr_message_buffer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wsdr_buffer_org_all ON wsdr_message_buffer;
CREATE POLICY wsdr_buffer_org_all ON wsdr_message_buffer TO authenticated
  USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());
DROP POLICY IF EXISTS wsdr_buffer_service_all ON wsdr_message_buffer;
CREATE POLICY wsdr_buffer_service_all ON wsdr_message_buffer TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- RPC org-safe p/ ler/gravar estado (n8n sem JWT)
CREATE OR REPLACE FUNCTION wsdr_get_conversation_state(p_org_id UUID, p_agent_slug TEXT, p_contact_phone TEXT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('resumo', COALESCE(resumo,''), 'contexto', COALESCE(contexto,''), 'sinais', COALESCE(sinais,'{}'::jsonb))
  FROM wsdr_conversation_state
  WHERE org_id = p_org_id AND agent_slug = p_agent_slug AND contact_phone = p_contact_phone
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION wsdr_save_conversation_state(p_org_id UUID, p_agent_slug TEXT, p_contact_phone TEXT, p_resumo TEXT, p_contexto TEXT, p_sinais JSONB DEFAULT '{}'::jsonb)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO wsdr_conversation_state (org_id, agent_slug, contact_phone, resumo, contexto, sinais)
  VALUES (p_org_id, p_agent_slug, p_contact_phone, COALESCE(p_resumo,''), COALESCE(p_contexto,''), COALESCE(p_sinais,'{}'::jsonb))
  ON CONFLICT (org_id, agent_slug, contact_phone)
  DO UPDATE SET resumo = EXCLUDED.resumo, contexto = EXCLUDED.contexto, sinais = EXCLUDED.sinais, updated_at = now();
END $$;
COMMENT ON FUNCTION wsdr_save_conversation_state IS 'Upsert do estado consolidado da conversa (Agente Consolidador, via n8n).';
