-- ============================================================================
-- Wedding Funnel Correction (2026-04-22)
-- ============================================================================
-- Correcoes pos-review do Vitor:
--   1. Perdido e Ganho sao STATUS do card, nao etapa. A fase "Resolucao" nao
--      deve aparecer no Kanban. Como usePipelinePhases filtra por fases que
--      TEM stage ativo, basta desativar os stages de Resolucao (comportamento
--      espelhado do Trips onde o unico stage de Resolucao tem ativo=false).
--   2. "Casamento Realizado" nao deve ter is_pos_won=true. No Trips, nenhum
--      stage de Pos-venda tem is_pos_won=true — o ganho Pos e flag nas
--      colunas cards.ganho_pos / ganho_pos_at, nao flag de stage. Etapa fica
--      ativa (util pra gestor ver cards pos-cerimonia) mas sem marco de ganho.
--   3. Corrigir acentos nos nomes dos stages e no campo fase (foi copiado o
--      padrao sem-acento das migrations antigas, mas dados devem ter portugues
--      correto).
-- ============================================================================

DO $$
DECLARE
  v_pipeline_id UUID := 'f4611f84-ce9c-48ad-814b-dcd6081f15db';
  v_has_st_is_pos_won BOOLEAN;
  v_has_st_milestone BOOLEAN;
BEGIN

  IF NOT EXISTS (SELECT 1 FROM pipelines WHERE id = v_pipeline_id) THEN
    RAISE NOTICE 'Pipeline Weddings nao existe. Skipando.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pipeline_stages WHERE pipeline_id = v_pipeline_id LIMIT 1) THEN
    RAISE NOTICE 'Pipeline Weddings sem stages. Skipando.';
    RETURN;
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_stages' AND column_name='is_pos_won') INTO v_has_st_is_pos_won;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='pipeline_stages' AND column_name='milestone_key') INTO v_has_st_milestone;

  -- ==========================================================================
  -- 1. DESATIVAR stages de Resolucao (Perdido/Cancelado)
  --    Cards que estao la (317 hoje) ficam onde estao, com status_comercial
  --    ja preenchido (perdido). Kanban nao mostra mais a coluna Resolucao.
  -- ==========================================================================
  UPDATE pipeline_stages SET ativo = false
  WHERE id IN (
    '43b00d21-41fe-4d08-ac69-a27466d12869',  -- Perdido
    '62dd4da7-c3ec-48e6-afb3-7f76c9cec52c'   -- Cancelado
  );

  RAISE NOTICE 'Stages de Resolucao desativados (Perdido e Cancelado)';

  -- ==========================================================================
  -- 2. REMOVER is_pos_won e milestone de "Casamento Realizado"
  --    Etapa fica ativa (gestor ve cards pos-cerimonia), mas sem marcar ganho
  --    no stage — ganho e flag no card (ganho_pos).
  -- ==========================================================================
  IF v_has_st_is_pos_won THEN
    UPDATE pipeline_stages SET is_pos_won = false, is_won = false
    WHERE id = 'd8244643-ba68-44a5-b34c-538433eb0e10';
  END IF;

  IF v_has_st_milestone THEN
    UPDATE pipeline_stages SET milestone_key = NULL
    WHERE id = 'd8244643-ba68-44a5-b34c-538433eb0e10';
  END IF;

  RAISE NOTICE 'Casamento Realizado: flags de ganho removidos (ganho Pos e status do card, nao stage)';

  -- ==========================================================================
  -- 3. CORRIGIR ACENTOS nos nomes dos stages
  -- ==========================================================================
  UPDATE pipeline_stages SET nome = 'Reunião Agendada' WHERE id = 'ade09bc3-fa3d-49b8-97f0-2f780d0ebbb1';
  UPDATE pipeline_stages SET nome = 'Apresentação Feita' WHERE id = 'ef9233fa-9c72-4c54-8995-c02061c4be9f';
  UPDATE pipeline_stages SET nome = 'Negociação' WHERE id = '0adf51b3-1d33-45bd-9bc9-484d2568b5f2';
  UPDATE pipeline_stages SET nome = 'Boas-vindas e Questionário' WHERE id = 'ada5a419-1a98-4deb-9098-808507a3415e';
  UPDATE pipeline_stages SET nome = 'Concepção' WHERE id = 'cf4dc8a2-d9f5-4c8e-8ec1-8b650502026c';
  UPDATE pipeline_stages SET nome = 'Fornecedores em Contratação' WHERE id = '0f543791-92a6-4f34-b55e-785b854061f0';
  UPDATE pipeline_stages SET nome = 'Convidados e Logística' WHERE id = 'b2c94cad-0ff9-4797-92cf-f6c48e9bc458';
  UPDATE pipeline_stages SET nome = 'Pré-evento' WHERE id = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d';
  UPDATE pipeline_stages SET nome = 'Pós-casamento' WHERE id = '4324a8c5-bb01-4d41-991e-4d2d39155338';

  -- Campo redundante 'fase' (string): corrigir acentos
  UPDATE pipeline_stages SET fase = 'Pós-venda' WHERE pipeline_id = v_pipeline_id AND fase = 'Pos-venda';
  UPDATE pipeline_stages SET fase = 'Resolução' WHERE pipeline_id = v_pipeline_id AND fase = 'Resolucao';

  RAISE NOTICE 'Acentos corrigidos em 9 stages e no campo fase';

  -- ==========================================================================
  -- 4. CORRIGIR ACENTOS nos labels de system_fields novos (ww_plan_*)
  -- ==========================================================================
  UPDATE system_fields SET label = 'Fornecedor: Vídeo' WHERE key = 'ww_plan_forn_video_status';
  UPDATE system_fields SET label = 'Fornecedor: DJ / Música' WHERE key = 'ww_plan_forn_dj_status';
  UPDATE system_fields SET label = 'Fornecedor: Decoração' WHERE key = 'ww_plan_forn_decor_status';
  UPDATE system_fields SET label = 'Número de Convidados (Final)' WHERE key = 'ww_plan_num_convidados_final';
  UPDATE system_fields SET label = 'Vídeo Entregue' WHERE key = 'ww_plan_video_entregue';

  -- Options do ww_plan_estilo
  UPDATE system_fields
  SET options = '["Clássico","Rústico","Moderno","Tropical","Boho","Minimalista"]'::JSONB
  WHERE key = 'ww_plan_estilo';

  RAISE NOTICE 'Labels de system_fields corrigidos com acentos';

  RAISE NOTICE '=== CORRECAO APLICADA ===';
END $$;
