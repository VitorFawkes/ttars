-- ============================================================
-- Roteamento Pós-Venda configurável
--
-- Atualiza a function para ler TODAS as configurações do
-- action_config do trigger (dias de corte, etapas, cadência,
-- pré-requisitos). Permite edição via UI.
-- ============================================================

-- 1. Atualizar action_config com campos editáveis
UPDATE cadence_event_triggers
SET action_config = jsonb_build_object(
  'description', 'Move cards automaticamente entre etapas de Pós-Venda baseado nas datas de viagem.',
  'dias_threshold', 30,
  'source_stage_id', 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36',
  'cadence_template_id', '8ab557c7-ecf4-4c45-b7a6-9d73bad3696b',
  'check_products_ready', true,
  'check_cadence_completed', true,
  'check_travel_dates', true,
  'stages', jsonb_build_object(
    'pre_30_plus', '1f684773-f8f3-434a-a44d-4994750c41aa',
    'pre_30_minus', '3ce80249-b579-4a9c-9b82-f8569735cea9',
    'em_viagem', '0ebab355-6d0e-4b19-af13-b4b31268275f',
    'pos_viagem', '2c07134a-cb83-4075-bc86-4750beec9393'
  )
),
updated_at = now()
WHERE event_type = 'cron_roteamento'
  AND org_id = 'b0000000-0000-0000-0000-000000000001';

-- 2. Recriar function lendo do action_config
CREATE OR REPLACE FUNCTION fn_roteamento_pos_venda_trips()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trigger         record;
  v_cfg             jsonb;
  v_moved           int := 0;
  v_skipped         int := 0;
  v_errors          int := 0;
  rec               record;
  v_travel_data     jsonb;
  v_start_date      date;
  v_end_date        date;
  v_target_stage    uuid;
  v_days_to_start   int;

  -- Config lidas do trigger
  v_dias_threshold       int;
  v_source_stage_id      uuid;
  v_cadence_template_id  uuid;
  v_check_products       boolean;
  v_check_cadence        boolean;
  v_stage_pre_plus       uuid;
  v_stage_pre_minus      uuid;
  v_stage_em_viagem      uuid;
  v_stage_pos_viagem     uuid;

  ORG_TRIPS constant uuid := 'b0000000-0000-0000-0000-000000000001';
BEGIN
  -- ── Buscar trigger e config ──
  SELECT id, is_active, action_config
    INTO v_trigger
    FROM cadence_event_triggers
   WHERE event_type = 'cron_roteamento'
     AND org_id = ORG_TRIPS
   LIMIT 1;

  IF v_trigger IS NULL OR NOT v_trigger.is_active THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'trigger inactive or not found');
  END IF;

  v_cfg := v_trigger.action_config;

  -- ── Ler configurações ──
  v_dias_threshold      := COALESCE((v_cfg ->> 'dias_threshold')::int, 30);
  v_source_stage_id     := COALESCE((v_cfg ->> 'source_stage_id')::uuid, 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36');
  v_cadence_template_id := (v_cfg ->> 'cadence_template_id')::uuid;
  v_check_products      := COALESCE((v_cfg ->> 'check_products_ready')::boolean, true);
  v_check_cadence       := COALESCE((v_cfg ->> 'check_cadence_completed')::boolean, true);
  v_stage_pre_plus      := COALESCE((v_cfg -> 'stages' ->> 'pre_30_plus')::uuid,  '1f684773-f8f3-434a-a44d-4994750c41aa');
  v_stage_pre_minus     := COALESCE((v_cfg -> 'stages' ->> 'pre_30_minus')::uuid, '3ce80249-b579-4a9c-9b82-f8569735cea9');
  v_stage_em_viagem     := COALESCE((v_cfg -> 'stages' ->> 'em_viagem')::uuid,    '0ebab355-6d0e-4b19-af13-b4b31268275f');
  v_stage_pos_viagem    := COALESCE((v_cfg -> 'stages' ->> 'pos_viagem')::uuid,   '2c07134a-cb83-4075-bc86-4750beec9393');

  -- ── Itera cards elegíveis ──
  FOR rec IN
    SELECT
      c.id            AS card_id,
      c.titulo,
      c.pipeline_stage_id,
      c.produto_data,
      ps.nome         AS stage_nome
    FROM cards c
    JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
    WHERE c.produto = 'TRIPS'
      AND c.status_comercial = 'aberto'
      AND c.pipeline_stage_id IN (
        v_source_stage_id,
        v_stage_pre_plus,
        v_stage_pre_minus,
        v_stage_em_viagem
      )
  LOOP
    BEGIN
      -- ── Extrair datas de viagem ──
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

      -- ── Pré-requisitos para sair da etapa de origem ──
      IF rec.pipeline_stage_id = v_source_stage_id THEN

        -- Verificar produtos concluídos
        IF v_check_products THEN
          IF NOT EXISTS (
            SELECT 1 FROM card_financial_items fi WHERE fi.card_id = rec.card_id
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
        END IF;

        -- Verificar cadência finalizada
        IF v_check_cadence AND v_cadence_template_id IS NOT NULL THEN
          IF EXISTS (
            SELECT 1 FROM cadence_instances ci
            WHERE ci.card_id = rec.card_id
              AND ci.template_id = v_cadence_template_id
              AND ci.status IN ('active', 'waiting_task', 'paused')
          ) THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
          END IF;
        END IF;
      END IF;

      -- ── Determinar etapa correta baseado nas datas ──
      v_days_to_start := v_start_date - CURRENT_DATE;

      IF CURRENT_DATE > v_end_date THEN
        v_target_stage := v_stage_pos_viagem;
      ELSIF CURRENT_DATE >= v_start_date AND CURRENT_DATE <= v_end_date THEN
        v_target_stage := v_stage_em_viagem;
      ELSIF v_days_to_start <= v_dias_threshold THEN
        v_target_stage := v_stage_pre_minus;
      ELSE
        v_target_stage := v_stage_pre_plus;
      END IF;

      -- ── Mover se necessário ──
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
            'trigger_id', v_trigger.id,
            'from_stage', rec.stage_nome,
            'to_stage', (SELECT nome FROM pipeline_stages WHERE id = v_target_stage),
            'travel_start', v_start_date::text,
            'travel_end', v_end_date::text,
            'days_to_start', v_days_to_start
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
