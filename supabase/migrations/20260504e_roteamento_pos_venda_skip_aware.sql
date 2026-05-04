-- ============================================================================
-- MIGRATION: fn_roteamento_pos_venda_trips — incluir cards skip_pos_venda
-- Date: 2026-05-04
--
-- Cards com skip_pos_venda=true têm status_comercial='ganho', mas continuamos
-- querendo movê-los entre etapas de Pós-Venda conforme a data da viagem se
-- aproxima — para sabermos onde a viagem está. Pré-requisitos de "App &
-- Conteúdo" (produtos prontos, cadência completa) NÃO se aplicam a skip cards
-- porque eles pulam direto pra etapa correta sem cadência.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION fn_roteamento_pos_venda_trips()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger_id     uuid;
  v_is_active      boolean;
  v_moved          int := 0;
  v_skipped        int := 0;
  v_errors         int := 0;
  rec              record;
  v_travel_data    jsonb;
  v_start_date     date;
  v_end_date       date;
  v_target_stage   uuid;
  v_days_to_start  int;

  -- Stage IDs (TRIPS pipeline c8022522-4a1d-411c-9387-efe03ca725ee)
  STAGE_APP_CONTEUDO  constant uuid := 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36';
  STAGE_PRE_30_PLUS   constant uuid := '1f684773-f8f3-434a-a44d-4994750c41aa';
  STAGE_PRE_30_MINUS  constant uuid := '3ce80249-b579-4a9c-9b82-f8569735cea9';
  STAGE_EM_VIAGEM     constant uuid := '0ebab355-6d0e-4b19-af13-b4b31268275f';
  STAGE_POS_VIAGEM    constant uuid := '2c07134a-cb83-4075-bc86-4750beec9393';

  TMPL_APP_CONTEUDO   constant uuid := '8ab557c7-ecf4-4c45-b7a6-9d73bad3696b';

  ORG_TRIPS           constant uuid := 'b0000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id, is_active
    INTO v_trigger_id, v_is_active
    FROM cadence_event_triggers
   WHERE event_type = 'cron_roteamento'
     AND org_id = ORG_TRIPS
   LIMIT 1;

  IF v_trigger_id IS NULL OR NOT v_is_active THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'trigger inactive or not found');
  END IF;

  FOR rec IN
    SELECT
      c.id            AS card_id,
      c.titulo,
      c.pipeline_stage_id,
      c.produto_data,
      c.skip_pos_venda,
      c.status_comercial,
      ps.nome         AS stage_nome
    FROM cards c
    JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
    WHERE c.produto = 'TRIPS'
      AND (
        c.status_comercial = 'aberto'
        OR (c.status_comercial = 'ganho' AND c.skip_pos_venda = true)
      )
      AND c.pipeline_stage_id IN (
        STAGE_APP_CONTEUDO,
        STAGE_PRE_30_PLUS,
        STAGE_PRE_30_MINUS,
        STAGE_EM_VIAGEM
      )
  LOOP
    BEGIN
      v_travel_data := rec.produto_data -> 'data_exata_da_viagem';

      IF v_travel_data IS NULL
         OR v_travel_data ->> 'start' IS NULL
         OR v_travel_data ->> 'end'   IS NULL
      THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      v_start_date := (v_travel_data ->> 'start')::date;
      v_end_date   := (v_travel_data ->> 'end')::date;

      -- Pré-requisitos de "App & Conteúdo" só valem para fluxo normal (não skip)
      IF rec.pipeline_stage_id = STAGE_APP_CONTEUDO AND COALESCE(rec.skip_pos_venda, false) = false THEN

        IF NOT EXISTS (
          SELECT 1 FROM card_financial_items fi
          WHERE fi.card_id = rec.card_id
        ) THEN
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        IF EXISTS (
          SELECT 1 FROM card_financial_items fi
          WHERE fi.card_id = rec.card_id AND fi.is_ready = false
        ) THEN
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;

        IF EXISTS (
          SELECT 1 FROM cadence_instances ci
          WHERE ci.card_id = rec.card_id
            AND ci.template_id = TMPL_APP_CONTEUDO
            AND ci.status IN ('active', 'waiting_task', 'paused')
        ) THEN
          v_skipped := v_skipped + 1;
          CONTINUE;
        END IF;
      END IF;

      v_days_to_start := v_start_date - CURRENT_DATE;

      IF CURRENT_DATE > v_end_date THEN
        v_target_stage := STAGE_POS_VIAGEM;
      ELSIF CURRENT_DATE >= v_start_date AND CURRENT_DATE <= v_end_date THEN
        v_target_stage := STAGE_EM_VIAGEM;
      ELSIF v_days_to_start <= 30 THEN
        v_target_stage := STAGE_PRE_30_MINUS;
      ELSE
        v_target_stage := STAGE_PRE_30_PLUS;
      END IF;

      IF rec.pipeline_stage_id != v_target_stage THEN
        UPDATE cards
           SET pipeline_stage_id = v_target_stage,
               updated_at = now()
         WHERE id = rec.card_id;

        INSERT INTO cadence_event_log (
          card_id, event_type, event_source, event_data,
          action_taken, action_result, org_id
        ) VALUES (
          rec.card_id,
          'entry_rule_stage_changed',
          'cron_roteamento_pos_venda',
          jsonb_build_object(
            'trigger_id', v_trigger_id,
            'from_stage', rec.stage_nome,
            'to_stage', (SELECT nome FROM pipeline_stages WHERE id = v_target_stage),
            'travel_start', v_start_date::text,
            'travel_end', v_end_date::text,
            'days_to_start', v_days_to_start,
            'skip_pos_venda', COALESCE(rec.skip_pos_venda, false)
          ),
          'change_stage',
          jsonb_build_object('target_stage_id', v_target_stage),
          ORG_TRIPS
        );

        v_moved := v_moved + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'status',  'ok',
    'moved',   v_moved,
    'skipped', v_skipped,
    'errors',  v_errors,
    'run_at',  now()::text
  );
END;
$$;

COMMIT;
