-- ============================================================================
-- FIX: Triggers/funcoes do Marco 3 referenciavam coluna inexistente
-- ============================================================================
-- Bug: fn_enqueue_outbound_on_card_created e fn_enqueue_idle_followups usam
--      NEW.contato_principal_id / c.contato_principal_id, mas a coluna real
--      em cards e pessoa_principal_id. Resultado: INSERT em cards falha com
--      "record 'new' has no field 'contato_principal_id'".
--
-- Tambem corrige fn_enqueue_idle_followups: c.status nao existe (correto:
-- status_comercial). Valor "novo" nao existe — usar apenas 'aberto'.
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_enqueue_outbound_on_card_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_contato RECORD;
  v_phone TEXT;
  v_form_data JSONB;
  v_trigger_config JSONB;
  v_conditions JSONB;
  v_origens_permitidas JSONB;
  v_delay_seconds INT;
  v_scheduled TIMESTAMPTZ;
BEGIN
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
  IF NEW.pessoa_principal_id IS NULL THEN RETURN NEW; END IF;

  SELECT id, telefone, nome, sobrenome INTO v_contato
    FROM contatos WHERE id = NEW.pessoa_principal_id;

  IF v_contato IS NULL OR v_contato.telefone IS NULL OR v_contato.telefone = '' THEN
    RETURN NEW;
  END IF;

  v_phone := v_contato.telefone;
  v_form_data := COALESCE(NEW.produto_data, '{}'::JSONB);

  FOR v_agent IN
    SELECT id, outbound_trigger_config, first_message_config
      FROM ai_agents
     WHERE org_id = NEW.org_id
       AND produto::TEXT = NEW.produto::TEXT
       AND ativa = true
       AND interaction_mode IN ('outbound', 'hybrid')
       AND outbound_trigger_config IS NOT NULL
  LOOP
    v_trigger_config := v_agent.outbound_trigger_config;

    FOR v_conditions IN
      SELECT jsonb_array_elements(v_trigger_config->'triggers')
    LOOP
      IF v_conditions->>'type' = 'card_created' THEN
        v_origens_permitidas := v_conditions->'conditions'->'origem';
        IF v_origens_permitidas IS NOT NULL AND jsonb_typeof(v_origens_permitidas) = 'array' THEN
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_origens_permitidas) AS o
            WHERE o = COALESCE(NEW.origem, 'manual')
          ) THEN
            CONTINUE;
          END IF;
        END IF;

        v_delay_seconds := COALESCE((v_agent.first_message_config->>'delay_seconds')::INT, 30);
        v_scheduled := now() + (v_delay_seconds || ' seconds')::INTERVAL;

        INSERT INTO ai_outbound_queue (
          org_id, agent_id, card_id, contato_id,
          contact_phone, contact_name, form_data,
          trigger_type, trigger_metadata, status, scheduled_for
        ) VALUES (
          NEW.org_id, v_agent.id, NEW.id, v_contato.id,
          v_phone,
          COALESCE(v_contato.nome, '') || COALESCE(' ' || v_contato.sobrenome, ''),
          v_form_data,
          'card_created',
          jsonb_build_object('card_titulo', NEW.titulo, 'card_origem', NEW.origem, 'card_produto', NEW.produto),
          'scheduled', v_scheduled
        );
        EXIT;
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'fn_enqueue_outbound_on_card_created falhou: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- Fix idle_days follow-up
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_enqueue_idle_followups()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent RECORD;
  v_trigger JSONB;
  v_idle_days INT;
  v_max_followups INT;
  v_enqueued INT := 0;
  v_skipped INT := 0;
  v_card RECORD;
BEGIN
  FOR v_agent IN
    SELECT
      a.id AS agent_id,
      a.org_id,
      a.produto,
      a.outbound_trigger_config
    FROM ai_agents a
    WHERE a.ativa = true
      AND a.interaction_mode IN ('outbound', 'hybrid')
      AND a.outbound_trigger_config IS NOT NULL
      AND a.outbound_trigger_config->'triggers' IS NOT NULL
  LOOP
    FOR v_trigger IN
      SELECT t FROM jsonb_array_elements(v_agent.outbound_trigger_config->'triggers') AS t
      WHERE t->>'type' = 'idle_days'
        AND (t->>'enabled')::BOOLEAN IS NOT FALSE
    LOOP
      v_idle_days := COALESCE((v_trigger->'conditions'->>'days')::INT, 3);
      v_max_followups := COALESCE((v_trigger->'conditions'->>'max_followups')::INT, 2);

      FOR v_card IN
        SELECT
          c.id AS card_id,
          c.titulo,
          c.org_id,
          c.produto,
          ct.id AS contato_id,
          ct.telefone,
          COALESCE(ct.nome, '') || COALESCE(' ' || ct.sobrenome, '') AS contact_name
        FROM cards c
        JOIN contatos ct ON ct.id = c.pessoa_principal_id
        WHERE c.org_id = v_agent.org_id
          AND c.produto::TEXT = v_agent.produto::TEXT
          AND c.status_comercial = 'aberto'
          AND c.updated_at < now() - (v_idle_days || ' days')::INTERVAL
          AND ct.telefone IS NOT NULL
          AND ct.telefone <> ''
          AND NOT EXISTS (
            SELECT 1 FROM ai_outbound_queue q
            WHERE q.contato_id = ct.id
              AND q.agent_id = v_agent.agent_id
              AND q.status IN ('pending', 'scheduled', 'processing', 'sent')
              AND q.created_at > now() - INTERVAL '48 hours'
          )
          AND (
            SELECT COUNT(*) FROM ai_outbound_queue q2
            WHERE q2.contato_id = ct.id
              AND q2.agent_id = v_agent.agent_id
              AND q2.trigger_type = 'idle_days'
              AND q2.status = 'sent'
          ) < v_max_followups
          AND NOT EXISTS (
            SELECT 1 FROM ai_conversations ac
            WHERE ac.contact_id = ct.id
              AND ac.status = 'active'
              AND ac.updated_at > now() - INTERVAL '24 hours'
          )
          AND NOT EXISTS (
            SELECT 1 FROM ai_conversations ac2
            JOIN ai_conversation_turns t ON t.conversation_id = ac2.id
            WHERE ac2.contact_id = ct.id
              AND t.role = 'user'
              AND t.created_at > now() - (v_idle_days || ' days')::INTERVAL
          )
      LOOP
        INSERT INTO ai_outbound_queue (
          org_id, agent_id, card_id, contato_id,
          contact_phone, contact_name,
          trigger_type, trigger_metadata,
          status, scheduled_for
        ) VALUES (
          v_card.org_id,
          v_agent.agent_id,
          v_card.card_id,
          v_card.contato_id,
          v_card.telefone,
          v_card.contact_name,
          'idle_days',
          jsonb_build_object(
            'card_titulo', v_card.titulo,
            'idle_days', v_idle_days,
            'max_followups', v_max_followups,
            'card_produto', v_card.produto
          ),
          'pending',
          now()
        );
        v_enqueued := v_enqueued + 1;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('enqueued', v_enqueued, 'skipped', v_skipped);
END;
$$;

NOTIFY pgrst, 'reload schema';
