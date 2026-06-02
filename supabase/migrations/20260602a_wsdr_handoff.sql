-- Handoff da Sofia (wsdr): passa o casal pra um humano quando ela trava ou o casal fica
-- insatisfeito / pede falar com gente. Resolve contato/card igual ao wsdr_create_followup,
-- move o card pra uma etapa (opcional), aplica tag e cria UMA tarefa pra um humano assumir.
-- Idempotente: não duplica a tarefa de handoff aberta. SECURITY DEFINER (n8n chama sem JWT).
CREATE OR REPLACE FUNCTION public.wsdr_handoff(
  p_org_id UUID,
  p_agent_slug TEXT,
  p_contact_phone TEXT,
  p_contact_name TEXT,
  p_motivo TEXT DEFAULT NULL,
  p_target_stage_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone TEXT; v_contact_id UUID; v_card_id UUID; v_tarefa_id UUID;
  v_nome TEXT; v_sob TEXT; v_parts TEXT[];
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

  SELECT id INTO v_card_id FROM cards
   WHERE org_id = p_org_id AND produto = 'WEDDING' AND pessoa_principal_id = v_contact_id AND deleted_at IS NULL
     AND COALESCE(status_comercial,'aberto') = 'aberto' ORDER BY created_at DESC NULLS LAST LIMIT 1;
  IF v_card_id IS NULL THEN
    INSERT INTO cards (org_id, produto, pipeline_id, pipeline_stage_id, pessoa_principal_id, titulo, status_comercial)
    VALUES (p_org_id,'WEDDING','f4611f84-ce9c-48ad-814b-dcd6081f15db','6acb35af-d1a2-48e7-bc48-133907ae9554',
            v_contact_id, COALESCE(NULLIF(trim(p_contact_name),''),'Casal')||' (via Sofia)','aberto')
    RETURNING id INTO v_card_id;
  END IF;

  -- Move etapa (se foi pedida e existe).
  IF p_target_stage_id IS NOT NULL THEN
    UPDATE cards SET pipeline_stage_id = p_target_stage_id WHERE id = v_card_id;
  END IF;

  -- Idempotência: já existe tarefa de handoff aberta pra esse card?
  SELECT id INTO v_tarefa_id FROM tarefas
   WHERE card_id = v_card_id AND metadata->>'source' = 'wsdr_handoff'
     AND COALESCE(status,'aberta') NOT IN ('concluida','concluída','cancelada') LIMIT 1;
  IF v_tarefa_id IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'skipped', 'ja_existe', 'card_id', v_card_id); END IF;

  INSERT INTO tarefas (card_id, org_id, tipo, titulo, descricao, data_vencimento, status, metadata)
  VALUES (v_card_id, p_org_id, 'tarefa', 'Assumir conversa (a Sofia pediu)',
          COALESCE(NULLIF(trim(p_motivo),''), 'A Sofia passou esta conversa pra um humano. Assuma com atenção.'),
          now(), 'aberta', jsonb_build_object('source','wsdr_handoff','motivo', p_motivo))
  RETURNING id INTO v_tarefa_id;

  RETURN jsonb_build_object('ok', true, 'tarefa_id', v_tarefa_id, 'card_id', v_card_id);
END;$$;
GRANT EXECUTE ON FUNCTION public.wsdr_handoff(UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated, service_role;
