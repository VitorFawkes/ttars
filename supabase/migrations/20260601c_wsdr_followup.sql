-- Follow-up da Sofia (wsdr): cria UMA tarefa de retomada quando o casal demonstra interesse
-- mas não marcou reunião. Idempotente (não duplica) e pula se já tem reunião agendada.
-- Mesmo padrão de resolução de contato/card do wsdr_book_meeting. SECURITY DEFINER (n8n chama sem JWT).
CREATE OR REPLACE FUNCTION public.wsdr_create_followup(
  p_org_id UUID,
  p_agent_slug TEXT,
  p_contact_phone TEXT,
  p_contact_name TEXT,
  p_days INT[] DEFAULT ARRAY[1,3,7]
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone TEXT; v_contact_id UUID; v_card_id UUID; v_stage UUID; v_tarefa_id UUID;
  v_nome TEXT; v_sob TEXT; v_parts TEXT[]; v_when TIMESTAMPTZ; v_dias INT;
BEGIN
  v_phone := normalize_phone_brazil(regexp_replace(COALESCE(p_contact_phone,''),'\D','','g'));
  IF v_phone IS NULL OR v_phone = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'telefone inválido'); END IF;

  SELECT id INTO v_contact_id FROM contatos
   WHERE org_id = p_org_id AND normalize_phone_brazil(regexp_replace(COALESCE(telefone,''),'\D','','g')) = v_phone LIMIT 1;
  IF v_contact_id IS NULL THEN
    v_parts := regexp_split_to_array(trim(COALESCE(NULLIF(trim(p_contact_name),''),'Casal')),'\s+');
    v_nome := v_parts[1];
    v_sob := CASE WHEN array_length(v_parts,1) > 1 THEN array_to_string(v_parts[2:],' ') ELSE '(casal)' END;
    INSERT INTO contatos (org_id, nome, sobrenome, telefone) VALUES (p_org_id, v_nome, v_sob, v_phone) RETURNING id INTO v_contact_id;
  END IF;

  SELECT id, pipeline_stage_id INTO v_card_id, v_stage FROM cards
   WHERE org_id = p_org_id AND produto = 'WEDDING' AND pessoa_principal_id = v_contact_id AND deleted_at IS NULL
     AND COALESCE(status_comercial,'aberto') = 'aberto' ORDER BY created_at DESC NULLS LAST LIMIT 1;
  IF v_card_id IS NULL THEN
    INSERT INTO cards (org_id, produto, pipeline_id, pipeline_stage_id, pessoa_principal_id, titulo, status_comercial)
    VALUES (p_org_id,'WEDDING','f4611f84-ce9c-48ad-814b-dcd6081f15db','6acb35af-d1a2-48e7-bc48-133907ae9554',
            v_contact_id, COALESCE(NULLIF(trim(p_contact_name),''),'Casal')||' (via Sofia)','aberto')
    RETURNING id INTO v_card_id;
  END IF;

  -- Já tem reunião agendada? Então não precisa de follow-up.
  IF v_stage = 'ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1' THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'reuniao_marcada', 'card_id', v_card_id);
  END IF;
  -- Idempotência: já existe follow-up aberto pra esse card?
  SELECT id INTO v_tarefa_id FROM tarefas
   WHERE card_id = v_card_id AND metadata->>'source' = 'wsdr_followup'
     AND COALESCE(status,'aberta') NOT IN ('concluida','concluída','cancelada') LIMIT 1;
  IF v_tarefa_id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'skipped', 'ja_existe', 'card_id', v_card_id); END IF;

  v_dias := COALESCE(p_days[1], 1);
  v_when := now() + (v_dias || ' days')::interval;
  INSERT INTO tarefas (card_id, org_id, tipo, titulo, descricao, data_vencimento, status, metadata)
  VALUES (v_card_id, p_org_id, 'tarefa', 'Retomar conversa com o casal (via Sofia)',
          'O casal demonstrou interesse mas ainda não marcou reunião. Retomar com leveza.',
          v_when, 'aberta', jsonb_build_object('source','wsdr_followup','dias', to_jsonb(p_days)))
  RETURNING id INTO v_tarefa_id;
  RETURN jsonb_build_object('ok', true, 'tarefa_id', v_tarefa_id, 'card_id', v_card_id, 'venc', to_char(v_when,'YYYY-MM-DD'));
END;$$;
GRANT EXECUTE ON FUNCTION public.wsdr_create_followup(UUID, TEXT, TEXT, TEXT, INT[]) TO authenticated, service_role;
