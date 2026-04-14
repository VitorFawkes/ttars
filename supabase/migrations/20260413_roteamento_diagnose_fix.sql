-- Fix: column "card_id" ambiguous — rename output columns to c_*
DROP FUNCTION IF EXISTS fn_roteamento_pos_venda_trips_diagnose();

CREATE OR REPLACE FUNCTION fn_roteamento_pos_venda_trips_diagnose()
RETURNS TABLE (
  c_card_id uuid,
  c_titulo text,
  c_stage_atual text,
  c_motivo text,
  c_detalhe text,
  c_viagem_inicio date,
  c_viagem_fim date
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

    IF v_travel IS NULL OR v_travel ->> 'start' IS NULL OR v_travel ->> 'end' IS NULL THEN
      RETURN QUERY SELECT rec.id, rec.titulo, rec.stage_nome::text,
        'sem_data'::text, 'Data da viagem não preenchida'::text,
        NULL::date, NULL::date;
      CONTINUE;
    END IF;

    v_start := (v_travel ->> 'start')::date;
    v_end   := (v_travel ->> 'end')::date;

    IF rec.pipeline_stage_id = v_source_stage THEN
      IF v_check_products THEN
        SELECT COUNT(*), COUNT(*) FILTER (WHERE fi.is_ready = true)
          INTO v_produtos_total, v_produtos_ready
          FROM card_financial_items fi WHERE fi.card_id = rec.id;

        IF v_produtos_total = 0 THEN
          RETURN QUERY SELECT rec.id, rec.titulo, rec.stage_nome::text,
            'sem_produtos'::text, 'Nenhum produto cadastrado'::text,
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

      IF v_check_cadence AND v_cadence_tmpl IS NOT NULL THEN
        IF EXISTS (
          SELECT 1 FROM cadence_instances ci
          WHERE ci.card_id = rec.id
            AND ci.template_id = v_cadence_tmpl
            AND ci.status IN ('active', 'waiting_task', 'paused')
        ) THEN
          RETURN QUERY SELECT rec.id, rec.titulo, rec.stage_nome::text,
            'cadencia_aberta'::text, 'Cadência com tarefas em aberto'::text,
            v_start, v_end;
          CONTINUE;
        END IF;
      END IF;
    END IF;
  END LOOP;
END;
$$;
