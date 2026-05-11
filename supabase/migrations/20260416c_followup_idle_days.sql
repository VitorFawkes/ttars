-- ============================================================================
-- MARCO 2: Follow-up Inteligente — Gatilho idle_days
-- ============================================================================
-- Cria: fn_enqueue_idle_followups() — roda 1x/dia via pg_cron
-- Busca cards inativos com agente outbound/hybrid que tenha trigger idle_days
-- Insere na ai_outbound_queue com trigger_type='idle_days'
-- Anti-spam: respeita max_followups, verifica conversa ativa, cooldown 48h
-- ============================================================================

-- ============================================================================
-- 1. FUNCAO: Enfileira follow-ups para cards inativos
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
  -- Iterar agentes outbound/hybrid ativos com trigger idle_days
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
    -- Buscar trigger idle_days habilitado
    FOR v_trigger IN
      SELECT t FROM jsonb_array_elements(v_agent.outbound_trigger_config->'triggers') AS t
      WHERE t->>'type' = 'idle_days'
        AND (t->>'enabled')::BOOLEAN IS NOT FALSE
    LOOP
      v_idle_days := COALESCE((v_trigger->'conditions'->>'days')::INT, 3);
      v_max_followups := COALESCE((v_trigger->'conditions'->>'max_followups')::INT, 2);

      -- Buscar cards inativos com contato que tem telefone
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
        JOIN contatos ct ON ct.id = c.contato_principal_id
        WHERE c.org_id = v_agent.org_id
          AND c.produto::TEXT = v_agent.produto::TEXT
          AND c.status IN ('aberto', 'novo')
          AND c.updated_at < now() - (v_idle_days || ' days')::INTERVAL
          AND ct.telefone IS NOT NULL
          AND ct.telefone <> ''
          -- Anti-spam: nao tem item pendente/enviado nas ultimas 48h
          AND NOT EXISTS (
            SELECT 1 FROM ai_outbound_queue q
            WHERE q.contato_id = ct.id
              AND q.agent_id = v_agent.agent_id
              AND q.status IN ('pending', 'scheduled', 'processing', 'sent')
              AND q.created_at > now() - INTERVAL '48 hours'
          )
          -- Anti-spam: nao excedeu max_followups
          AND (
            SELECT COUNT(*) FROM ai_outbound_queue q2
            WHERE q2.contato_id = ct.id
              AND q2.agent_id = v_agent.agent_id
              AND q2.trigger_type = 'idle_days'
              AND q2.status = 'sent'
          ) < v_max_followups
          -- Anti-spam: nao tem conversa ativa nas ultimas 24h
          AND NOT EXISTS (
            SELECT 1 FROM ai_conversations ac
            WHERE ac.contact_id = ct.id
              AND ac.status = 'active'
              AND ac.updated_at > now() - INTERVAL '24 hours'
          )
          -- Anti-spam: lead nao respondeu recentemente (ultima conversa)
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

-- ============================================================================
-- 2. PG_CRON: Rodar 1x/dia as 8h (11h UTC)
-- ============================================================================
SELECT cron.schedule(
  'ai-followup-idle-enqueue',
  '0 11 * * *',
  $$SELECT fn_enqueue_idle_followups();$$
);
