-- ============================================================================
-- MIGRATION: Roteamento Pós-Venda — usar "Data Viagem Completa" como primária
-- Date: 2026-05-05
--
-- Antes: usava só `data_exata_da_viagem` (label "Data Viagem c/ Welcome").
-- Agora: usa `epoca_viagem` (label "Data Viagem Completa") como primária.
--        Se `epoca_viagem` estiver vazia, faz fallback para `data_exata_da_viagem`.
--
-- Atualiza ambas as funções:
--   - fn_calcular_etapa_pos_venda (utilitária, usada pelo RPC enviar_para_pos_venda)
--   - fn_roteamento_pos_venda_trips (cron diário às 9h UTC)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) fn_calcular_etapa_pos_venda
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calcular_etapa_pos_venda(
    p_card_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_pipeline_id UUID;
    v_produto_data JSONB;
    v_pos_phase_id UUID;
    v_first_pos_stage_id UUID;
    v_target_stage_id UUID;
    v_travel_data JSONB;
    v_start_date DATE;
    v_end_date DATE;
    v_days_to_start INT;

    STAGE_APP_CONTEUDO  CONSTANT UUID := 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36';
    STAGE_PRE_30_PLUS   CONSTANT UUID := '1f684773-f8f3-434a-a44d-4994750c41aa';
    STAGE_PRE_30_MINUS  CONSTANT UUID := '3ce80249-b579-4a9c-9b82-f8569735cea9';
    STAGE_EM_VIAGEM     CONSTANT UUID := '0ebab355-6d0e-4b19-af13-b4b31268275f';
    STAGE_POS_VIAGEM    CONSTANT UUID := '2c07134a-cb83-4075-bc86-4750beec9393';
    PIPELINE_TRIPS      CONSTANT UUID := 'c8022522-4a1d-411c-9387-efe03ca725ee';
BEGIN
    SELECT s.pipeline_id, c.produto_data
      INTO v_pipeline_id, v_produto_data
      FROM cards c
      JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
     WHERE c.id = p_card_id;

    IF v_pipeline_id IS NULL THEN
        RAISE EXCEPTION 'Card não encontrado: %', p_card_id;
    END IF;

    SELECT pp.id INTO v_pos_phase_id
      FROM pipeline_phases pp
      JOIN pipeline_stages s2 ON s2.phase_id = pp.id
     WHERE s2.pipeline_id = v_pipeline_id
       AND pp.slug = 'pos_venda'
     LIMIT 1;

    IF v_pos_phase_id IS NULL THEN
        RAISE EXCEPTION 'Fase pos_venda não encontrada para o pipeline %', v_pipeline_id;
    END IF;

    SELECT s.id INTO v_first_pos_stage_id
      FROM pipeline_stages s
     WHERE s.phase_id = v_pos_phase_id
       AND s.ativo = true
       AND COALESCE(s.is_won, false) = false
       AND COALESCE(s.is_lost, false) = false
     ORDER BY s.ordem ASC
     LIMIT 1;

    IF v_first_pos_stage_id IS NULL THEN
        RAISE EXCEPTION 'Nenhuma etapa ativa encontrada na fase pos_venda do pipeline %', v_pipeline_id;
    END IF;

    IF v_pipeline_id <> PIPELINE_TRIPS THEN
        RETURN v_first_pos_stage_id;
    END IF;

    -- TRIPS: aplica regra de data
    -- Prioridade: epoca_viagem ("Data Viagem Completa")
    -- Fallback:   data_exata_da_viagem ("Data Viagem c/ Welcome")
    IF v_produto_data IS NOT NULL
       AND v_produto_data -> 'epoca_viagem' IS NOT NULL
       AND v_produto_data -> 'epoca_viagem' ->> 'start' IS NOT NULL
       AND v_produto_data -> 'epoca_viagem' ->> 'end'   IS NOT NULL
    THEN
        v_travel_data := v_produto_data -> 'epoca_viagem';
    ELSIF v_produto_data IS NOT NULL
       AND v_produto_data -> 'data_exata_da_viagem' IS NOT NULL
       AND v_produto_data -> 'data_exata_da_viagem' ->> 'start' IS NOT NULL
       AND v_produto_data -> 'data_exata_da_viagem' ->> 'end'   IS NOT NULL
    THEN
        v_travel_data := v_produto_data -> 'data_exata_da_viagem';
    ELSE
        RETURN STAGE_APP_CONTEUDO;
    END IF;

    BEGIN
        v_start_date := (v_travel_data ->> 'start')::DATE;
        v_end_date   := (v_travel_data ->> 'end')::DATE;
    EXCEPTION WHEN OTHERS THEN
        RETURN STAGE_APP_CONTEUDO;
    END;

    v_days_to_start := v_start_date - CURRENT_DATE;

    IF CURRENT_DATE > v_end_date THEN
        v_target_stage_id := STAGE_POS_VIAGEM;
    ELSIF CURRENT_DATE >= v_start_date AND CURRENT_DATE <= v_end_date THEN
        v_target_stage_id := STAGE_EM_VIAGEM;
    ELSIF v_days_to_start <= 30 THEN
        v_target_stage_id := STAGE_PRE_30_MINUS;
    ELSE
        v_target_stage_id := STAGE_PRE_30_PLUS;
    END IF;

    RETURN v_target_stage_id;
END;
$fn$;

COMMENT ON FUNCTION public.fn_calcular_etapa_pos_venda(UUID) IS
  'Retorna UUID da etapa correta da fase pos_venda para o card. Para TRIPS prioriza epoca_viagem (Data Viagem Completa); fallback data_exata_da_viagem (Data Viagem c/ Welcome).';

-- ----------------------------------------------------------------------------
-- 2) fn_roteamento_pos_venda_trips (cron diário)
-- ----------------------------------------------------------------------------
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
  v_anchor_used    text;
  v_start_date     date;
  v_end_date       date;
  v_target_stage   uuid;
  v_days_to_start  int;

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
      -- Prioridade: epoca_viagem ("Data Viagem Completa")
      -- Fallback:   data_exata_da_viagem ("Data Viagem c/ Welcome")
      IF rec.produto_data -> 'epoca_viagem' IS NOT NULL
         AND rec.produto_data -> 'epoca_viagem' ->> 'start' IS NOT NULL
         AND rec.produto_data -> 'epoca_viagem' ->> 'end'   IS NOT NULL
      THEN
        v_travel_data := rec.produto_data -> 'epoca_viagem';
        v_anchor_used := 'epoca_viagem';
      ELSIF rec.produto_data -> 'data_exata_da_viagem' IS NOT NULL
         AND rec.produto_data -> 'data_exata_da_viagem' ->> 'start' IS NOT NULL
         AND rec.produto_data -> 'data_exata_da_viagem' ->> 'end'   IS NOT NULL
      THEN
        v_travel_data := rec.produto_data -> 'data_exata_da_viagem';
        v_anchor_used := 'data_exata_da_viagem';
      ELSE
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
            'skip_pos_venda', COALESCE(rec.skip_pos_venda, false),
            'anchor_used', v_anchor_used
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
