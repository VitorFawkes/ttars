-- ============================================================
-- Roteamento Pós-Venda — Diagnóstico e breakdown detalhado
--
-- 1. fn_roteamento_pos_venda_trips agora retorna breakdown
--    completo (moved, blocked por motivo, already_correct)
-- 2. Nova RPC fn_roteamento_pos_venda_trips_diagnose lista
--    casos bloqueados com motivo (sem mover)
-- ============================================================

-- 1. Function principal com breakdown
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
  v_already_ok      int := 0;
  v_blocked_prod    int := 0;
  v_blocked_cad     int := 0;
  v_blocked_dates   int := 0;
  v_errors          int := 0;
  rec               record;
  v_travel_data     jsonb;
  v_start_date      date;
  v_end_date        date;
  v_target_stage    uuid;
  v_days_to_start   int;

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
  v_dias_threshold      := COALESCE((v_cfg ->> 'dias_threshold')::int, 30);
  v_source_stage_id     := COALESCE((v_cfg ->> 'source_stage_id')::uuid, 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36');
  v_cadence_template_id := (v_cfg ->> 'cadence_template_id')::uuid;
  v_check_products      := COALESCE((v_cfg ->> 'check_products_ready')::boolean, true);
  v_check_cadence       := COALESCE((v_cfg ->> 'check_cadence_completed')::boolean, true);
  v_stage_pre_plus      := COALESCE((v_cfg -> 'stages' ->> 'pre_30_plus')::uuid,  '1f684773-f8f3-434a-a44d-4994750c41aa');
  v_stage_pre_minus     := COALESCE((v_cfg -> 'stages' ->> 'pre_30_minus')::uuid, '3ce80249-b579-4a9c-9b82-f8569735cea9');
  v_stage_em_viagem     := COALESCE((v_cfg -> 'stages' ->> 'em_viagem')::uuid,    '0ebab355-6d0e-4b19-af13-b4b31268275f');
  v_stage_pos_viagem    := COALESCE((v_cfg -> 'stages' ->> 'pos_viagem')::uuid,   '2c07134a-cb83-4075-bc86-4750beec9393');

  FOR rec IN
    SELECT c.id AS card_id, c.titulo, c.pipeline_stage_id, c.produto_data, ps.nome AS stage_nome
    FROM cards c
    JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
    WHERE c.produto = 'TRIPS'
      AND c.status_comercial = 'aberto'
      AND c.pipeline_stage_id IN (v_source_stage_id, v_stage_pre_plus, v_stage_pre_minus, v_stage_em_viagem)
  LOOP
    BEGIN
      v_travel_data := rec.produto_data -> 'data_exata_da_viagem';

      IF v_travel_data IS NULL OR v_travel_data ->> 'start' IS NULL OR v_travel_data ->> 'end' IS NULL THEN
        v_blocked_dates := v_blocked_dates + 1;
        CONTINUE;
      END IF;

      v_start_date := (v_travel_data ->> 'start')::date;
      v_end_date   := (v_travel_data ->> 'end')::date;

      IF rec.pipeline_stage_id = v_source_stage_id THEN
        IF v_check_products THEN
          IF NOT EXISTS (SELECT 1 FROM card_financial_items fi WHERE fi.card_id = rec.card_id)
             OR EXISTS (SELECT 1 FROM card_financial_items fi WHERE fi.card_id = rec.card_id AND fi.is_ready = false)
          THEN
            v_blocked_prod := v_blocked_prod + 1;
            CONTINUE;
          END IF;
        END IF;

        IF v_check_cadence AND v_cadence_template_id IS NOT NULL THEN
          IF EXISTS (
            SELECT 1 FROM cadence_instances ci
            WHERE ci.card_id = rec.card_id
              AND ci.template_id = v_cadence_template_id
              AND ci.status IN ('active', 'waiting_task', 'paused')
          ) THEN
            v_blocked_cad := v_blocked_cad + 1;
            CONTINUE;
          END IF;
        END IF;
      END IF;

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

      IF rec.pipeline_stage_id != v_target_stage THEN
        UPDATE cards SET pipeline_stage_id = v_target_stage, updated_at = now() WHERE id = rec.card_id;

        INSERT INTO cadence_event_log (
          card_id, event_type, event_source, event_data, action_taken, action_result, org_id
        ) VALUES (
          rec.card_id, 'entry_rule_stage_changed', 'cron_roteamento_pos_venda',
          jsonb_build_object(
            'trigger_id', v_trigger.id,
            'from_stage', rec.stage_nome,
            'to_stage', (SELECT nome FROM pipeline_stages WHERE id = v_target_stage),
            'travel_start', v_start_date::text,
            'travel_end', v_end_date::text,
            'days_to_start', v_days_to_start
          ),
          'change_stage', jsonb_build_object('target_stage_id', v_target_stage), ORG_TRIPS
        );

        v_moved := v_moved + 1;
      ELSE
        v_already_ok := v_already_ok + 1;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'ok',
    'moved', v_moved,
    'already_correct', v_already_ok,
    'blocked_by_products', v_blocked_prod,
    'blocked_by_cadence', v_blocked_cad,
    'blocked_by_dates', v_blocked_dates,
    'errors', v_errors,
    'run_at', now()::text
  );
END;
$$;

-- 2. Function de diagnóstico — lista casos bloqueados com motivo (sem mover)
CREATE OR REPLACE FUNCTION fn_roteamento_pos_venda_trips_diagnose()
RETURNS TABLE (
  card_id uuid,
  titulo text,
  stage_atual text,
  motivo text,
  detalhe text,
  viagem_inicio date,
  viagem_fim date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg             jsonb;
  v_source_stage    uuid;
  v_cadence_tmpl    uuid;
  v_check_products  boolean;
  v_check_cadence   boolean;
  rec               record;
  v_travel          jsonb;
  v_start           date;
  v_end             date;
  v_produtos_total  int;
  v_produtos_ready  int;

  ORG_TRIPS constant uuid := 'b0000000-0000-0000-0000-000000000001';
  STAGE_PRE_PLUS    constant uuid := '1f684773-f8f3-434a-a44d-4994750c41aa';
  STAGE_PRE_MINUS   constant uuid := '3ce80249-b579-4a9c-9b82-f8569735cea9';
  STAGE_EM_VIAGEM   constant uuid := '0ebab355-6d0e-4b19-af13-b4b31268275f';
BEGIN
  SELECT action_config INTO v_cfg
    FROM cadence_event_triggers
   WHERE event_type = 'cron_roteamento' AND org_id = ORG_TRIPS LIMIT 1;

  v_source_stage   := COALESCE((v_cfg ->> 'source_stage_id')::uuid, 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36');
  v_cadence_tmpl   := (v_cfg ->> 'cadence_template_id')::uuid;
  v_check_products := COALESCE((v_cfg ->> 'check_products_ready')::boolean, true);
  v_check_cadence  := COALESCE((v_cfg ->> 'check_cadence_completed')::boolean, true);

  FOR rec IN
    SELECT c.id, c.titulo, c.pipeline_stage_id, c.produto_data, ps.nome AS stage_nome
    FROM cards c
    JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
    WHERE c.produto = 'TRIPS'
      AND c.status_comercial = 'aberto'
      AND c.pipeline_stage_id IN (v_source_stage, STAGE_PRE_PLUS, STAGE_PRE_MINUS, STAGE_EM_VIAGEM)
  LOOP
    v_travel := rec.produto_data -> 'data_exata_da_viagem';

    -- Motivo 1: sem data
    IF v_travel IS NULL OR v_travel ->> 'start' IS NULL OR v_travel ->> 'end' IS NULL THEN
      RETURN QUERY SELECT rec.id, rec.titulo, rec.stage_nome::text,
        'sem_data'::text,
        'Data da viagem não preenchida'::text,
        NULL::date, NULL::date;
      CONTINUE;
    END IF;

    v_start := (v_travel ->> 'start')::date;
    v_end   := (v_travel ->> 'end')::date;

    -- Só avaliar pré-reqs nos cards em App & Conteúdo
    IF rec.pipeline_stage_id = v_source_stage THEN

      -- Motivo 2: produtos
      IF v_check_products THEN
        SELECT COUNT(*), COUNT(*) FILTER (WHERE fi.is_ready = true)
          INTO v_produtos_total, v_produtos_ready
          FROM card_financial_items fi WHERE fi.card_id = rec.id;

        IF v_produtos_total = 0 THEN
          RETURN QUERY SELECT rec.id, rec.titulo, rec.stage_nome::text,
            'sem_produtos'::text,
            'Nenhum produto cadastrado'::text,
            v_start, v_end;
          CONTINUE;
        END IF;

        IF v_produtos_ready < v_produtos_total THEN
          RETURN QUERY SELECT rec.id, rec.titulo, rec.stage_nome::text,
            'produtos_pendentes'::text,
            (v_produtos_ready || ' de ' || v_produtos_total || ' produtos prontos')::text,
            v_start, v_end;
          CONTINUE;
        END IF;
      END IF;

      -- Motivo 3: cadência
      IF v_check_cadence AND v_cadence_tmpl IS NOT NULL THEN
        IF EXISTS (
          SELECT 1 FROM cadence_instances ci
          WHERE ci.card_id = rec.id
            AND ci.template_id = v_cadence_tmpl
            AND ci.status IN ('active', 'waiting_task', 'paused')
        ) THEN
          RETURN QUERY SELECT rec.id, rec.titulo, rec.stage_nome::text,
            'cadencia_aberta'::text,
            'Cadência com tarefas em aberto'::text,
            v_start, v_end;
          CONTINUE;
        END IF;
      END IF;
    END IF;
    -- Se chegou aqui, ou foi movido ou já está correto — não retornar
  END LOOP;
END;
$$;
