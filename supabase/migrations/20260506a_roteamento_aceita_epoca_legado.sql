-- ============================================================================
-- MIGRATION: Roteamento Pós-Venda — aceitar formato legado de epoca_viagem
-- Date: 2026-05-06
--
-- Problema: 1.123 cards na fase Pós-Venda têm `epoca_viagem` no formato
-- antigo (`data_inicio`/`data_fim`) e estavam invisíveis pra automação,
-- que esperava só `start`/`end`.
--
-- Correção: as funções extraem agora as datas tentando, em ordem:
--   1. epoca_viagem.start / .end           (formato novo)
--   2. epoca_viagem.data_inicio / .data_fim (formato legado, exige tipo=data_exata)
--   3. data_exata_da_viagem.start / .end   (fallback "c/ Welcome")
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

    IF v_pipeline_id <> PIPELINE_TRIPS THEN
        RETURN v_first_pos_stage_id;
    END IF;

    -- Extrai datas tentando 3 fontes em ordem de prioridade
    v_start_date := NULL;
    v_end_date := NULL;

    IF v_produto_data IS NOT NULL THEN
        -- 1) epoca_viagem formato novo (start/end)
        IF v_produto_data -> 'epoca_viagem' ->> 'start' IS NOT NULL
           AND v_produto_data -> 'epoca_viagem' ->> 'end' IS NOT NULL THEN
            BEGIN
                v_start_date := (v_produto_data -> 'epoca_viagem' ->> 'start')::DATE;
                v_end_date   := (v_produto_data -> 'epoca_viagem' ->> 'end')::DATE;
            EXCEPTION WHEN OTHERS THEN
                v_start_date := NULL; v_end_date := NULL;
            END;
        END IF;

        -- 2) epoca_viagem formato legado (data_inicio/data_fim, tipo=data_exata)
        IF (v_start_date IS NULL OR v_end_date IS NULL)
           AND COALESCE(v_produto_data -> 'epoca_viagem' ->> 'tipo', 'data_exata') = 'data_exata'
           AND v_produto_data -> 'epoca_viagem' ->> 'data_inicio' IS NOT NULL
           AND v_produto_data -> 'epoca_viagem' ->> 'data_fim' IS NOT NULL THEN
            BEGIN
                v_start_date := (v_produto_data -> 'epoca_viagem' ->> 'data_inicio')::DATE;
                v_end_date   := (v_produto_data -> 'epoca_viagem' ->> 'data_fim')::DATE;
            EXCEPTION WHEN OTHERS THEN
                v_start_date := NULL; v_end_date := NULL;
            END;
        END IF;

        -- 3) data_exata_da_viagem (fallback c/ Welcome)
        IF (v_start_date IS NULL OR v_end_date IS NULL)
           AND v_produto_data -> 'data_exata_da_viagem' ->> 'start' IS NOT NULL
           AND v_produto_data -> 'data_exata_da_viagem' ->> 'end' IS NOT NULL THEN
            BEGIN
                v_start_date := (v_produto_data -> 'data_exata_da_viagem' ->> 'start')::DATE;
                v_end_date   := (v_produto_data -> 'data_exata_da_viagem' ->> 'end')::DATE;
            EXCEPTION WHEN OTHERS THEN
                v_start_date := NULL; v_end_date := NULL;
            END;
        END IF;
    END IF;

    IF v_start_date IS NULL OR v_end_date IS NULL THEN
        RETURN STAGE_APP_CONTEUDO;
    END IF;

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
      v_start_date := NULL;
      v_end_date := NULL;
      v_anchor_used := NULL;

      -- 1) epoca_viagem formato novo (start/end)
      IF rec.produto_data -> 'epoca_viagem' ->> 'start' IS NOT NULL
         AND rec.produto_data -> 'epoca_viagem' ->> 'end' IS NOT NULL THEN
        BEGIN
          v_start_date := (rec.produto_data -> 'epoca_viagem' ->> 'start')::date;
          v_end_date   := (rec.produto_data -> 'epoca_viagem' ->> 'end')::date;
          v_anchor_used := 'epoca_viagem';
        EXCEPTION WHEN OTHERS THEN
          v_start_date := NULL; v_end_date := NULL;
        END;
      END IF;

      -- 2) epoca_viagem formato legado (data_inicio/data_fim)
      IF (v_start_date IS NULL OR v_end_date IS NULL)
         AND COALESCE(rec.produto_data -> 'epoca_viagem' ->> 'tipo', 'data_exata') = 'data_exata'
         AND rec.produto_data -> 'epoca_viagem' ->> 'data_inicio' IS NOT NULL
         AND rec.produto_data -> 'epoca_viagem' ->> 'data_fim' IS NOT NULL THEN
        BEGIN
          v_start_date := (rec.produto_data -> 'epoca_viagem' ->> 'data_inicio')::date;
          v_end_date   := (rec.produto_data -> 'epoca_viagem' ->> 'data_fim')::date;
          v_anchor_used := 'epoca_viagem_legado';
        EXCEPTION WHEN OTHERS THEN
          v_start_date := NULL; v_end_date := NULL;
        END;
      END IF;

      -- 3) data_exata_da_viagem (fallback)
      IF (v_start_date IS NULL OR v_end_date IS NULL)
         AND rec.produto_data -> 'data_exata_da_viagem' ->> 'start' IS NOT NULL
         AND rec.produto_data -> 'data_exata_da_viagem' ->> 'end' IS NOT NULL THEN
        BEGIN
          v_start_date := (rec.produto_data -> 'data_exata_da_viagem' ->> 'start')::date;
          v_end_date   := (rec.produto_data -> 'data_exata_da_viagem' ->> 'end')::date;
          v_anchor_used := 'data_exata_da_viagem';
        EXCEPTION WHEN OTHERS THEN
          v_start_date := NULL; v_end_date := NULL;
        END;
      END IF;

      IF v_start_date IS NULL OR v_end_date IS NULL THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

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

-- ----------------------------------------------------------------------------
-- 3) fn_roteamento_pos_venda_trips_diagnose (mesma lógica)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_roteamento_pos_venda_trips_diagnose();

CREATE OR REPLACE FUNCTION public.fn_roteamento_pos_venda_trips_diagnose()
 RETURNS TABLE(
   c_card_id uuid,
   c_titulo text,
   c_stage_atual text,
   c_motivo text,
   c_detalhe text,
   c_viagem_inicio date,
   c_viagem_fim date,
   c_bloqueado_em timestamptz
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cfg             jsonb;
  v_source_stage    uuid;
  v_cadence_tmpl    uuid;
  v_check_products  boolean;
  v_check_cadence   boolean;
  rec               record;
  v_start           date;
  v_end             date;
  v_produtos_total  int;
  v_produtos_ready  int;
  v_bloqueado_em    timestamptz;

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
    SELECT c.id, c.titulo, c.pipeline_stage_id, c.produto_data,
           COALESCE(c.stage_entered_at, c.updated_at) AS bloqueado_em,
           ps.nome AS stage_nome
    FROM cards c
    JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
    WHERE c.produto = 'TRIPS'
      AND c.status_comercial = 'aberto'
      AND c.pipeline_stage_id IN (v_source_stage, STAGE_PRE_PLUS, STAGE_PRE_MINUS, STAGE_EM_VIAGEM)
    ORDER BY COALESCE(c.stage_entered_at, c.updated_at) DESC NULLS LAST
  LOOP
    v_bloqueado_em := rec.bloqueado_em;
    v_start := NULL;
    v_end := NULL;

    -- 1) epoca_viagem novo
    IF rec.produto_data -> 'epoca_viagem' ->> 'start' IS NOT NULL
       AND rec.produto_data -> 'epoca_viagem' ->> 'end' IS NOT NULL THEN
      BEGIN
        v_start := (rec.produto_data -> 'epoca_viagem' ->> 'start')::date;
        v_end   := (rec.produto_data -> 'epoca_viagem' ->> 'end')::date;
      EXCEPTION WHEN OTHERS THEN
        v_start := NULL; v_end := NULL;
      END;
    END IF;

    -- 2) epoca_viagem legado
    IF (v_start IS NULL OR v_end IS NULL)
       AND COALESCE(rec.produto_data -> 'epoca_viagem' ->> 'tipo', 'data_exata') = 'data_exata'
       AND rec.produto_data -> 'epoca_viagem' ->> 'data_inicio' IS NOT NULL
       AND rec.produto_data -> 'epoca_viagem' ->> 'data_fim' IS NOT NULL THEN
      BEGIN
        v_start := (rec.produto_data -> 'epoca_viagem' ->> 'data_inicio')::date;
        v_end   := (rec.produto_data -> 'epoca_viagem' ->> 'data_fim')::date;
      EXCEPTION WHEN OTHERS THEN
        v_start := NULL; v_end := NULL;
      END;
    END IF;

    -- 3) data_exata_da_viagem
    IF (v_start IS NULL OR v_end IS NULL)
       AND rec.produto_data -> 'data_exata_da_viagem' ->> 'start' IS NOT NULL
       AND rec.produto_data -> 'data_exata_da_viagem' ->> 'end' IS NOT NULL THEN
      BEGIN
        v_start := (rec.produto_data -> 'data_exata_da_viagem' ->> 'start')::date;
        v_end   := (rec.produto_data -> 'data_exata_da_viagem' ->> 'end')::date;
      EXCEPTION WHEN OTHERS THEN
        v_start := NULL; v_end := NULL;
      END;
    END IF;

    IF v_start IS NULL OR v_end IS NULL THEN
      RETURN QUERY SELECT rec.id, rec.titulo, rec.stage_nome::text,
        'sem_data'::text, 'Data da viagem não preenchida'::text,
        NULL::date, NULL::date, v_bloqueado_em;
      CONTINUE;
    END IF;

    IF rec.pipeline_stage_id = v_source_stage THEN
      IF v_check_products THEN
        SELECT COUNT(*), COUNT(*) FILTER (WHERE fi.is_ready = true)
          INTO v_produtos_total, v_produtos_ready
          FROM card_financial_items fi WHERE fi.card_id = rec.id;

        IF v_produtos_total = 0 THEN
          RETURN QUERY SELECT rec.id, rec.titulo, rec.stage_nome::text,
            'sem_produtos'::text, 'Nenhum produto cadastrado'::text,
            v_start, v_end, v_bloqueado_em;
          CONTINUE;
        END IF;

        IF v_produtos_ready < v_produtos_total THEN
          RETURN QUERY SELECT rec.id, rec.titulo, rec.stage_nome::text,
            'produtos_pendentes'::text,
            (v_produtos_ready || ' de ' || v_produtos_total || ' produtos prontos')::text,
            v_start, v_end, v_bloqueado_em;
          CONTINUE;
        END IF;
      END IF;

      IF v_check_cadence AND v_cadence_tmpl IS NOT NULL THEN
        IF EXISTS (
          SELECT 1 FROM cadence_instances ci
          WHERE ci.card_id = rec.id
            AND ci.template_id = v_cadence_tmpl
            AND ci.status IN ('active', 'waiting_task', 'paused')
        ) THEN
          RETURN QUERY SELECT rec.id, rec.titulo, rec.stage_nome::text,
            'cadencia_aberta'::text, 'Cadência com tarefas em aberto'::text,
            v_start, v_end, v_bloqueado_em;
          CONTINUE;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_roteamento_pos_venda_trips_diagnose() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_calcular_etapa_pos_venda(UUID) TO authenticated;

COMMIT;
