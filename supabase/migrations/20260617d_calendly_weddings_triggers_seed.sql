-- ═══════════════════════════════════════════════════════════════════════════
-- Calendly Weddings: semear os 2 triggers (SDR + Closer)
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ ANTES DE PROMOVER: substituir os placeholders dos e-mails de organizer pelos
--    e-mails Calendly reais (= event_memberships[0].user_email no payload):
--      contato@welcomeweddings.com.br     → e-mail do link do SDR
--      weddingplanner@welcomeweddings.com.br  → e-mail do link do Closer
--    Se os DOIS links forem do MESMO usuário Calendly (mesmo organizer), trocar o
--    discriminador 'organizer_email' por 'event_name_pattern' (substring do nome
--    do evento) em cada event_config.
--
-- Org Weddings: b0000000-0000-0000-0000-000000000002 · pipeline WEDDING f4611f84-…
-- São triggers DATA-ONLY: criam/casam card + gravam data/link por papel, tudo em
-- SQL (process_cadence_entry_on_calendly_invitee). NÃO criam tarefa nem disparam
-- cadência/mensagem → event_config.skip_cadence_queue=true (pula o cadence-engine).
-- A tarefa de reunião é criada por AUTOMAÇÃO que o usuário monta no construtor.
-- action_type='notify_internal' é só um valor que passa no CHECK de action_type
-- (não há ação de fato, porque skip_cadence_queue impede o enfileiramento).
-- target_template_id=NULL e action_config='{}' (Weddings não tem cadence_templates;
-- guard cadence_event_triggers_enforce_same_org exige isso).
-- Resolve as etapas por slug+pipeline (regra CLAUDE.md Backend #6), não hardcode cego.
-- Idempotente: não duplica se já existir trigger com o mesmo name.
-- ═══════════════════════════════════════════════════════════════════════════

DO $seed$
DECLARE
  v_org        UUID := 'b0000000-0000-0000-0000-000000000002';
  v_pipeline   UUID := 'f4611f84-ce9c-48ad-814b-dcd6081f15db';
  v_sdr_stage  UUID;
  v_closer_stage UUID;
BEGIN
  SELECT s.id INTO v_sdr_stage
  FROM pipeline_stages s JOIN pipeline_phases ph ON ph.id = s.phase_id
  WHERE s.pipeline_id = v_pipeline AND ph.slug = 'sdr' AND s.nome = 'Novo Lead'
  LIMIT 1;

  SELECT s.id INTO v_closer_stage
  FROM pipeline_stages s JOIN pipeline_phases ph ON ph.id = s.phase_id
  WHERE s.pipeline_id = v_pipeline AND ph.slug = 'closer' AND s.nome = '1ª Reunião'
  LIMIT 1;

  IF v_sdr_stage IS NULL OR v_closer_stage IS NULL THEN
    RAISE EXCEPTION 'Etapas de entrada não resolvidas (sdr=%, closer=%)', v_sdr_stage, v_closer_stage;
  END IF;

  -- ── Trigger SDR ──────────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM cadence_event_triggers
                 WHERE org_id = v_org AND name = 'Calendly Weddings — SDR') THEN
    INSERT INTO cadence_event_triggers
      (org_id, name, event_type, is_active, action_type, action_config,
       target_template_id, delay_minutes, event_config)
    VALUES (v_org, 'Calendly Weddings — SDR', 'calendly_invitee_created', TRUE,
            'notify_internal', '{}'::jsonb, NULL, 0,
            jsonb_build_object(
              'organizer_email',         'contato@welcomeweddings.com.br',
              'meeting_date_target',     'ww_sdr_data_reuniao',
              'meeting_link_target',     'ww_sdr_link_reuniao',
              'create_card_if_missing',  true,
              'create_card_pipeline_id', v_pipeline::text,
              'create_card_stage_id',    v_sdr_stage::text,
              'create_card_lead_source', 'calendly_sdr',
              'owner_mode',              'organizer',
              'owner_role',              'sdr',
              'skip_cadence_queue',      true
            ));
  END IF;

  -- ── Trigger Closer ───────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM cadence_event_triggers
                 WHERE org_id = v_org AND name = 'Calendly Weddings — Closer') THEN
    INSERT INTO cadence_event_triggers
      (org_id, name, event_type, is_active, action_type, action_config,
       target_template_id, delay_minutes, event_config)
    VALUES (v_org, 'Calendly Weddings — Closer', 'calendly_invitee_created', TRUE,
            'notify_internal', '{}'::jsonb, NULL, 0,
            jsonb_build_object(
              'organizer_email',         'weddingplanner@welcomeweddings.com.br',
              'meeting_date_target',     'ww_closer_data_reuniao',
              'meeting_link_target',     'ww_closer_link_reuniao',
              'create_card_if_missing',  true,
              'create_card_pipeline_id', v_pipeline::text,
              'create_card_stage_id',    v_closer_stage::text,
              'create_card_lead_source', 'calendly_closer',
              'owner_mode',              'organizer',
              'owner_role',              'vendas',
              'skip_cadence_queue',      true
            ));
  END IF;

  -- Remove a criação automática de tarefa: a tarefa de reunião deve vir de uma
  -- AUTOMAÇÃO que o usuário monta no construtor (igual ao Trips), não da ingestão.
  -- Idempotente — limpa rows já semeadas com as flags antigas.
  UPDATE cadence_event_triggers
  SET event_config = event_config - 'create_meeting_task' - 'meeting_task_title'
  WHERE org_id = v_org
    AND event_type = 'calendly_invitee_created'
    AND (event_config ? 'create_meeting_task' OR event_config ? 'meeting_task_title');
END
$seed$;

-- Sanidade: nenhum vazamento cross-org introduzido.
DO $check$
BEGIN
  IF cadence_triggers_cross_org_count() <> 0 THEN
    RAISE EXCEPTION 'cadence_triggers_cross_org_count() = % (esperado 0)', cadence_triggers_cross_org_count();
  END IF;
END
$check$;
