-- Sprint B — Linha WhatsApp obrigatória + HSM condicional à linha
--
-- Antes: cadence-engine caía num fallback indeterminado (`SELECT * FROM
-- whatsapp_linha_config WHERE ativo=true LIMIT 1`) quando action_config não
-- trazia phone_number_id. Em Trips hoje isso poderia rotear a mensagem por
-- qualquer uma das 4 linhas ativas, aleatoriamente.
--
-- Depois:
--   1. phone_number_id é OBRIGATÓRIO em send_message (CHECK).
--   2. Regra HSM passa a depender da linha, não do evento:
--      - Linha oficial Meta (phone_number_id numérico) + evento proativo →
--        exige HSM. Texto livre cai no buraco 131047.
--      - Linha não-oficial (UUID Echo/ChatPro) → texto livre sempre permitido.
--      - Linha oficial Meta + evento reativo (inbound_message_pattern) →
--        qualquer modo permitido (janela 24h aberta).

BEGIN;

-- 1) Helper: phone_number_id é oficial Meta (puramente numérico)?
CREATE OR REPLACE FUNCTION public.is_official_meta_phone(p_phone_number_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_phone_number_id IS NOT NULL
         AND p_phone_number_id ~ '^\d+$';
$$;

COMMENT ON FUNCTION public.is_official_meta_phone(TEXT) IS
'TRUE se phone_number_id é oficial Meta (numérico). Linhas não-oficiais (Echo/ChatPro) usam UUID.';

-- 2) Helper: event_type é proativo?
-- Proativo = dispara sem conversa recente do cliente. Cai fora da janela 24h
-- do WhatsApp. Com linha oficial Meta, exige HSM.
-- Reativo = inbound_message_pattern (cliente acabou de mandar mensagem, texto livre passa).
CREATE OR REPLACE FUNCTION public.is_proactive_event_type(p_event_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_event_type IN (
    'card_created',
    'stage_enter',
    'macro_stage_enter',
    'field_changed',
    'tag_added',
    'tag_removed',
    'cron_roteamento'
  );
$$;

COMMENT ON FUNCTION public.is_proactive_event_type(TEXT) IS
'TRUE se o evento dispara sem conversa recente (fora da janela 24h do WhatsApp). Com linha oficial Meta, esses eventos exigem HSM.';

-- 3) CHECK: send_message precisa de phone_number_id em action_config.
-- Pré-voo confirmou que nenhum trigger ativo hoje viola essa regra.
ALTER TABLE public.cadence_event_triggers
  ADD CONSTRAINT cadence_event_triggers_send_message_requires_phone
  CHECK (
    action_type <> 'send_message'
    OR (
      action_config IS NOT NULL
      AND COALESCE(NULLIF(TRIM(action_config->>'phone_number_id'), ''), NULL) IS NOT NULL
    )
  );

-- 4) Trigger: HSM obrigatório se linha oficial Meta + evento proativo + send_message.
-- (CHECK não consegue fazer lookup cross-table, por isso é trigger — lê a linha
-- do próprio action_config.phone_number_id e aplica a regra de negócio.)
CREATE OR REPLACE FUNCTION public.cadence_event_triggers_enforce_hsm_for_proactive()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_phone_number_id TEXT;
  v_has_hsm BOOLEAN;
BEGIN
  IF NEW.action_type <> 'send_message' THEN
    RETURN NEW;
  END IF;

  v_phone_number_id := NULLIF(TRIM(NEW.action_config->>'phone_number_id'), '');

  -- CHECK barra antes, mas defesa:
  IF v_phone_number_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Linha não-oficial: texto livre sempre permitido.
  IF NOT public.is_official_meta_phone(v_phone_number_id) THEN
    RETURN NEW;
  END IF;

  -- Evento reativo (inbound_message_pattern): janela 24h aberta.
  IF NOT public.is_proactive_event_type(NEW.event_type) THEN
    RETURN NEW;
  END IF;

  -- Linha oficial Meta + evento proativo → exige HSM.
  v_has_hsm := (NEW.action_config ? 'hsm_template_name')
               AND COALESCE(NULLIF(TRIM(NEW.action_config->>'hsm_template_name'), ''), NULL) IS NOT NULL;

  IF NOT v_has_hsm THEN
    RAISE EXCEPTION 'Linha oficial Meta em gatilho proativo exige template HSM aprovado. Escolha um template no action_config.hsm_template_name (ou troque para linha não-oficial, ou use gatilho reativo como inbound_message_pattern).'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cadence_event_triggers_enforce_hsm ON public.cadence_event_triggers;
CREATE TRIGGER trg_cadence_event_triggers_enforce_hsm
BEFORE INSERT OR UPDATE ON public.cadence_event_triggers
FOR EACH ROW
EXECUTE FUNCTION public.cadence_event_triggers_enforce_hsm_for_proactive();

-- 5) Sanidade: as 2 automations ativas continuam passando (nenhuma é send_message).
DO $$
DECLARE
  v_active_count INT;
BEGIN
  SELECT COUNT(*) INTO v_active_count
  FROM public.cadence_event_triggers
  WHERE is_active = true;

  IF v_active_count <> 2 THEN
    RAISE EXCEPTION 'Sprint B: esperado 2 automations ativas, achei %', v_active_count;
  END IF;

  RAISE NOTICE 'Sprint B: % automations ativas preservadas', v_active_count;
END $$;

COMMIT;
