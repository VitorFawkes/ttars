-- ============================================================================
-- wsdr_check_availability — ESPALHA os horários ao longo do dia (manhã/tarde/noite)
-- ----------------------------------------------------------------------------
-- Antes (20260602b): pegava os PRIMEIROS slots_per_day de cada dia (sempre manhã).
-- Isso fazia a Sofia oferecer só horários de manhã, mesmo pra quem queria fim de
-- tarde — uma das causas da "resposta burra" no agendamento (ofereceu manhã pra
-- quem pediu 17h30). Agora: coleta TODOS os horários livres válidos do dia e
-- amostra slots_per_day distribuídos uniformemente (inclui sempre o primeiro e o
-- último do dia), dando variedade real de período.
--
-- REBASE CHECK (CLAUDE.md TOP 5 #5): baseado VERBATIM em 20260602b_wsdr_calendar_multi_closer
-- (versão atual em prod). Preserva: multi-closer (_wsdr_closers), min_lead_hours +
-- oferta hoje, slot_interval_minutes, labels com minutos, checagem de conflito por
-- janela (> v_ts - dur AND < v_ts + dur), status NOT IN (...,'reagendada') [fix 31e],
-- regra v_m + v_dur <= v_end_min. ÚNICA mudança: seleção por dia (cedo+cap -> espalha).
-- 20260530d já era superseded por 20260602b (planner único, horário cheio, nunca-hoje).
-- Read-only (sem mutação). Org-safe.
-- ============================================================================

CREATE OR REPLACE FUNCTION wsdr_check_availability(p_org_id UUID, p_agent_slug TEXT, p_max_slots INT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cal JSONB; v_closers UUID[]; v_dur INT; v_step INT; v_per_day INT; v_skip_we BOOLEAN;
  v_max INT; v_window INT; v_lead INT; v_windows JSONB;
  v_slots JSONB := '[]'::jsonb; v_day DATE; v_w JSONB; v_min_start TIMESTAMPTZ; v_now TIMESTAMPTZ := now();
  v_total INT := 0; v_dow INT; v_start_min INT; v_end_min INT; v_m INT; v_ts TIMESTAMPTZ; v_closer UUID;
  v_cands JSONB[]; v_n INT; v_idx INT; j INT;
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
      v_cands := ARRAY[]::jsonb[];  -- candidatos livres do dia, em ordem cronológica
      FOR v_w IN SELECT * FROM jsonb_array_elements(v_windows) LOOP
        IF (v_w->'dias' IS NULL) OR (v_w->'dias' @> to_jsonb(v_dow)) THEN
          v_start_min := split_part(COALESCE(v_w->>'inicio','10:00'),':',1)::int*60 + COALESCE(NULLIF(split_part(v_w->>'inicio',':',2),'')::int,0);
          v_end_min   := split_part(COALESCE(v_w->>'fim','17:00'),':',1)::int*60 + COALESCE(NULLIF(split_part(v_w->>'fim',':',2),'')::int,0);
          v_m := v_start_min;
          WHILE v_m + v_dur <= v_end_min LOOP
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
                v_cands := v_cands || jsonb_build_object(
                  'iso', to_char(v_ts AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00',
                  'label', to_char(v_ts AT TIME ZONE 'America/Sao_Paulo','DD/MM')||' '||lpad((v_m/60)::text,2,'0')||'h'||(CASE WHEN v_m%60>0 THEN lpad((v_m%60)::text,2,'0') ELSE '' END),
                  'dia', to_char(v_ts AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD'),
                  'closer_id', v_closer
                );
              END IF;
            END IF;
            v_m := v_m + v_step;
          END LOOP;
        END IF;
      END LOOP;
      -- Amostra até v_per_day candidatos ESPALHADOS pelo dia (índices uniformes, inclui
      -- o primeiro e o último). Dá variedade de período em vez de só os mais cedo.
      v_n := COALESCE(array_length(v_cands,1),0);
      IF v_n > 0 THEN
        IF v_n <= v_per_day THEN
          FOR j IN 1..v_n LOOP
            EXIT WHEN v_total >= v_max;
            v_slots := v_slots || v_cands[j]; v_total := v_total + 1;
          END LOOP;
        ELSIF v_per_day = 1 THEN
          v_slots := v_slots || v_cands[1]; v_total := v_total + 1;
        ELSE
          FOR j IN 0..(v_per_day-1) LOOP
            EXIT WHEN v_total >= v_max;
            v_idx := 1 + round(j::numeric * (v_n - 1) / (v_per_day - 1))::int;
            v_slots := v_slots || v_cands[v_idx]; v_total := v_total + 1;
          END LOOP;
        END IF;
      END IF;
    END IF;
    v_day := v_day + 1;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'enabled',true,'slots',v_slots);
END $$;
COMMENT ON FUNCTION wsdr_check_availability IS 'Horarios livres de QUALQUER closer por regras editaveis, ESPALHADOS ao longo do dia (manha/tarde/noite). BRT. Org-safe.';
