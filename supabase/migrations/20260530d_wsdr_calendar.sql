-- ============================================================================
-- M2 — Agenda interna do CRM (NÃO Google). Sofia vê horários livres e marca
-- reunião real em `tarefas` (tipo='reuniao'); o card avança sozinho pelo trigger
-- trg_move_card_on_meeting_scheduled. Org-safe (sem JWT). Espelha a lógica do
-- ai-agent-router-v2 (_utils.ts:609-1003) mas lendo a config wsdr.
-- ============================================================================

-- Disponibilidade: gera próximos slots a partir das janelas da config, excluindo
-- horários já ocupados da Wedding Planner. Fuso BRT (-03:00).
CREATE OR REPLACE FUNCTION wsdr_check_availability(
  p_org_id UUID,
  p_agent_slug TEXT,
  p_max_slots INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cal        JSONB;
  v_planner    UUID;
  v_dur        INT;
  v_skip_we    BOOLEAN;
  v_max        INT;
  v_window     INT;
  v_windows    JSONB;
  v_slots      JSONB := '[]'::jsonb;
  v_day        DATE;
  v_w          JSONB;
  v_h          INT;
  v_ts         TIMESTAMPTZ;
  v_count      INT := 0;
  v_dow        INT;
BEGIN
  SELECT config->'capabilities'->'calendar' INTO v_cal
  FROM wsdr_agent_config WHERE org_id = p_org_id AND slug = p_agent_slug LIMIT 1;
  IF v_cal IS NULL OR COALESCE((v_cal->>'enabled')::boolean,false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true, 'enabled', false, 'slots', '[]'::jsonb);
  END IF;
  v_planner := NULLIF(v_cal->>'wedding_planner_profile_id','')::uuid;
  v_dur     := COALESCE((v_cal->>'slot_duration_minutes')::int, 45);
  v_skip_we := COALESCE((v_cal->>'skip_weekends')::boolean, true);
  v_max     := COALESCE(p_max_slots, (v_cal->>'max_slots')::int, 4);
  v_window  := COALESCE((v_cal->>'search_window_days')::int, 14);
  v_windows := COALESCE(v_cal->'windows', '[]'::jsonb);
  IF v_planner IS NULL OR jsonb_array_length(v_windows) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'enabled', true, 'slots', '[]'::jsonb, 'reason', 'planner ou janelas não configurados');
  END IF;

  v_day := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1; -- nunca hoje
  FOR i IN 0..v_window LOOP
    EXIT WHEN v_count >= v_max;
    v_dow := EXTRACT(DOW FROM v_day)::int; -- 0=dom..6=sab
    IF NOT (v_skip_we AND (v_dow = 0 OR v_dow = 6)) THEN
      FOR v_w IN SELECT * FROM jsonb_array_elements(v_windows) LOOP
        -- v_w: { dias:[1..5], inicio:"10:00", fim:"17:00" } — dias opcional
        IF (v_w->'dias' IS NULL) OR (v_w->'dias' @> to_jsonb(v_dow)) THEN
          v_h := split_part(COALESCE(v_w->>'inicio','10:00'),':',1)::int;
          WHILE v_h + (v_dur/60.0) <= split_part(COALESCE(v_w->>'fim','17:00'),':',1)::int LOOP
            EXIT WHEN v_count >= v_max;
            v_ts := (v_day::text || ' ' || lpad(v_h::text,2,'0') || ':00:00-03')::timestamptz;
            IF NOT EXISTS (
              SELECT 1 FROM tarefas
              WHERE responsavel_id = v_planner
                AND tipo LIKE 'reuniao%'
                AND COALESCE(status,'') NOT IN ('cancelada','nao_compareceu')
                AND data_vencimento = v_ts
            ) THEN
              v_slots := v_slots || jsonb_build_object(
                'iso', to_char(v_ts AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00',
                'label', to_char(v_ts AT TIME ZONE 'America/Sao_Paulo','DD/MM')||' às '||lpad(v_h::text,2,'0')||'h'
              );
              v_count := v_count + 1;
            END IF;
            v_h := v_h + GREATEST(1, (v_dur/60));
          END LOOP;
        END IF;
      END LOOP;
    END IF;
    v_day := v_day + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'enabled', true, 'slots', v_slots);
END $$;
COMMENT ON FUNCTION wsdr_check_availability IS 'Slots livres da Wedding Planner a partir das janelas da config wsdr (BRT). Org-safe.';

-- Marca a reunião: acha/cria o card do casal e insere tarefa reuniao (card move sozinho).
CREATE OR REPLACE FUNCTION wsdr_book_meeting(
  p_org_id UUID,
  p_agent_slug TEXT,
  p_contact_phone TEXT,
  p_contact_name TEXT,
  p_iso TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cal        JSONB;
  v_planner    UUID;
  v_dur        INT;
  v_phone      TEXT;
  v_contact_id UUID;
  v_card_id    UUID;
  v_when       TIMESTAMPTZ;
  v_tarefa_id  UUID;
  v_nome       TEXT; v_sob TEXT; v_parts TEXT[];
BEGIN
  SELECT config->'capabilities'->'calendar' INTO v_cal
  FROM wsdr_agent_config WHERE org_id = p_org_id AND slug = p_agent_slug LIMIT 1;
  IF v_cal IS NULL OR COALESCE((v_cal->>'enabled')::boolean,false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'agenda desligada');
  END IF;
  v_planner := NULLIF(v_cal->>'wedding_planner_profile_id','')::uuid;
  v_dur := COALESCE((v_cal->>'slot_duration_minutes')::int, 45);
  IF v_planner IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Wedding Planner não configurada'); END IF;
  BEGIN v_when := p_iso::timestamptz; EXCEPTION WHEN others THEN RETURN jsonb_build_object('ok', false, 'error', 'data/hora inválida'); END;

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

  -- idempotência: já existe reunião do planner nesse horário pra esse card?
  SELECT id INTO v_tarefa_id FROM tarefas
   WHERE card_id=v_card_id AND responsavel_id=v_planner AND tipo LIKE 'reuniao%' AND data_vencimento=v_when LIMIT 1;
  IF v_tarefa_id IS NULL THEN
    INSERT INTO tarefas (card_id, org_id, tipo, titulo, responsavel_id, data_vencimento, status, metadata)
    VALUES (v_card_id, p_org_id, 'reuniao', 'Reunião Wedding Planner (via Sofia)', v_planner, v_when, 'agendada',
            jsonb_build_object('duration_minutes', v_dur, 'source','wsdr_sofia'))
    RETURNING id INTO v_tarefa_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'tarefa_id', v_tarefa_id, 'card_id', v_card_id, 'iso', to_char(v_when AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00');
END $$;
COMMENT ON FUNCTION wsdr_book_meeting IS 'Sofia marca reunião real em tarefas (card avança via trigger). Org-safe, idempotente.';
