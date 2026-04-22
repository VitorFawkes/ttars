-- ============================================================================
-- Wedding Stage Configs (2026-04-22)
-- ============================================================================
-- Ajusta stage_field_config do pipeline Weddings apos o rebuild do funil:
--   1. Marca campos obrigatorios nas transicoes-chave (is_required + is_blocking)
--   2. Marca show_in_header=true nos 2-3 campos mais importantes por stage
--   3. Adiciona os 25 campos ww_plan_* novos aos 7 stages de Pos-venda
--
-- Estrategia: UPSERT (ON CONFLICT) — preserva as 684 configs existentes
-- que ja tem baseline de visibilidade, so ajusta o que muda.
-- ============================================================================

DO $$
DECLARE
  v_pipeline_id UUID := 'f4611f84-ce9c-48ad-814b-dcd6081f15db';
  v_org_id UUID := 'b0000000-0000-0000-0000-000000000002';
  v_has_org_col BOOLEAN;

  -- Stages ativos do novo modelo
  v_s_novo_lead UUID                := '6acb35af-d1a2-48e7-bc48-133907ae9554';
  v_s_conectado UUID                := 'b730c3e8-9915-47af-ab7e-00569c6f3d7a';
  v_s_reuniao_agendada UUID         := 'ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1';
  v_s_apresentacao_feita UUID       := 'ef9233fa-9c72-4c54-8995-c02061c4be9f';
  v_s_proposta UUID                 := '016713b1-c7bd-4ad1-bff8-14eff019de5d';
  v_s_negociacao UUID               := '0adf51b3-1d33-45bd-9bc9-484d2568b5f2';
  v_s_contrato_assinado UUID        := 'f7d81a35-b953-4b3c-8d56-69cc8f937d6a';
  v_s_boas_vindas UUID              := 'ada5a419-1a98-4deb-9098-808507a3415e';
  v_s_concepcao UUID                := 'cf4dc8a2-d9f5-4c8e-8ec1-8b650502026c';
  v_s_fornecedores UUID             := '0f543791-92a6-4f34-b55e-785b854061f0';
  v_s_convidados_logistica UUID     := 'b2c94cad-0ff9-4797-92cf-f6c48e9bc458';
  v_s_pre_evento UUID               := 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
  v_s_casamento_realizado UUID      := 'd8244643-ba68-44a5-b34c-538433eb0e10';
  v_s_pos_casamento UUID            := '4324a8c5-bb01-4d41-991e-4d2d39155338';

  -- Stage ids de Pos-venda (pra bulk-insert dos ww_plan_*)
  v_pos_stages UUID[] := ARRAY[
    'ada5a419-1a98-4deb-9098-808507a3415e'::UUID,
    'cf4dc8a2-d9f5-4c8e-8ec1-8b650502026c'::UUID,
    '0f543791-92a6-4f34-b55e-785b854061f0'::UUID,
    'b2c94cad-0ff9-4797-92cf-f6c48e9bc458'::UUID,
    'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'::UUID,
    'd8244643-ba68-44a5-b34c-538433eb0e10'::UUID,
    '4324a8c5-bb01-4d41-991e-4d2d39155338'::UUID
  ];

  -- Campos novos ww_plan_* do planejamento
  v_plan_fields TEXT[] := ARRAY[
    'ww_plan_conceito', 'ww_plan_paleta_cores', 'ww_plan_estilo', 'ww_plan_moodboard_link',
    'ww_plan_forn_venue_status', 'ww_plan_forn_buffet_status', 'ww_plan_forn_fotografia_status',
    'ww_plan_forn_video_status', 'ww_plan_forn_dj_status', 'ww_plan_forn_decor_status',
    'ww_plan_forn_flores_status', 'ww_plan_forn_bolo_status', 'ww_plan_forn_cerimonialista_status',
    'ww_plan_num_convidados_final', 'ww_plan_rsvp_abertura', 'ww_plan_rsvp_fechamento',
    'ww_plan_convidados_confirmados', 'ww_plan_hospedagem_link', 'ww_plan_transfer_contratado',
    'ww_plan_cronograma_link', 'ww_plan_ensaio_data', 'ww_plan_ensaio_feito',
    'ww_plan_checklist_final_ok', 'ww_plan_data_casamento_realizado',
    'ww_plan_fotos_entregues', 'ww_plan_video_entregue', 'ww_plan_nps_coletado',
    'ww_plan_nps_nota', 'ww_plan_lua_de_mel_interesse'
  ];

  v_stage UUID;
  v_field TEXT;
  v_sql TEXT;
  v_inserted INT := 0;
BEGIN

  IF NOT EXISTS (SELECT 1 FROM pipelines WHERE id = v_pipeline_id) THEN
    RAISE NOTICE 'Pipeline Weddings nao existe. Skipando.';
    RETURN;
  END IF;

  -- Detectar coluna org_id
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stage_field_config' AND column_name = 'org_id'
  ) INTO v_has_org_col;

  -- ==========================================================================
  -- 1. OBRIGATORIOS NAS TRANSICOES-CHAVE
  --    Campo obrigatorio fica no stage ATUAL (onde o card esta antes de mover).
  --    is_blocking=true bloqueia a transicao se o campo estiver vazio.
  -- ==========================================================================

  -- Conectado -> Reuniao Agendada: destino, qualificacao, data da reuniao
  UPDATE stage_field_config SET is_required=true, is_blocking=true, is_visible=true
    WHERE stage_id=v_s_conectado AND field_key IN ('ww_destino','ww_sdr_qualificado','ww_sdr_data_reuniao');

  -- Apresentacao Feita -> Proposta: confirmar que reuniao aconteceu
  UPDATE stage_field_config SET is_required=true, is_blocking=true, is_visible=true
    WHERE stage_id=v_s_apresentacao_feita AND field_key IN ('ww_closer_como_reuniao');

  -- Proposta -> Negociacao: link da proposta
  UPDATE stage_field_config SET is_required=true, is_blocking=true, is_visible=true
    WHERE stage_id=v_s_proposta AND field_key IN ('ww_closer_link_proposta');

  -- Negociacao -> Contrato Assinado: valor do contrato
  UPDATE stage_field_config SET is_required=true, is_blocking=true, is_visible=true
    WHERE stage_id=v_s_negociacao AND field_key IN ('ww_closer_valor_contrato');

  RAISE NOTICE 'Obrigatorios dos stages Closer marcados';

  -- ==========================================================================
  -- 2. SHOW_IN_HEADER: 2-3 campos mais importantes por stage ATIVO
  -- ==========================================================================

  -- Primeiro limpa show_in_header dos stages ativos (garantir estado determinado)
  UPDATE stage_field_config SET show_in_header=false
    WHERE stage_id IN (
      v_s_novo_lead, v_s_conectado, v_s_reuniao_agendada, v_s_apresentacao_feita,
      v_s_proposta, v_s_negociacao, v_s_contrato_assinado, v_s_boas_vindas,
      v_s_concepcao, v_s_fornecedores, v_s_convidados_logistica,
      v_s_casamento_realizado, v_s_pos_casamento
    );

  -- SDR: Novo Lead
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_novo_lead AND field_key IN ('ww_destino','ww_sdr_previsao_data');

  -- SDR: Conectado
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_conectado AND field_key IN ('ww_destino','ww_sdr_orcamento','ww_num_convidados');

  -- Closer: Reuniao Agendada
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_reuniao_agendada AND field_key IN ('ww_sdr_data_reuniao','ww_destino','ww_sdr_orcamento');

  -- Closer: Apresentacao Feita
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_apresentacao_feita AND field_key IN ('ww_closer_como_reuniao','ww_destino');

  -- Closer: Proposta
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_proposta AND field_key IN ('ww_closer_link_proposta','ww_closer_valor_contrato');

  -- Closer: Negociacao
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_negociacao AND field_key IN ('ww_closer_valor_contrato','ww_destino');

  -- Closer: Contrato Assinado
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_contrato_assinado AND field_key IN ('ww_closer_valor_contrato','ww_closer_data_ganho');

  -- Pos-venda: Boas-vindas
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_boas_vindas AND field_key IN ('ww_data_casamento','ww_destino');

  RAISE NOTICE 'show_in_header configurado para stages ativos';

  -- ==========================================================================
  -- 3. INSERIR CAMPOS ww_plan_* NOS STAGES DE POS-VENDA
  --    (todos visible=true, sem is_required — obrigatorios vem depois)
  -- ==========================================================================

  FOREACH v_stage IN ARRAY v_pos_stages
  LOOP
    FOREACH v_field IN ARRAY v_plan_fields
    LOOP
      IF v_has_org_col THEN
        v_sql := format(
          'INSERT INTO stage_field_config (stage_id, field_key, is_visible, is_required, show_in_header, org_id)
           VALUES (%L, %L, true, false, false, %L)
           ON CONFLICT (stage_id, field_key) DO UPDATE SET is_visible=true',
          v_stage, v_field, v_org_id
        );
      ELSE
        v_sql := format(
          'INSERT INTO stage_field_config (stage_id, field_key, is_visible, is_required, show_in_header)
           VALUES (%L, %L, true, false, false)
           ON CONFLICT (stage_id, field_key) DO UPDATE SET is_visible=true',
          v_stage, v_field
        );
      END IF;

      BEGIN
        EXECUTE v_sql;
        v_inserted := v_inserted + 1;
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Falha ao inserir % em %: %', v_field, v_stage, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  -- ==========================================================================
  -- 4. OBRIGATORIOS + HEADERS DOS STAGES DE POS-VENDA (apos insert)
  -- ==========================================================================

  -- Concepcao -> Fornecedores: conceito + estilo
  UPDATE stage_field_config SET is_required=true, is_blocking=true, is_visible=true
    WHERE stage_id=v_s_concepcao AND field_key IN ('ww_plan_conceito','ww_plan_estilo');

  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_concepcao AND field_key IN ('ww_plan_estilo','ww_data_casamento');

  -- Fornecedores em Contratacao: headers
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_fornecedores AND field_key IN ('ww_plan_forn_venue_status','ww_data_casamento');

  -- Convidados e Logistica -> Pre-evento: num convidados + hospedagem
  UPDATE stage_field_config SET is_required=true, is_blocking=true, is_visible=true
    WHERE stage_id=v_s_convidados_logistica AND field_key IN ('ww_plan_num_convidados_final');

  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_convidados_logistica AND field_key IN ('ww_plan_num_convidados_final','ww_plan_rsvp_fechamento');

  -- Pre-evento: headers (sem obrigatorio duro nesta onda)
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_pre_evento AND field_key IN ('ww_plan_cronograma_link','ww_plan_ensaio_data');

  -- Casamento Realizado: headers
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_casamento_realizado AND field_key IN ('ww_plan_data_casamento_realizado','ww_plan_nps_nota');

  -- Pos-casamento: headers
  UPDATE stage_field_config SET show_in_header=true, is_visible=true
    WHERE stage_id=v_s_pos_casamento AND field_key IN ('ww_plan_nps_nota','ww_plan_lua_de_mel_interesse');

  RAISE NOTICE 'Wedding stage configs concluido. Campos ww_plan_* processados: %. Headers e obrigatorios ajustados para 13 stages ativos.', v_inserted;
END $$;
