-- Adiciona owner_role: escolher qual papel atribuir o dono (SDR, Planner, Pós, Concierge).
-- Antes preenchia sdr+vendas ao mesmo tempo (visualmente duplicava na UI).
-- Agora preenche só o papel escolhido + dono_atual_id sempre.
--
-- owner_role: 'sdr' (default) | 'vendas' | 'pos' | 'concierge'

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
  v_produto              app_product;
  v_pending_count        INT;
  v_card_title           TEXT;
  v_owner_mode           TEXT;
  v_owner_role           TEXT;
  v_owner_user_id        UUID;
  v_full_name            TEXT;
  v_first_name           TEXT;
  v_last_name            TEXT;
  v_space_pos            INT;
  v_existing_contato_id  UUID;
BEGIN
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

    IF v_organizer_filter IS NOT NULL AND v_organizer_filter <> '' THEN
      IF lower(coalesce(NEW.organizer_email, '')) <> lower(v_organizer_filter) THEN
        CONTINUE;
      END IF;
    END IF;

    IF v_event_name_pattern IS NOT NULL AND v_event_name_pattern <> '' THEN
      IF coalesce(NEW.event_name, '') NOT ILIKE '%' || v_event_name_pattern || '%' THEN
        CONTINUE;
      END IF;
    END IF;

    v_resolved_card_id    := NULL;
    v_resolved_org_id     := NEW.org_id;
    v_resolved_contato_id := NEW.contato_id;
    v_new_contato_id      := NULL;
    v_new_card_id         := NULL;
    v_produto             := NULL;
    v_existing_contato_id := NULL;

    IF NEW.card_id IS NOT NULL THEN
      v_resolved_card_id := NEW.card_id;
    ELSIF coalesce((v_trigger.event_config->>'create_card_if_missing')::BOOLEAN, FALSE) THEN
      v_pipeline_id := nullif(v_trigger.event_config->>'create_card_pipeline_id', '')::UUID;
      v_stage_id    := nullif(v_trigger.event_config->>'create_card_stage_id', '')::UUID;

      IF v_stage_id IS NULL THEN
        CONTINUE;
      END IF;

      v_resolved_org_id := v_trigger.org_id;

      IF v_pipeline_id IS NOT NULL THEN
        SELECT produto INTO v_produto FROM pipelines WHERE id = v_pipeline_id;
      END IF;

      v_owner_mode    := coalesce(v_trigger.event_config->>'owner_mode', 'none');
      v_owner_role    := coalesce(v_trigger.event_config->>'owner_role', 'sdr');
      v_owner_user_id := NULL;

      IF v_owner_mode = 'fixed' THEN
        v_owner_user_id := nullif(v_trigger.event_config->>'owner_user_id', '')::UUID;
      ELSIF v_owner_mode = 'organizer' AND NEW.organizer_email IS NOT NULL THEN
        SELECT p.id INTO v_owner_user_id
        FROM profiles p
        JOIN org_members om ON om.user_id = p.id
        WHERE lower(p.email) = lower(NEW.organizer_email)
          AND om.org_id = v_trigger.org_id
        LIMIT 1;
      END IF;

      IF v_resolved_contato_id IS NULL THEN
        IF NEW.invitee_email IS NOT NULL THEN
          SELECT id INTO v_existing_contato_id
          FROM contatos
          WHERE org_id = v_resolved_org_id
            AND lower(email) = lower(NEW.invitee_email)
            AND deleted_at IS NULL
          LIMIT 1;
        END IF;

        IF v_existing_contato_id IS NOT NULL THEN
          v_resolved_contato_id := v_existing_contato_id;
        ELSE
          v_full_name := trim(coalesce(NEW.invitee_name, NEW.invitee_email, 'Calendly Lead'));
          v_space_pos := position(' ' IN v_full_name);
          IF v_space_pos > 0 THEN
            v_first_name := trim(substring(v_full_name FROM 1 FOR v_space_pos - 1));
            v_last_name  := trim(substring(v_full_name FROM v_space_pos + 1));
            IF v_last_name = '' THEN v_last_name := v_first_name; END IF;
          ELSE
            v_first_name := v_full_name;
            v_last_name  := v_full_name;
          END IF;

          INSERT INTO contatos (org_id, nome, sobrenome, email, telefone, origem, origem_detalhe)
          VALUES (
            v_resolved_org_id,
            v_first_name,
            v_last_name,
            NEW.invitee_email,
            NEW.invitee_phone,
            coalesce(v_trigger.event_config->>'create_card_lead_source', 'calendly'),
            'Reunião agendada via Calendly: ' || coalesce(NEW.event_name, '')
          )
          RETURNING id INTO v_new_contato_id;
          v_resolved_contato_id := v_new_contato_id;
        END IF;
      END IF;

      v_card_title := coalesce(NEW.invitee_name, NEW.invitee_email, 'Reunião Calendly');

      -- Preenche apenas o papel escolhido + dono_atual_id sempre
      INSERT INTO cards (
        org_id, pessoa_principal_id, pipeline_stage_id, pipeline_id, titulo, produto,
        dono_atual_id,
        sdr_owner_id,
        vendas_owner_id,
        pos_owner_id,
        concierge_owner_id
      )
      VALUES (
        v_resolved_org_id,
        v_resolved_contato_id,
        v_stage_id,
        v_pipeline_id,
        v_card_title,
        v_produto,
        v_owner_user_id,
        CASE WHEN v_owner_role = 'sdr'       THEN v_owner_user_id END,
        CASE WHEN v_owner_role = 'vendas'    THEN v_owner_user_id END,
        CASE WHEN v_owner_role = 'pos'       THEN v_owner_user_id END,
        CASE WHEN v_owner_role = 'concierge' THEN v_owner_user_id END
      )
      RETURNING id INTO v_new_card_id;
      v_resolved_card_id := v_new_card_id;
    ELSE
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO v_pending_count
    FROM cadence_entry_queue
    WHERE card_id = v_resolved_card_id
      AND trigger_id = v_trigger.id
      AND status = 'pending';
    IF v_pending_count > 0 THEN
      CONTINUE;
    END IF;

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
        'contato_was_created', (v_new_contato_id IS NOT NULL),
        'contato_reused', (v_existing_contato_id IS NOT NULL),
        'owner_resolved_user_id', v_owner_user_id,
        'owner_role', v_owner_role
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
