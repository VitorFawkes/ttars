-- ============================================================================
-- M1 — Gravação no CRM pela Sofia (org-safe, chamada pelo n8n SEM JWT)
-- Acha/cria o card Weddings do casal e grava os campos ww_* coletados na conversa,
-- validando cada chave contra system_fields reais + allowlist da config + protegidos.
-- Reaproveita o trigger existente de AC/cadência (dispara no INSERT de cards).
-- ============================================================================

CREATE OR REPLACE FUNCTION wsdr_persist_lead(
  p_org_id UUID,
  p_agent_slug TEXT,
  p_contact_phone TEXT,
  p_contact_name TEXT,
  p_fields JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg            JSONB;
  v_crm            JSONB;
  v_allow          TEXT[];
  v_protect        TEXT[];
  v_phone          TEXT;
  v_contact_id     UUID;
  v_card_id        UUID;
  v_pipeline       UUID := 'f4611f84-ce9c-48ad-814b-dcd6081f15db';
  v_stage_novo     UUID := '6acb35af-d1a2-48e7-bc48-133907ae9554';
  v_target_stage   UUID;
  v_stage_move     BOOLEAN;
  v_patch          JSONB := '{}'::jsonb;
  v_key            TEXT;
  v_val            JSONB;
  v_written        TEXT[] := '{}';
  v_action         TEXT := 'updated';
  v_nome           TEXT;
  v_sobrenome      TEXT;
  v_name_parts     TEXT[];
  -- default allowlist: campos que a SDR coleta (só são gravados se existirem em system_fields)
  v_default_allow  TEXT[] := ARRAY['ww_destino','ww_num_convidados','ww_orcamento_faixa','ww_data_casamento','ww_nome_parceiro','ww_tipo_casamento','ww_mkt_como_conheceu'];
BEGIN
  -- 1. carrega config + checa se a capacidade está ligada
  SELECT config INTO v_cfg FROM wsdr_agent_config WHERE org_id = p_org_id AND slug = p_agent_slug LIMIT 1;
  v_crm := COALESCE(v_cfg->'capabilities'->'crm_write', '{}'::jsonb);
  IF COALESCE((v_crm->>'enabled')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'crm_write desligado');
  END IF;

  -- allowlist efetiva (config, ou default) e protegidos
  IF jsonb_array_length(COALESCE(v_crm->'writable_fields','[]'::jsonb)) > 0 THEN
    SELECT array_agg(value::text) INTO v_allow FROM jsonb_array_elements_text(v_crm->'writable_fields');
  ELSE
    v_allow := v_default_allow;
  END IF;
  SELECT COALESCE(array_agg(value::text), '{}') INTO v_protect FROM jsonb_array_elements_text(COALESCE(v_crm->'protected_fields','[]'::jsonb));
  v_stage_move := COALESCE((v_crm->>'stage_move_enabled')::boolean, false);
  v_target_stage := NULLIF(v_crm->>'target_stage_id','')::uuid;

  -- 2. telefone normalizado
  v_phone := normalize_phone_brazil(regexp_replace(COALESCE(p_contact_phone,''), '\D', '', 'g'));
  IF v_phone IS NULL OR length(v_phone) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'telefone inválido');
  END IF;

  -- 3. acha/cria contato (org-scoped) — telefone direto ou via contato_meios
  SELECT id INTO v_contact_id FROM contatos
   WHERE org_id = p_org_id AND normalize_phone_brazil(regexp_replace(COALESCE(telefone,''),'\D','','g')) = v_phone
   LIMIT 1;
  IF v_contact_id IS NULL THEN
    SELECT contato_id INTO v_contact_id FROM contato_meios
     WHERE org_id = p_org_id AND tipo = 'telefone'
       AND normalize_phone_brazil(regexp_replace(COALESCE(valor,''),'\D','','g')) = v_phone
     LIMIT 1;
  END IF;
  IF v_contact_id IS NULL THEN
    -- separa nome/sobrenome (trigger check_contato_required_fields exige sobrenome)
    v_name_parts := regexp_split_to_array(trim(COALESCE(NULLIF(trim(p_contact_name),''), 'Casal')), '\s+');
    v_nome := v_name_parts[1];
    v_sobrenome := CASE WHEN array_length(v_name_parts,1) > 1
                        THEN array_to_string(v_name_parts[2:], ' ')
                        ELSE '(casal)' END;
    INSERT INTO contatos (org_id, nome, sobrenome, telefone)
    VALUES (p_org_id, v_nome, v_sobrenome, v_phone)
    RETURNING id INTO v_contact_id;
  END IF;

  -- 4. acha card Weddings aberto do casal, senão cria
  SELECT id INTO v_card_id FROM cards
   WHERE org_id = p_org_id AND produto = 'WEDDING' AND pessoa_principal_id = v_contact_id
     AND deleted_at IS NULL AND COALESCE(status_comercial,'aberto') = 'aberto'
   ORDER BY created_at DESC NULLS LAST LIMIT 1;
  IF v_card_id IS NULL THEN
    INSERT INTO cards (org_id, produto, pipeline_id, pipeline_stage_id, pessoa_principal_id, titulo, status_comercial)
    VALUES (p_org_id, 'WEDDING', v_pipeline, v_stage_novo, v_contact_id,
            COALESCE(NULLIF(trim(p_contact_name),''),'Casal') || ' (via Sofia)', 'aberto')
    RETURNING id INTO v_card_id;
    v_action := 'created';
  END IF;

  -- 5. monta patch: só chaves na allowlist, fora dos protegidos, E que existam em system_fields ativos
  FOR v_key, v_val IN SELECT key, value FROM jsonb_each(COALESCE(p_fields,'{}'::jsonb)) LOOP
    CONTINUE WHEN v_key = ANY(v_protect);
    CONTINUE WHEN NOT (v_key = ANY(v_allow));
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM system_fields WHERE org_id = p_org_id AND key = v_key AND active IS TRUE
    );
    v_patch := v_patch || jsonb_build_object(v_key, v_val);
    v_written := array_append(v_written, v_key);
  END LOOP;

  -- 6. grava merge em produto_data (preserva o que já existe)
  IF v_patch <> '{}'::jsonb THEN
    UPDATE cards SET produto_data = COALESCE(produto_data,'{}'::jsonb) || v_patch
     WHERE id = v_card_id;
  END IF;

  -- 7. move etapa (opcional, conservador: só avança, nunca volta)
  IF v_stage_move AND v_target_stage IS NOT NULL THEN
    UPDATE cards SET pipeline_stage_id = v_target_stage
     WHERE id = v_card_id AND pipeline_stage_id = v_stage_novo;
  END IF;

  RETURN jsonb_build_object('ok', true, 'card_id', v_card_id, 'contact_id', v_contact_id,
                            'action', v_action, 'written', to_jsonb(v_written));
END $$;
COMMENT ON FUNCTION wsdr_persist_lead IS 'Sofia grava o casal no CRM (Weddings): acha/cria contato+card, grava ww_* validados por allowlist+system_fields. Org-safe (p_org_id), sem JWT.';
