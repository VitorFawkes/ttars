-- ============================================================================
-- Agenda v2 da Sofia — MULTI-CLOSER + regras de oferta configuráveis.
-- A Sofia NÃO participa da reunião; ela agenda PRA um closer (Wedding Planner humano).
-- Oferece horários LIVRES de QUALQUER closer da lista, respeitando regras editáveis:
--   closer_ids[] · windows (dias úteis + faixa) · slot_duration_minutes ·
--   slot_interval_minutes (granularidade, ex 30) · slots_per_day · search_window_days ·
--   min_lead_hours (antecedência; PODE oferecer hoje) · skip_weekends.
-- Recriação fiel de 20260530d + 20260531e (LIDAS por inteiro nesta sessão):
--   PRESERVA da 30d: resolução contato/card, idempotência, card avança via trigger.
--   PRESERVA da 31e: remarcação (reagendada + reagendada_em, só futuras, <> novo horário),
--     reativação se o horário voltar, retorno remarcou/reagendadas.
--   MUDANÇAS: 1 planner -> closer_ids[]; "nunca hoje" -> antecedência mínima; passo de hora
--     -> slot_interval_minutes; teto total -> slots_per_day; oferta de qualquer closer livre.
-- Fuso BRT.
-- ============================================================================

CREATE OR REPLACE FUNCTION _wsdr_closers(v_cal JSONB) RETURNS UUID[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT array_remove(COALESCE(
    (SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(v_cal->'closer_ids') x WHERE x <> ''),
    ARRAY[NULLIF(v_cal->>'wedding_planner_profile_id','')::uuid]
  ), NULL);
$$;

CREATE OR REPLACE FUNCTION wsdr_check_availability(p_org_id UUID, p_agent_slug TEXT, p_max_slots INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cal JSONB; v_closers UUID[]; v_dur INT; v_step INT; v_per_day INT; v_skip_we BOOLEAN;
  v_max INT; v_window INT; v_lead INT; v_windows JSONB;
  v_slots JSONB := '[]'::jsonb; v_day DATE; v_w JSONB; v_min_start TIMESTAMPTZ; v_now TIMESTAMPTZ := now();
  v_total INT := 0; v_dow INT; v_start_min INT; v_end_min INT; v_m INT; v_ts TIMESTAMPTZ; v_dayc INT; v_closer UUID;
BEGIN
  SELECT config->'capabilities'->'calendar' INTO v_cal FROM wsdr_agent_config WHERE org_id=p_org_id AND slug=p_agent_slug LIMIT 1;
  IF v_cal IS NULL OR COALESCE((v_cal->>'enabled')::boolean,false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok',true,'enabled',false,'slots','[]'::jsonb); END IF;
  v_closers := _wsdr_closers(v_cal);
  v_dur     := COALESCE((v_cal->>'slot_duration_minutes')::int, 45);
  v_step    := GREATEST(15, COALESCE((v_cal->>'slot_interval_minutes')::int, 30));
  v_per_day := GREATEST(1, COALESCE((v_cal->>'slots_per_day')::int, 6));
  v_skip_we := COALESCE((v_cal->>'skip_weekends')::boolean, true);
  v_max     := COALESCE(p_max_slots, (v_cal->>'max_slots')::int, 12);
  v_window  := COALESCE((v_cal->>'search_window_days')::int, 14);
  v_lead    := COALESCE((v_cal->>'min_lead_hours')::int, 1);
  v_windows := COALESCE(v_cal->'windows', '[]'::jsonb);
  IF array_length(v_closers,1) IS NULL OR jsonb_array_length(v_windows)=0 THEN
    RETURN jsonb_build_object('ok',true,'enabled',true,'slots','[]'::jsonb,'reason','closers ou janelas não configurados'); END IF;

  v_min_start := v_now + (v_lead || ' hours')::interval;
  v_day := (v_now AT TIME ZONE 'America/Sao_Paulo')::date;
  FOR i IN 0..v_window LOOP
    EXIT WHEN v_total >= v_max;
    v_dow := EXTRACT(DOW FROM v_day)::int;
    IF NOT (v_skip_we AND (v_dow=0 OR v_dow=6)) THEN
      v_dayc := 0;
      FOR v_w IN SELECT * FROM jsonb_array_elements(v_windows) LOOP
        IF (v_w->'dias' IS NULL) OR (v_w->'dias' @> to_jsonb(v_dow)) THEN
          v_start_min := split_part(COALESCE(v_w->>'inicio','10:00'),':',1)::int*60 + COALESCE(NULLIF(split_part(v_w->>'inicio',':',2),'')::int,0);
          v_end_min   := split_part(COALESCE(v_w->>'fim','17:00'),':',1)::int*60 + COALESCE(NULLIF(split_part(v_w->>'fim',':',2),'')::int,0);
          v_m := v_start_min;
          WHILE v_m + v_dur <= v_end_min LOOP
            EXIT WHEN v_total >= v_max OR v_dayc >= v_per_day;
            v_ts := (v_day::text||' '||lpad((v_m/60)::text,2,'0')||':'||lpad((v_m%60)::text,2,'0')||':00-03')::timestamptz;
            IF v_ts >= v_min_start THEN
              v_closer := NULL;
              SELECT c INTO v_closer FROM unnest(v_closers) c
               WHERE NOT EXISTS (
                 SELECT 1 FROM tarefas t WHERE t.responsavel_id=c AND t.tipo LIKE 'reuniao%'
                   AND COALESCE(t.status,'') NOT IN ('cancelada','nao_compareceu','reagendada')
                   AND t.data_vencimento >  v_ts - (v_dur||' min')::interval
                   AND t.data_vencimento <  v_ts + (v_dur||' min')::interval
               ) LIMIT 1;
              IF v_closer IS NOT NULL THEN
                v_slots := v_slots || jsonb_build_object(
                  'iso', to_char(v_ts AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00',
                  'label', to_char(v_ts AT TIME ZONE 'America/Sao_Paulo','DD/MM')||' '||lpad((v_m/60)::text,2,'0')||'h'||(CASE WHEN v_m%60>0 THEN lpad((v_m%60)::text,2,'0') ELSE '' END),
                  'dia', to_char(v_ts AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD'),
                  'closer_id', v_closer
                );
                v_total := v_total + 1; v_dayc := v_dayc + 1;
              END IF;
            END IF;
            v_m := v_m + v_step;
          END LOOP;
        END IF;
      END LOOP;
    END IF;
    v_day := v_day + 1;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'enabled',true,'slots',v_slots);
END $$;
COMMENT ON FUNCTION wsdr_check_availability IS 'Horarios livres de QUALQUER closer por regras editaveis. BRT. Org-safe.';

CREATE OR REPLACE FUNCTION wsdr_book_meeting(p_org_id UUID, p_agent_slug TEXT, p_contact_phone TEXT, p_contact_name TEXT, p_iso TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cal JSONB; v_closers UUID[]; v_dur INT; v_phone TEXT; v_contact_id UUID; v_card_id UUID;
  v_when TIMESTAMPTZ; v_tarefa_id UUID; v_closer UUID; v_remarcadas INT := 0; v_nome TEXT; v_sob TEXT; v_parts TEXT[];
BEGIN
  SELECT config->'capabilities'->'calendar' INTO v_cal FROM wsdr_agent_config WHERE org_id=p_org_id AND slug=p_agent_slug LIMIT 1;
  IF v_cal IS NULL OR COALESCE((v_cal->>'enabled')::boolean,false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok',true,'skipped',true,'reason','agenda desligada'); END IF;
  v_closers := _wsdr_closers(v_cal);
  v_dur := COALESCE((v_cal->>'slot_duration_minutes')::int, 45);
  IF array_length(v_closers,1) IS NULL THEN RETURN jsonb_build_object('ok',false,'error','closers nao configurados'); END IF;
  BEGIN v_when := p_iso::timestamptz; EXCEPTION WHEN others THEN RETURN jsonb_build_object('ok',false,'error','data/hora invalida'); END;

  v_phone := normalize_phone_brazil(regexp_replace(COALESCE(p_contact_phone,''),'\D','','g'));
  SELECT id INTO v_contact_id FROM contatos
   WHERE org_id=p_org_id AND normalize_phone_brazil(regexp_replace(COALESCE(telefone,''),'\D','','g'))=v_phone LIMIT 1;
  IF v_contact_id IS NULL THEN
    v_parts := regexp_split_to_array(trim(COALESCE(NULLIF(trim(p_contact_name),''),'Casal')),'\s+');
    v_nome := v_parts[1];
    v_sob := CASE WHEN array_length(v_parts,1)>1 THEN array_to_string(v_parts[2:],' ') ELSE '(casal)' END;
    INSERT INTO contatos (org_id, nome, sobrenome, telefone) VALUES (p_org_id, v_nome, v_sob, v_phone) RETURNING id INTO v_contact_id;
  END IF;

  SELECT id INTO v_card_id FROM cards
   WHERE org_id=p_org_id AND produto='WEDDING' AND pessoa_principal_id=v_contact_id AND deleted_at IS NULL
     AND COALESCE(status_comercial,'aberto')='aberto' ORDER BY created_at DESC NULLS LAST LIMIT 1;
  IF v_card_id IS NULL THEN
    INSERT INTO cards (org_id, produto, pipeline_id, pipeline_stage_id, pessoa_principal_id, titulo, status_comercial)
    VALUES (p_org_id,'WEDDING','f4611f84-ce9c-48ad-814b-dcd6081f15db','6acb35af-d1a2-48e7-bc48-133907ae9554',
            v_contact_id, COALESCE(NULLIF(trim(p_contact_name),''),'Casal')||' (via Sofia)','aberto')
    RETURNING id INTO v_card_id;
  END IF;

  SELECT c INTO v_closer FROM unnest(v_closers) c
   WHERE NOT EXISTS (
     SELECT 1 FROM tarefas t WHERE t.responsavel_id=c AND t.tipo LIKE 'reuniao%'
       AND COALESCE(t.status,'') NOT IN ('cancelada','nao_compareceu','reagendada')
       AND t.data_vencimento >  v_when - (v_dur||' min')::interval
       AND t.data_vencimento <  v_when + (v_dur||' min')::interval
   ) LIMIT 1;
  IF v_closer IS NULL THEN RETURN jsonb_build_object('ok',false,'error','horario nao esta mais livre'); END IF;

  UPDATE tarefas SET status='reagendada',
         metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('reagendada_em', now())
   WHERE card_id=v_card_id AND tipo LIKE 'reuniao%' AND status='agendada' AND data_vencimento <> v_when
     AND COALESCE(metadata->>'source','')='wsdr_sofia' AND data_vencimento >= now();
  GET DIAGNOSTICS v_remarcadas = ROW_COUNT;

  SELECT id INTO v_tarefa_id FROM tarefas
   WHERE card_id=v_card_id AND responsavel_id=v_closer AND tipo LIKE 'reuniao%' AND data_vencimento=v_when LIMIT 1;
  IF v_tarefa_id IS NULL THEN
    INSERT INTO tarefas (card_id, org_id, tipo, titulo, responsavel_id, data_vencimento, status, metadata)
    VALUES (v_card_id, p_org_id, 'reuniao', 'Reuniao Wedding Planner (via Sofia)', v_closer, v_when, 'agendada',
            jsonb_build_object('duration_minutes', v_dur, 'source','wsdr_sofia'))
    RETURNING id INTO v_tarefa_id;
  ELSE
    UPDATE tarefas SET status='agendada' WHERE id=v_tarefa_id AND status='reagendada';
  END IF;

  RETURN jsonb_build_object('ok',true,'tarefa_id',v_tarefa_id,'card_id',v_card_id,'closer_id',v_closer,
    'remarcou', v_remarcadas > 0, 'reagendadas', v_remarcadas,
    'iso', to_char(v_when AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00');
END $$;
COMMENT ON FUNCTION wsdr_book_meeting IS 'Marca reuniao com um closer LIVRE (multi-closer), remarca anteriores (preserva 31e). Org-safe, idempotente.';

GRANT EXECUTE ON FUNCTION wsdr_check_availability(UUID,TEXT,INT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION wsdr_book_meeting(UUID,TEXT,TEXT,TEXT,TEXT) TO authenticated, service_role;
