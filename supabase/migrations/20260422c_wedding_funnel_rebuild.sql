-- ============================================================================
-- Wedding Funnel Rebuild (2026-04-22)
-- ============================================================================
-- Reescreve o funil do produto WEDDING pra espelhar a operacao real:
--   SDR (2) -> Closer (5) -> Pos-venda (7) -> Resolucao (2) = 16 etapas
--
-- Decisoes travadas com o Vitor:
--   - Taxa nao vira etapa (Welcome Weddings nao cobra taxa SDR)
--   - Follow-up / Tentativa / Qualificacao Feita sao acoes, nao etapas
--   - Fase "T. Planner" vira "Closer" (linguagem de vendas)
--   - Ganho SDR = transicao Conectado -> Reuniao Agendada (primeira do Closer)
--   - Pausado nao existe, so Perdido e Cancelado na Resolucao
--   - Donos por fase: SDR / Closer / Wedding Planner (pessoas diferentes)
--
-- Estrategia: renomear/mover stages existentes in-place (preserva 829 cards),
-- desativar 4 stages que nao cabem, criar 1 stage novo (Pre-evento),
-- remapear cards dos stages desativados ANTES de desativar.
--
-- Defensivo pra staging (staging tem schema mais antigo): usa EXECUTE format()
-- com IF EXISTS pra colunas que podem nao existir (owner_label, supports_win,
-- win_action, milestone_key, is_sdr_won, is_planner_won, is_pos_won,
-- target_phase_id, tipo_responsavel).
-- ============================================================================

DO $$
DECLARE
  -- Pipeline e org
  v_pipeline_id UUID := 'f4611f84-ce9c-48ad-814b-dcd6081f15db';
  v_org_id UUID := 'b0000000-0000-0000-0000-000000000002';

  -- Phases existentes (por org)
  v_phase_sdr UUID := '545a78f5-e58b-48a7-980a-e2a2652dc755';
  v_phase_closer UUID := 'c314b65d-4271-4ac2-8b4d-0694630deb3a';
  v_phase_pos UUID := '775a7a1c-3959-4e0d-8454-1063c4fba144';
  v_phase_resolucao UUID := '315ad6c2-00d1-453f-9ac2-7045d0a0d16b';

  -- Stages existentes
  v_s_novo_lead UUID                := '6acb35af-d1a2-48e7-bc48-133907ae9554';
  v_s_tentativa_contato UUID        := '81a76623-91a9-4920-be94-84db9fedbae6';
  v_s_conectado UUID                := 'b730c3e8-9915-47af-ab7e-00569c6f3d7a';
  v_s_reuniao_agendada UUID         := 'ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1';
  v_s_qualificacao_feita UUID       := 'a6d36ab5-5653-4999-930d-a7957dc36cbd';
  v_s_taxa_paga UUID                := '94d04a32-ee59-43f1-8f81-82dce13de5e6';
  v_s_primeira_reuniao UUID         := 'ef9233fa-9c72-4c54-8995-c02061c4be9f';
  v_s_proposta_construcao UUID      := '016713b1-c7bd-4ad1-bff8-14eff019de5d';
  v_s_proposta_enviada UUID         := 'b270c71f-c586-4430-b041-a927fd479d39';
  v_s_negociacao UUID               := '0adf51b3-1d33-45bd-9bc9-484d2568b5f2';
  v_s_contrato_assinado UUID        := 'f7d81a35-b953-4b3c-8d56-69cc8f937d6a';
  v_s_boas_vindas UUID              := 'ada5a419-1a98-4deb-9098-808507a3415e';
  v_s_reuniao_planejamento UUID     := 'cf4dc8a2-d9f5-4c8e-8ec1-8b650502026c';
  v_s_definicao_casamento UUID      := '0f543791-92a6-4f34-b55e-785b854061f0';
  v_s_passagens_logistica UUID      := 'b2c94cad-0ff9-4797-92cf-f6c48e9bc458';
  v_s_casamento_concluido UUID      := 'd8244643-ba68-44a5-b34c-538433eb0e10';
  v_s_pos_casamento UUID            := '4324a8c5-bb01-4d41-991e-4d2d39155338';
  v_s_perdido UUID                  := '43b00d21-41fe-4d08-ac69-a27466d12869';
  v_s_casamento_cancelado UUID      := '62dd4da7-c3ec-48e6-afb3-7f76c9cec52c';
  v_s_pre_evento UUID               := 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';

  -- Detectores de coluna (staging vs prod)
  v_has_ph_owner_label BOOLEAN;
  v_has_ph_supports_win BOOLEAN;
  v_has_st_milestone BOOLEAN;
  v_has_st_is_sdr_won BOOLEAN;
  v_has_st_is_planner_won BOOLEAN;
  v_has_st_is_pos_won BOOLEAN;
  v_has_st_target_phase BOOLEAN;
  v_has_st_tipo_resp BOOLEAN;
  v_has_st_stage_changed_at BOOLEAN;

  -- Contadores
  v_cards_tentativa INT := 0;
  v_cards_qualif_conectado INT := 0;
  v_cards_qualif_reuniao INT := 0;
  v_cards_taxa INT := 0;
  v_cards_proposta_enviada INT := 0;
BEGIN

  -- ==========================================================================
  -- 0. GUARDA (staging descartavel pode nao ter phases/stages Weddings)
  -- ==========================================================================
  IF NOT EXISTS (SELECT 1 FROM pipelines WHERE id = v_pipeline_id) THEN
    RAISE NOTICE 'Pipeline Weddings nao existe neste ambiente. Skipando migration.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pipeline_phases WHERE id IN (v_phase_sdr, v_phase_closer, v_phase_pos, v_phase_resolucao)) THEN
    RAISE NOTICE 'Phases Weddings nao existem neste ambiente (staging descartavel?). Skipando.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE id = v_s_novo_lead AND pipeline_id = v_pipeline_id) THEN
    RAISE NOTICE 'Stages Weddings nao existem (staging descartavel?). Skipando.';
    RETURN;
  END IF;

  -- Detectar colunas presentes neste ambiente
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_phases' AND column_name='owner_label') INTO v_has_ph_owner_label;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_phases' AND column_name='supports_win') INTO v_has_ph_supports_win;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_stages' AND column_name='milestone_key') INTO v_has_st_milestone;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_stages' AND column_name='is_sdr_won') INTO v_has_st_is_sdr_won;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_stages' AND column_name='is_planner_won') INTO v_has_st_is_planner_won;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_stages' AND column_name='is_pos_won') INTO v_has_st_is_pos_won;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_stages' AND column_name='target_phase_id') INTO v_has_st_target_phase;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_stages' AND column_name='tipo_responsavel') INTO v_has_st_tipo_resp;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='cards' AND column_name='stage_changed_at') INTO v_has_st_stage_changed_at;

  RAISE NOTICE 'Colunas detectadas: owner_label=%, supports_win=%, milestone=%, is_sdr_won=%, target_phase=%, tipo_resp=%',
    v_has_ph_owner_label, v_has_ph_supports_win, v_has_st_milestone, v_has_st_is_sdr_won, v_has_st_target_phase, v_has_st_tipo_resp;

  -- ==========================================================================
  -- 1. RENOMEAR FASE T. Planner -> Closer (colunas basicas)
  -- ==========================================================================
  UPDATE pipeline_phases
  SET name = 'Closer', label = 'Closer', slug = 'closer', updated_at = NOW()
  WHERE id = v_phase_closer;

  IF v_has_ph_owner_label THEN
    EXECUTE format('UPDATE pipeline_phases SET owner_label=%L WHERE id=%L', 'Closer', v_phase_closer);
  END IF;

  IF v_has_ph_supports_win THEN
    EXECUTE format('UPDATE pipeline_phases SET supports_win=true, win_action=%L WHERE id=%L',
      'advance_to_next', v_phase_pos);
  END IF;

  RAISE NOTICE 'Fase T. Planner renomeada para Closer';

  -- ==========================================================================
  -- 2. REMAPEAR CARDS antes de desativar stages antigos
  -- ==========================================================================
  IF v_has_st_stage_changed_at THEN
    UPDATE cards SET pipeline_stage_id = v_s_conectado, stage_changed_at = NOW()
      WHERE pipeline_stage_id = v_s_tentativa_contato;
    GET DIAGNOSTICS v_cards_tentativa = ROW_COUNT;

    UPDATE cards SET pipeline_stage_id = v_s_reuniao_agendada, stage_changed_at = NOW()
      WHERE pipeline_stage_id = v_s_qualificacao_feita
        AND (produto_data->>'ww_sdr_qualificado')::BOOLEAN IS TRUE
        AND produto_data->>'ww_sdr_data_reuniao' IS NOT NULL
        AND produto_data->>'ww_sdr_data_reuniao' <> '';
    GET DIAGNOSTICS v_cards_qualif_reuniao = ROW_COUNT;

    UPDATE cards SET pipeline_stage_id = v_s_conectado, stage_changed_at = NOW()
      WHERE pipeline_stage_id = v_s_qualificacao_feita;
    GET DIAGNOSTICS v_cards_qualif_conectado = ROW_COUNT;

    UPDATE cards SET pipeline_stage_id = v_s_reuniao_agendada, stage_changed_at = NOW()
      WHERE pipeline_stage_id = v_s_taxa_paga;
    GET DIAGNOSTICS v_cards_taxa = ROW_COUNT;

    UPDATE cards SET pipeline_stage_id = v_s_proposta_construcao, stage_changed_at = NOW()
      WHERE pipeline_stage_id = v_s_proposta_enviada;
    GET DIAGNOSTICS v_cards_proposta_enviada = ROW_COUNT;
  ELSE
    UPDATE cards SET pipeline_stage_id = v_s_conectado WHERE pipeline_stage_id = v_s_tentativa_contato;
    GET DIAGNOSTICS v_cards_tentativa = ROW_COUNT;
    UPDATE cards SET pipeline_stage_id = v_s_conectado WHERE pipeline_stage_id = v_s_qualificacao_feita;
    GET DIAGNOSTICS v_cards_qualif_conectado = ROW_COUNT;
    UPDATE cards SET pipeline_stage_id = v_s_reuniao_agendada WHERE pipeline_stage_id = v_s_taxa_paga;
    GET DIAGNOSTICS v_cards_taxa = ROW_COUNT;
    UPDATE cards SET pipeline_stage_id = v_s_proposta_construcao WHERE pipeline_stage_id = v_s_proposta_enviada;
    GET DIAGNOSTICS v_cards_proposta_enviada = ROW_COUNT;
  END IF;

  RAISE NOTICE 'Cards remapeados: tentativa=%, qualif->reuniao=%, qualif->conectado=%, taxa=%, proposta_enviada=%',
    v_cards_tentativa, v_cards_qualif_reuniao, v_cards_qualif_conectado, v_cards_taxa, v_cards_proposta_enviada;

  -- ==========================================================================
  -- 3. UPDATE STAGES (colunas basicas) - nome, ordem, fase, phase_id, ativo, is_won/is_lost
  -- ==========================================================================
  -- FASE SDR
  UPDATE pipeline_stages SET nome='Novo Lead', ordem=1, fase='SDR', phase_id=v_phase_sdr, ativo=true, is_won=false, is_lost=false WHERE id=v_s_novo_lead;
  UPDATE pipeline_stages SET nome='Conectado', ordem=2, fase='SDR', phase_id=v_phase_sdr, ativo=true, is_won=false, is_lost=false WHERE id=v_s_conectado;

  -- FASE CLOSER
  UPDATE pipeline_stages SET nome='Reuniao Agendada', ordem=1, fase='Closer', phase_id=v_phase_closer, ativo=true, is_won=false, is_lost=false WHERE id=v_s_reuniao_agendada;
  UPDATE pipeline_stages SET nome='Apresentacao Feita', ordem=2, fase='Closer', phase_id=v_phase_closer, ativo=true, is_won=false, is_lost=false WHERE id=v_s_primeira_reuniao;
  UPDATE pipeline_stages SET nome='Proposta', ordem=3, fase='Closer', phase_id=v_phase_closer, ativo=true, is_won=false, is_lost=false WHERE id=v_s_proposta_construcao;
  UPDATE pipeline_stages SET nome='Negociacao', ordem=4, fase='Closer', phase_id=v_phase_closer, ativo=true, is_won=false, is_lost=false WHERE id=v_s_negociacao;
  UPDATE pipeline_stages SET nome='Contrato Assinado', ordem=5, fase='Closer', phase_id=v_phase_closer, ativo=true, is_won=true, is_lost=false WHERE id=v_s_contrato_assinado;

  -- FASE POS-VENDA
  UPDATE pipeline_stages SET nome='Boas-vindas e Questionario', ordem=1, fase='Pos-venda', phase_id=v_phase_pos, ativo=true, is_won=false, is_lost=false WHERE id=v_s_boas_vindas;
  UPDATE pipeline_stages SET nome='Concepcao', ordem=2, fase='Pos-venda', phase_id=v_phase_pos, ativo=true, is_won=false, is_lost=false WHERE id=v_s_reuniao_planejamento;
  UPDATE pipeline_stages SET nome='Fornecedores em Contratacao', ordem=3, fase='Pos-venda', phase_id=v_phase_pos, ativo=true, is_won=false, is_lost=false WHERE id=v_s_definicao_casamento;
  UPDATE pipeline_stages SET nome='Convidados e Logistica', ordem=4, fase='Pos-venda', phase_id=v_phase_pos, ativo=true, is_won=false, is_lost=false WHERE id=v_s_passagens_logistica;
  UPDATE pipeline_stages SET nome='Casamento Realizado', ordem=6, fase='Pos-venda', phase_id=v_phase_pos, ativo=true, is_won=true, is_lost=false WHERE id=v_s_casamento_concluido;
  UPDATE pipeline_stages SET nome='Pos-casamento', ordem=7, fase='Pos-venda', phase_id=v_phase_pos, ativo=true, is_won=false, is_lost=false WHERE id=v_s_pos_casamento;

  -- FASE RESOLUCAO
  UPDATE pipeline_stages SET nome='Perdido', ordem=1, fase='Resolucao', phase_id=v_phase_resolucao, ativo=true, is_won=false, is_lost=true WHERE id=v_s_perdido;
  UPDATE pipeline_stages SET nome='Cancelado', ordem=2, fase='Resolucao', phase_id=v_phase_resolucao, ativo=true, is_won=false, is_lost=true WHERE id=v_s_casamento_cancelado;

  -- STAGE NOVO: Pre-evento (INSERT defensivo: org_id so se coluna existir)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_stages' AND column_name='org_id') THEN
    EXECUTE format(
      'INSERT INTO pipeline_stages (id, nome, ordem, ativo, pipeline_id, fase, is_won, is_lost, phase_id, org_id)
       VALUES (%L, %L, 5, true, %L, %L, false, false, %L, %L)
       ON CONFLICT (id) DO UPDATE SET nome=%L, ordem=5, fase=%L, phase_id=%L, ativo=true, is_won=false, is_lost=false',
      v_s_pre_evento, 'Pre-evento', v_pipeline_id, 'Pos-venda', v_phase_pos, v_org_id,
      'Pre-evento', 'Pos-venda', v_phase_pos
    );
  ELSE
    EXECUTE format(
      'INSERT INTO pipeline_stages (id, nome, ordem, ativo, pipeline_id, fase, is_won, is_lost, phase_id)
       VALUES (%L, %L, 5, true, %L, %L, false, false, %L)
       ON CONFLICT (id) DO UPDATE SET nome=%L, ordem=5, fase=%L, phase_id=%L, ativo=true, is_won=false, is_lost=false',
      v_s_pre_evento, 'Pre-evento', v_pipeline_id, 'Pos-venda', v_phase_pos,
      'Pre-evento', 'Pos-venda', v_phase_pos
    );
  END IF;

  RAISE NOTICE 'Stages renomeados e reorderados (core)';

  -- ==========================================================================
  -- 4. UPDATES CONDICIONAIS: milestone_key, is_sdr_won, is_planner_won, is_pos_won, target_phase_id, tipo_responsavel
  -- ==========================================================================
  IF v_has_st_milestone THEN
    -- Limpar milestone_key de todos os stages primeiro
    EXECUTE format('UPDATE pipeline_stages SET milestone_key=NULL WHERE pipeline_id=%L', v_pipeline_id);
    -- Setar os 4 milestones corretos
    EXECUTE format('UPDATE pipeline_stages SET milestone_key=%L WHERE id=%L', 'ww_sdr_qualificada', v_s_reuniao_agendada);
    EXECUTE format('UPDATE pipeline_stages SET milestone_key=%L WHERE id=%L', 'ww_proposta', v_s_proposta_construcao);
    EXECUTE format('UPDATE pipeline_stages SET milestone_key=%L WHERE id=%L', 'ww_contrato_assinado', v_s_contrato_assinado);
    EXECUTE format('UPDATE pipeline_stages SET milestone_key=%L WHERE id=%L', 'ww_casamento_realizado', v_s_casamento_concluido);
  END IF;

  IF v_has_st_is_sdr_won THEN
    EXECUTE format('UPDATE pipeline_stages SET is_sdr_won=false WHERE pipeline_id=%L', v_pipeline_id);
    EXECUTE format('UPDATE pipeline_stages SET is_sdr_won=true WHERE id=%L', v_s_reuniao_agendada);
  END IF;

  IF v_has_st_is_planner_won THEN
    EXECUTE format('UPDATE pipeline_stages SET is_planner_won=false WHERE pipeline_id=%L', v_pipeline_id);
    EXECUTE format('UPDATE pipeline_stages SET is_planner_won=true WHERE id=%L', v_s_contrato_assinado);
  END IF;

  IF v_has_st_is_pos_won THEN
    EXECUTE format('UPDATE pipeline_stages SET is_pos_won=false WHERE pipeline_id=%L', v_pipeline_id);
    EXECUTE format('UPDATE pipeline_stages SET is_pos_won=true WHERE id=%L', v_s_casamento_concluido);
  END IF;

  IF v_has_st_target_phase THEN
    EXECUTE format('UPDATE pipeline_stages SET target_phase_id=NULL WHERE pipeline_id=%L', v_pipeline_id);
    EXECUTE format('UPDATE pipeline_stages SET target_phase_id=%L WHERE id=%L', v_phase_closer, v_s_reuniao_agendada);
    EXECUTE format('UPDATE pipeline_stages SET target_phase_id=%L WHERE id=%L', v_phase_pos, v_s_contrato_assinado);
  END IF;

  IF v_has_st_tipo_resp THEN
    EXECUTE format('UPDATE pipeline_stages SET tipo_responsavel=%L WHERE id IN (%L, %L)',
      'vendas', v_s_reuniao_agendada, v_s_contrato_assinado);
  END IF;

  RAISE NOTICE 'Flags avancadas e milestones aplicadas (se colunas existirem)';

  -- ==========================================================================
  -- 5. DESATIVAR STAGES ANTIGOS
  -- ==========================================================================
  UPDATE pipeline_stages SET ativo=false
  WHERE id IN (v_s_tentativa_contato, v_s_qualificacao_feita, v_s_taxa_paga, v_s_proposta_enviada);

  IF v_has_st_milestone THEN
    EXECUTE format(
      'UPDATE pipeline_stages SET milestone_key=NULL WHERE id IN (%L,%L,%L,%L)',
      v_s_tentativa_contato, v_s_qualificacao_feita, v_s_taxa_paga, v_s_proposta_enviada
    );
  END IF;

  RAISE NOTICE '4 stages antigos desativados';
  RAISE NOTICE '=== WEDDING FUNNEL REBUILD CONCLUIDO ===';
END $$;
