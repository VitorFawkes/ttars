-- ============================================================================
-- Remove guard de integration do move_card_on_meeting_scheduled
-- ============================================================================
-- A migration original 20260512_card_to_reuniao_agendada_on_meeting tinha:
--
--   IF current_setting('app.update_source', TRUE) = 'integration' THEN
--       RETURN NEW;
--   END IF;
--
-- A intencao era evitar loops com outbound sync, mas em prod nao ha
-- trigger outbound de stage_change ativo — o guard so bloqueava o
-- comportamento desejado: reunioes vindas do AC (que setam
-- app.update_source='integration' no integration-process) nao moviam o
-- card pra "Reuniao Agendada".
--
-- Esta migration recria a funcao sem o guard. Quando user marca reuniao
-- no AC e nosso integration-process cria a tarefa com tipo=reuniao* e
-- status=agendada, o card move pra etapa correta.
-- ============================================================================

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
  IF NEW.card_id IS NULL
     OR NEW.tipo NOT IN ('reuniao','reuniao_video','reuniao_presencial','reuniao_telefone')
     OR NEW.status IS DISTINCT FROM 'agendada' THEN
    RETURN NEW;
  END IF;

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

  IF v_now_stage_id IS NULL OR v_target_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_now_stage_id = v_target_stage_id THEN
    RETURN NEW;
  END IF;

  IF NOT (
    v_now_phase_ord < v_target_phase_ord
    OR (v_now_phase_ord = v_target_phase_ord AND v_now_stage_ord < v_target_stage_ord)
  ) THEN
    RETURN NEW;
  END IF;

  UPDATE cards
     SET pipeline_stage_id = v_target_stage_id,
         updated_at = NOW()
   WHERE id = NEW.card_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.move_card_on_meeting_scheduled() IS
'Quando uma reuniao e agendada (INSERT em tarefas tipo reuniao* status agendada), move o card para a etapa "Reuniao Agendada" do seu pipeline — so se card esta em etapa estritamente anterior. Idempotente. Funciona pra reuniao criada pela UI ou via AC inbound sync.';
