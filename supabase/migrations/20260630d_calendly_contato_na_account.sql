-- MIGRATION: Calendly cria/busca o CONTATO na ACCOUNT (não no workspace)
--
-- PROBLEMA (raiz de duplicata de card em Weddings):
--   process_cadence_entry_on_calendly_invitee usava um único org (v_resolved_org_id =
--   org do trigger = workspace) para TUDO: card, busca de contato e criação de contato.
--   Pro card está certo (card mora no workspace). Pro CONTATO está errado: quando a
--   conta compartilha contatos (Welcome Group, shares_contacts_with_children=TRUE), o
--   contato deve viver na ACCOUNT. Como o Calendly cravava o contato no workspace e
--   buscava existente só no workspace, ele nunca encontrava o contato que o sync do
--   Active / Leadster / site criam na account → criava um 2º contato → o card do
--   Calendly e o card do Active apontavam pra contatos diferentes → o dedup de card
--   (que casa por pessoa_principal_id) não via que era a mesma pessoa → DOIS cards.
--   Caso real: "Priscila" (AC contact 82993) virou 2 contatos (workspace + account) e
--   2 cards com 1 dia de diferença. ~4 casos calendly_sdr afetados.
--
-- FIX (cirúrgico): resolve um v_contato_org_id que sobe pra account quando a conta
--   compartilha contatos; usa esse org TANTO na busca de contato existente (agora
--   procura no workspace E na account, preferindo a account) QUANTO no INSERT do
--   contato. O card continua em v_resolved_org_id (workspace). Alinha o Calendly aos
--   demais caminhos de ingestão (integration-process, wedding-lead.ts).
--
-- Baseado na definição VIVA da função em produção (pg_get_functiondef) — diff confirma
-- que só mudam os 4 pontos do contato; todos os deltas #1..#7 preservados.

CREATE OR REPLACE FUNCTION public.process_cadence_entry_on_calendly_invitee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_trigger              RECORD;
  v_organizer_filter     TEXT;
  v_event_name_pattern   TEXT;
  v_resolved_card_id     UUID;
  v_resolved_org_id      UUID;
  v_contato_org_id       UUID;
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
  v_extra_data           JSONB;
  v_date_key             TEXT;
  v_link_key             TEXT;
  v_event_card_id        UUID;
BEGIN
  IF NEW.event_type <> 'invitee.created' THEN RETURN NEW; END IF;

  v_event_card_id := NULL;

  FOR v_trigger IN
    SELECT * FROM cadence_event_triggers
    WHERE event_type = 'calendly_invitee_created' AND is_active = TRUE
      AND (NEW.source_org_id IS NULL OR org_id = NEW.source_org_id)   -- delta #1: fence por org
    -- delta #7: gatilho de ingestão (tem meeting_date_target / cria card) primeiro,
    -- pra ele resolver/criar o card e gravar a data antes das automações reusarem.
    ORDER BY (event_config ? 'meeting_date_target') DESC,
             (coalesce((event_config->>'create_card_if_missing')::BOOLEAN, FALSE)) DESC,
             priority ASC
  LOOP
    v_organizer_filter   := v_trigger.event_config->>'organizer_email';
    v_event_name_pattern := v_trigger.event_config->>'event_name_pattern';

    IF v_organizer_filter IS NOT NULL AND v_organizer_filter <> '' THEN
      IF lower(coalesce(NEW.organizer_email, '')) <> lower(v_organizer_filter) THEN CONTINUE; END IF;
    END IF;
    IF v_event_name_pattern IS NOT NULL AND v_event_name_pattern <> '' THEN
      IF coalesce(NEW.event_name, '') NOT ILIKE '%' || v_event_name_pattern || '%' THEN CONTINUE; END IF;
    END IF;

    v_resolved_card_id    := NULL;
    v_resolved_org_id     := NEW.org_id;
    v_resolved_contato_id := NEW.contato_id;
    v_new_contato_id      := NULL;
    v_new_card_id         := NULL;
    v_produto             := NULL;
    v_existing_contato_id := NULL;
    v_owner_user_id       := NULL;

    -- delta #2: chaves de data/link por papel (default = legado Trips)
    v_date_key := coalesce(nullif(v_trigger.event_config->>'meeting_date_target', ''), 'data_reuniao');
    v_link_key := coalesce(nullif(v_trigger.event_config->>'meeting_link_target', ''), 'calendly_meeting_link');
    v_extra_data := jsonb_build_object(
      v_date_key, calendly_local_dt(NEW.event_start_time),
      v_link_key, NEW.meeting_join_url,
      'calendly_event_name', NEW.event_name
    );

    -- owner resolvido p/ TODO trigger (usado no card e na tarefa de reunião)
    v_owner_mode := coalesce(v_trigger.event_config->>'owner_mode', 'none');
    v_owner_role := coalesce(v_trigger.event_config->>'owner_role', 'sdr');
    IF v_owner_mode = 'fixed' THEN
      v_owner_user_id := nullif(v_trigger.event_config->>'owner_user_id', '')::UUID;
    ELSIF v_owner_mode = 'organizer' AND NEW.organizer_email IS NOT NULL THEN
      SELECT p.id INTO v_owner_user_id
      FROM profiles p JOIN org_members om ON om.user_id = p.id
      WHERE lower(p.email) = lower(NEW.organizer_email) AND om.org_id = v_trigger.org_id
      LIMIT 1;
    END IF;

    -- delta #3: só atualiza card casado se for da MESMA org do trigger; senão cria.
    -- delta #7: vários gatilhos podem casar a MESMA reserva (ingestão data-only +
    -- automação do usuário). O 1º resolve/cria o card e grava a data; os seguintes
    -- REUSAM o card (sem regravar a data) só pra rodar a própria ação.
    IF NEW.card_id IS NOT NULL AND NEW.org_id IS NOT DISTINCT FROM v_trigger.org_id THEN
      v_resolved_card_id := NEW.card_id;
      IF v_event_card_id IS NULL THEN
        UPDATE cards
        SET produto_data     = coalesce(produto_data, '{}'::jsonb) || v_extra_data,
            briefing_inicial = coalesce(briefing_inicial, '{}'::jsonb) || v_extra_data,
            updated_at = NOW()
        WHERE id = v_resolved_card_id;
      END IF;
    ELSIF v_event_card_id IS NOT NULL THEN
      v_resolved_card_id := v_event_card_id;   -- card já criado/casado por gatilho anterior nesta reserva
    ELSIF coalesce((v_trigger.event_config->>'create_card_if_missing')::BOOLEAN, FALSE) THEN
      v_pipeline_id := nullif(v_trigger.event_config->>'create_card_pipeline_id', '')::UUID;
      v_stage_id    := nullif(v_trigger.event_config->>'create_card_stage_id', '')::UUID;
      IF v_stage_id IS NULL THEN CONTINUE; END IF;
      v_resolved_org_id := v_trigger.org_id;
      SELECT parent.id INTO v_contato_org_id
      FROM organizations w
      JOIN organizations parent ON parent.id = w.parent_org_id
      WHERE w.id = v_resolved_org_id
        AND parent.shares_contacts_with_children = TRUE;
      v_contato_org_id := COALESCE(v_contato_org_id, v_resolved_org_id);
      IF v_pipeline_id IS NOT NULL THEN
        SELECT produto INTO v_produto FROM pipelines WHERE id = v_pipeline_id;
      END IF;

      IF v_resolved_contato_id IS NULL THEN
        IF NEW.invitee_email IS NOT NULL THEN
          SELECT id INTO v_existing_contato_id
          FROM contatos
          WHERE org_id IN (v_resolved_org_id, v_contato_org_id) AND lower(email) = lower(NEW.invitee_email) AND deleted_at IS NULL
          ORDER BY (org_id = v_contato_org_id) DESC
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
          VALUES (v_contato_org_id, v_first_name, v_last_name, NEW.invitee_email, NEW.invitee_phone,
                  coalesce(v_trigger.event_config->>'create_card_lead_source', 'calendly'),
                  'Reunião agendada via Calendly: ' || coalesce(NEW.event_name, ''))
          RETURNING id INTO v_new_contato_id;
          v_resolved_contato_id := v_new_contato_id;
        END IF;
      END IF;

      v_card_title := coalesce(NEW.invitee_name, NEW.invitee_email, 'Reunião Calendly');
      INSERT INTO cards (
        org_id, pessoa_principal_id, pipeline_stage_id, pipeline_id, titulo, produto,
        produto_data, briefing_inicial,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id
      ) VALUES (
        v_resolved_org_id, v_resolved_contato_id, v_stage_id, v_pipeline_id, v_card_title, v_produto,
        v_extra_data, v_extra_data,
        v_owner_user_id,
        CASE WHEN v_owner_role = 'sdr'       THEN v_owner_user_id END,
        CASE WHEN v_owner_role = 'vendas'    THEN v_owner_user_id END,
        CASE WHEN v_owner_role = 'pos'       THEN v_owner_user_id END,
        CASE WHEN v_owner_role = 'concierge' THEN v_owner_user_id END
      ) RETURNING id INTO v_new_card_id;
      v_resolved_card_id := v_new_card_id;
    ELSE
      CONTINUE;
    END IF;

    -- memo do card desta reserva pro 1º gatilho criar/casar e os próximos reusarem
    IF v_event_card_id IS NULL THEN v_event_card_id := v_resolved_card_id; END IF;

    -- NB: a INGESTÃO só cria/casa o card e grava data/link por papel. A TAREFA de
    -- reunião (e qualquer mensagem) é responsabilidade de AUTOMAÇÃO configurada pelo
    -- usuário no construtor (ação "criar tarefa" com "usar data da reunião como
    -- vencimento"), igual ao modelo do Trips. Por isso NÃO criamos tarefa aqui.

    -- delta #6: triggers "data-only" (ex.: Calendly Weddings) já fizeram tudo que
    -- precisavam em SQL (card + data por-papel + tarefa de reunião). Não têm ação
    -- de cadência/mensagem → não enfileiram nada pro cadence-engine. Sem isso,
    -- precisariam de target_template_id (CHECK start_cadence_has_target) ou
    -- causariam erro no engine por action sem config.
    IF coalesce((v_trigger.event_config->>'skip_cadence_queue')::BOOLEAN, FALSE) THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO v_pending_count FROM cadence_entry_queue
    WHERE card_id = v_resolved_card_id AND trigger_id = v_trigger.id AND status = 'pending';
    IF v_pending_count > 0 THEN CONTINUE; END IF;

    INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at, org_id, status)
    VALUES (v_resolved_card_id, v_trigger.id, 'calendly_invitee_created',
      jsonb_build_object(
        'calendly_event_id', NEW.id, 'event_uuid', NEW.event_uuid,
        'invitee_email', NEW.invitee_email, 'invitee_name', NEW.invitee_name,
        'invitee_phone', NEW.invitee_phone, 'organizer_email', NEW.organizer_email,
        'event_start_time', NEW.event_start_time, 'event_end_time', NEW.event_end_time,
        'event_name', NEW.event_name, 'meeting_join_url', NEW.meeting_join_url,
        'card_was_created', (v_new_card_id IS NOT NULL),
        'contato_was_created', (v_new_contato_id IS NOT NULL),
        'contato_reused', (v_existing_contato_id IS NOT NULL),
        'owner_resolved_user_id', v_owner_user_id, 'owner_role', v_owner_role
      ),
      CASE WHEN coalesce(v_trigger.delay_minutes, 0) = 0 THEN NOW()
           ELSE NOW() + (v_trigger.delay_minutes || ' minutes')::INTERVAL END,
      v_resolved_org_id, 'pending');
  END LOOP;

  RETURN NEW;
END;
$function$
;
