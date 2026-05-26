-- Trigger SQL: enfileira automações com event_type='calendly_invitee_created'
-- quando calendly_webhook_events.processed_status vira 'success'.
--
-- Pra cada automação ativa:
--   1. Aplica filtros (organizer_email exato, event_name_pattern por ILIKE).
--   2. Resolve card:
--      - Se NEW.card_id já está populado → usa esse.
--      - Senão e config diz "create_card_if_missing=true" → cria contato (se preciso) + card
--        no pipeline/etapa da config.
--      - Senão → pula esta automação.
--   3. Insere em cadence_entry_queue (dedup por card+trigger pending).
--
-- O engine (cadence-engine) processa normalmente, executando os action steps do template.

CREATE OR REPLACE FUNCTION process_cadence_entry_on_calendly_invitee()
RETURNS TRIGGER AS $fn$
DECLARE
  v_trigger              RECORD;
  v_organizer_filter     TEXT;
  v_event_name_pattern   TEXT;
  v_resolved_card_id     UUID;
  v_resolved_org_id      UUID;
  v_resolved_contato_id  UUID;
  v_new_contato_id       UUID;
  v_new_card_id          UUID;
  v_pipeline_id          UUID;
  v_stage_id             UUID;
  v_produto              TEXT;
  v_pending_count        INT;
  v_card_title           TEXT;
BEGIN
  -- só processa invitee.created
  IF NEW.event_type <> 'invitee.created' THEN
    RETURN NEW;
  END IF;

  FOR v_trigger IN
    SELECT *
    FROM cadence_event_triggers
    WHERE event_type = 'calendly_invitee_created'
      AND is_active = TRUE
  LOOP
    v_organizer_filter   := v_trigger.event_config->>'organizer_email';
    v_event_name_pattern := v_trigger.event_config->>'event_name_pattern';

    -- Filtro: organizer_email (igualdade case-insensitive)
    IF v_organizer_filter IS NOT NULL AND v_organizer_filter <> '' THEN
      IF lower(coalesce(NEW.organizer_email, '')) <> lower(v_organizer_filter) THEN
        CONTINUE;
      END IF;
    END IF;

    -- Filtro: event_name_pattern (substring case-insensitive)
    IF v_event_name_pattern IS NOT NULL AND v_event_name_pattern <> '' THEN
      IF coalesce(NEW.event_name, '') NOT ILIKE '%' || v_event_name_pattern || '%' THEN
        CONTINUE;
      END IF;
    END IF;

    -- Resolver card pra esta automação
    v_resolved_card_id    := NULL;
    v_resolved_org_id     := NEW.org_id;
    v_resolved_contato_id := NEW.contato_id;

    IF NEW.card_id IS NOT NULL THEN
      -- Caso A: edge function já matchou card
      v_resolved_card_id := NEW.card_id;
    ELSIF coalesce((v_trigger.event_config->>'create_card_if_missing')::BOOLEAN, FALSE) THEN
      -- Caso B: config diz pra criar card novo
      v_pipeline_id := nullif(v_trigger.event_config->>'create_card_pipeline_id', '')::UUID;
      v_stage_id    := nullif(v_trigger.event_config->>'create_card_stage_id', '')::UUID;

      IF v_stage_id IS NULL THEN
        -- Config inválida — pula
        CONTINUE;
      END IF;

      -- Org da automação (não do log)
      v_resolved_org_id := v_trigger.org_id;

      -- Inferir produto a partir do pipeline (se houver)
      IF v_pipeline_id IS NOT NULL THEN
        SELECT produto::TEXT INTO v_produto FROM pipelines WHERE id = v_pipeline_id;
      END IF;

      -- Cria contato se não existe
      IF v_resolved_contato_id IS NULL THEN
        INSERT INTO contatos (org_id, nome, email, telefone, origem, origem_detalhe)
        VALUES (
          v_resolved_org_id,
          coalesce(NEW.invitee_name, NEW.invitee_email, 'Calendly Lead'),
          NEW.invitee_email,
          NEW.invitee_phone,
          coalesce(v_trigger.event_config->>'create_card_lead_source', 'calendly'),
          'Reunião agendada via Calendly: ' || coalesce(NEW.event_name, '')
        )
        RETURNING id INTO v_new_contato_id;
        v_resolved_contato_id := v_new_contato_id;
      END IF;

      -- Cria card
      v_card_title := coalesce(NEW.invitee_name, NEW.invitee_email, 'Reunião Calendly');
      INSERT INTO cards (org_id, pessoa_principal_id, pipeline_stage_id, pipeline_id, titulo, produto)
      VALUES (
        v_resolved_org_id,
        v_resolved_contato_id,
        v_stage_id,
        v_pipeline_id,
        v_card_title,
        v_produto
      )
      RETURNING id INTO v_new_card_id;
      v_resolved_card_id := v_new_card_id;
    ELSE
      -- Caso C: sem match e config não diz pra criar — pula
      CONTINUE;
    END IF;

    -- Dedup: já tem fila pendente pra este card+trigger?
    SELECT COUNT(*) INTO v_pending_count
    FROM cadence_entry_queue
    WHERE card_id = v_resolved_card_id
      AND trigger_id = v_trigger.id
      AND status = 'pending';
    IF v_pending_count > 0 THEN
      CONTINUE;
    END IF;

    -- Enfileirar
    INSERT INTO cadence_entry_queue (
      card_id, trigger_id, event_type, event_data, execute_at, org_id, status
    )
    VALUES (
      v_resolved_card_id,
      v_trigger.id,
      'calendly_invitee_created',
      jsonb_build_object(
        'calendly_event_id', NEW.id,
        'event_uuid', NEW.event_uuid,
        'invitee_email', NEW.invitee_email,
        'invitee_name', NEW.invitee_name,
        'invitee_phone', NEW.invitee_phone,
        'organizer_email', NEW.organizer_email,
        'event_start_time', NEW.event_start_time,
        'event_end_time', NEW.event_end_time,
        'event_name', NEW.event_name,
        'meeting_join_url', NEW.meeting_join_url,
        'card_was_created', (v_new_card_id IS NOT NULL),
        'contato_was_created', (v_new_contato_id IS NOT NULL)
      ),
      CASE
        WHEN coalesce(v_trigger.delay_minutes, 0) = 0 THEN NOW()
        ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL
      END,
      v_resolved_org_id,
      'pending'
    );
  END LOOP;

  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cadence_entry_on_calendly_invitee ON calendly_webhook_events;
CREATE TRIGGER trg_cadence_entry_on_calendly_invitee
  AFTER UPDATE OF processed_status ON calendly_webhook_events
  FOR EACH ROW
  WHEN (NEW.processed_status = 'success'
        AND OLD.processed_status IS DISTINCT FROM 'success')
  EXECUTE FUNCTION process_cadence_entry_on_calendly_invitee();

COMMENT ON FUNCTION process_cadence_entry_on_calendly_invitee() IS
  'Enfileira automações de calendly_invitee_created quando webhook vira success. Pode criar card+contato se config da automação permitir.';
