-- ============================================================================
-- M2 — Sofia REMARCA reunião (a pedido do casal)
-- Recria wsdr_book_meeting acrescentando o tratamento de REMARCAÇÃO: ao marcar um
-- novo horário, qualquer reunião futura já agendada via Sofia pra esse card em OUTRO
-- horário é marcada como 'reagendada' (não fica duas reuniões 'agendada'). Re-marcar
-- o MESMO horário continua idempotente.
-- Recriação fiel de 20260530d_wsdr_calendar.sql; ÚNICA mudança: bloco de remarca.
-- (Rule #5: grep confirmou que 20260530d é a única definição anterior.)
-- ============================================================================

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
  v_remarcadas INT := 0;
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

  -- remarca: reuniões futuras já agendadas via Sofia em OUTRO horário viram 'reagendada'.
  UPDATE tarefas SET status='reagendada',
         metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('reagendada_em', now())
   WHERE card_id=v_card_id AND responsavel_id=v_planner AND tipo LIKE 'reuniao%'
     AND status='agendada' AND data_vencimento <> v_when
     AND COALESCE(metadata->>'source','')='wsdr_sofia'
     AND data_vencimento >= now();
  GET DIAGNOSTICS v_remarcadas = ROW_COUNT;

  -- idempotência: já existe reunião do planner nesse horário pra esse card?
  SELECT id INTO v_tarefa_id FROM tarefas
   WHERE card_id=v_card_id AND responsavel_id=v_planner AND tipo LIKE 'reuniao%' AND data_vencimento=v_when LIMIT 1;
  IF v_tarefa_id IS NULL THEN
    INSERT INTO tarefas (card_id, org_id, tipo, titulo, responsavel_id, data_vencimento, status, metadata)
    VALUES (v_card_id, p_org_id, 'reuniao', 'Reunião Wedding Planner (via Sofia)', v_planner, v_when, 'agendada',
            jsonb_build_object('duration_minutes', v_dur, 'source','wsdr_sofia'))
    RETURNING id INTO v_tarefa_id;
  ELSE
    -- se o horário voltou a ser o de uma reunião que tinha sido reagendada, reativa
    UPDATE tarefas SET status='agendada' WHERE id=v_tarefa_id AND status='reagendada';
  END IF;

  RETURN jsonb_build_object('ok', true, 'tarefa_id', v_tarefa_id, 'card_id', v_card_id,
                            'remarcou', v_remarcadas > 0, 'reagendadas', v_remarcadas,
                            'iso', to_char(v_when AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS')||'-03:00');
END $$;
COMMENT ON FUNCTION wsdr_book_meeting IS 'Sofia marca e REMARCA reunião em tarefas (card avança via trigger; remarca marca a anterior como reagendada). Org-safe, idempotente.';
