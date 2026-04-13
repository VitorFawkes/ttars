-- ============================================================
-- Roteamento automático Pós-Venda (TRIPS)
--
-- Lógica:
-- 1. Cards em "App & Conteúdo em Montagem" que tenham:
--    - Todos os produtos (card_financial_items) marcados como concluídos (is_ready)
--    - Nenhuma instância de cadência "App & Conteúdo" ainda ativa
-- 2. Avalia data_exata_da_viagem e move para:
--    - Pré-embarque >>> 30 dias   (início > 30 dias)
--    - Pré-Embarque <<< 30 dias   (início ≤ 30 dias, não começou)
--    - Em Viagem                   (entre início e fim)
--    - Pós-viagem & Reativação    (fim já passou)
-- 3. Cards já em pré-embarque/em viagem são reavaliados diariamente
--    para avançar conforme a data se aproxima.
-- ============================================================

-- 1. SQL Function
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

  -- Template "Pós-venda: App & Conteúdo" para Welcome Trips
  TMPL_APP_CONTEUDO   constant uuid := '8ab557c7-ecf4-4c45-b7a6-9d73bad3696b';

  ORG_TRIPS           constant uuid := 'b0000000-0000-0000-0000-000000000001';
BEGIN
  -- ── Verifica se a automação está ativa ──
  SELECT id, is_active
    INTO v_trigger_id, v_is_active
    FROM cadence_event_triggers
   WHERE event_type = 'cron_roteamento'
     AND org_id = ORG_TRIPS
   LIMIT 1;

  IF v_trigger_id IS NULL OR NOT v_is_active THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'trigger inactive or not found');
  END IF;

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
        STAGE_APP_CONTEUDO,
        STAGE_PRE_30_PLUS,
        STAGE_PRE_30_MINUS,
        STAGE_EM_VIAGEM
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

      -- ── Pré-requisitos para sair de "App & Conteúdo" ──
      IF rec.pipeline_stage_id = STAGE_APP_CONTEUDO THEN

        -- Deve ter ao menos 1 produto E todos prontos
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

        -- Cadência "App & Conteúdo" não pode estar ativa
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

      -- ── Determinar etapa correta baseado nas datas ──
      v_days_to_start := v_start_date - CURRENT_DATE;

      IF CURRENT_DATE > v_end_date THEN
        -- Viagem terminou → Pós-viagem & Reativação
        v_target_stage := STAGE_POS_VIAGEM;

      ELSIF CURRENT_DATE >= v_start_date AND CURRENT_DATE <= v_end_date THEN
        -- Em viagem
        v_target_stage := STAGE_EM_VIAGEM;

      ELSIF v_days_to_start <= 30 THEN
        -- Menos de 30 dias → Pré-Embarque <<< 30
        v_target_stage := STAGE_PRE_30_MINUS;

      ELSE
        -- Mais de 30 dias → Pré-embarque >>> 30
        v_target_stage := STAGE_PRE_30_PLUS;
      END IF;

      -- ── Mover se necessário ──
      IF rec.pipeline_stage_id != v_target_stage THEN
        UPDATE cards
           SET pipeline_stage_id = v_target_stage,
               updated_at = now()
         WHERE id = rec.card_id;

        -- Log no cadence_event_log
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

-- 2. Entrada visível na lista de automações
INSERT INTO cadence_event_triggers (
  id, name, event_type, action_type, action_config,
  is_active, is_global, org_id, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'Roteamento Pós-Venda (Trips)',
  'cron_roteamento',
  'change_stage',
  jsonb_build_object(
    'description', 'Move cards automaticamente entre etapas de Pós-Venda baseado nas datas de viagem. Avalia: produtos concluídos, cadência App & Conteúdo finalizada, e proximidade da viagem.',
    'stages', jsonb_build_object(
      'app_conteudo', 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36',
      'pre_30_plus', '1f684773-f8f3-434a-a44d-4994750c41aa',
      'pre_30_minus', '3ce80249-b579-4a9c-9b82-f8569735cea9',
      'em_viagem', '0ebab355-6d0e-4b19-af13-b4b31268275f',
      'pos_viagem', '2c07134a-cb83-4075-bc86-4750beec9393'
    )
  ),
  true,   -- já ativa
  false,
  'b0000000-0000-0000-0000-000000000001',  -- Welcome Trips
  now(),
  now()
);

-- 3. Cron job — roda diariamente às 9:00 UTC (6:00 São Paulo)
SELECT cron.schedule(
  'roteamento-pos-venda-trips',
  '0 9 * * *',
  $$SELECT fn_roteamento_pos_venda_trips()$$
);
