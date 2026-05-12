-- ═══════════════════════════════════════════════════════════════════════════
-- 20260512_card_to_reuniao_agendada_on_meeting.sql
--
-- Move card automaticamente para a etapa "Reunião Agendada" quando uma reunião
-- é criada (INSERT em tarefas com tipo reuniao* e status='agendada'), DESDE QUE
-- o card esteja em uma etapa anterior à "Reunião Agendada" no mesmo pipeline.
--
-- Regra: comparação lexicográfica (phase.order_index, stage.ordem). Move só se
-- a etapa atual é estritamente "antes" da etapa-alvo. Se está na própria etapa,
-- já passou (Closer/Planner/Pós-venda), ou pipeline não tem essa etapa → no-op.
--
-- Cancelar/reagendar/não compareceu NÃO movem o card. Só a criação agendada.
--
-- A trigger existente `log_card_update_activity` cuida do log `stage_changed`.
-- O guard `app.update_source = 'integration'` evita loop com inbound AC sync.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.move_card_on_meeting_scheduled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_stage_id UUID;
  v_now_stage_id UUID;
  v_now_phase_ord INT;
  v_now_stage_ord INT;
  v_target_phase_ord INT;
  v_target_stage_ord INT;
BEGIN
  -- Guard 0: loop prevention (inbound integration não dispara mudança de etapa)
  IF current_setting('app.update_source', TRUE) = 'integration' THEN
    RETURN NEW;
  END IF;

  -- Guard 1: só age em reuniões agendadas com card vinculado
  IF NEW.card_id IS NULL
     OR NEW.tipo NOT IN ('reuniao','reuniao_video','reuniao_presencial','reuniao_telefone')
     OR NEW.status IS DISTINCT FROM 'agendada' THEN
    RETURN NEW;
  END IF;

  -- Buscar etapa atual do card + etapa "Reunião Agendada" do MESMO pipeline,
  -- com a ordem das phases para comparação lexicográfica.
  SELECT
    c.pipeline_stage_id,
    ph_now.order_index,
    s_now.ordem,
    s_target.id,
    ph_target.order_index,
    s_target.ordem
  INTO
    v_now_stage_id,
    v_now_phase_ord,
    v_now_stage_ord,
    v_target_stage_id,
    v_target_phase_ord,
    v_target_stage_ord
  FROM cards c
  JOIN pipeline_stages s_now ON s_now.id = c.pipeline_stage_id
  JOIN pipeline_phases ph_now ON ph_now.id = s_now.phase_id
  LEFT JOIN pipeline_stages s_target
       ON s_target.pipeline_id = s_now.pipeline_id
      AND lower(s_target.nome) = 'reunião agendada'
  LEFT JOIN pipeline_phases ph_target ON ph_target.id = s_target.phase_id
  WHERE c.id = NEW.card_id;

  -- Guard 2: card não encontrado, sem etapa atual, ou pipeline sem "Reunião Agendada"
  IF v_now_stage_id IS NULL OR v_target_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Guard 3: já está na etapa-alvo
  IF v_now_stage_id = v_target_stage_id THEN
    RETURN NEW;
  END IF;

  -- Guard 4: etapa atual deve ser ESTRITAMENTE anterior à etapa-alvo
  -- (phase_ord, stage_ord) < (target_phase_ord, target_stage_ord)
  IF NOT (
    v_now_phase_ord < v_target_phase_ord
    OR (v_now_phase_ord = v_target_phase_ord AND v_now_stage_ord < v_target_stage_ord)
  ) THEN
    RETURN NEW;
  END IF;

  -- Move card. O trigger log_card_update_activity cuida do log de stage_changed.
  UPDATE cards
     SET pipeline_stage_id = v_target_stage_id,
         updated_at = NOW()
   WHERE id = NEW.card_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.move_card_on_meeting_scheduled() IS
'Quando uma reunião é agendada (INSERT em tarefas tipo reuniao* status agendada),
move o card para a etapa "Reunião Agendada" do seu pipeline — só se card está
em etapa estritamente anterior (comparação por phase.order_index, stage.ordem).
Idempotente, no-op em pipelines sem a etapa, no-op em cancelar/reagendar/não-comp.
Guard de loop via app.update_source=integration.';

DROP TRIGGER IF EXISTS trg_move_card_on_meeting_scheduled ON tarefas;

CREATE TRIGGER trg_move_card_on_meeting_scheduled
  AFTER INSERT ON tarefas
  FOR EACH ROW
  EXECUTE FUNCTION public.move_card_on_meeting_scheduled();
