-- =============================================================================
-- Fix retroativo: sync produto_data → briefing_inicial para cards que tiveram
-- extração IA em fase Planner mas não tiveram briefing_inicial atualizado.
-- =============================================================================
-- Root cause: useAIExtractionReview.applyDecisions() salvava trip_info fields
-- apenas em produto_data para Planner, mas a UI mostra trip_info:sdr que lê
-- de briefing_inicial. Fix no frontend já aplicado (sync bidirecional).
-- Esta migration corrige o card da Laysla retroativamente.
-- =============================================================================

-- Card: Laysla / Nordeste / Maio 2026

-- Step 1: Sync trip_info fields de produto_data → briefing_inicial
UPDATE cards
SET briefing_inicial =
  COALESCE(briefing_inicial, '{}'::jsonb)
  || jsonb_build_object(
    'destinos', produto_data->'destinos',
    'cidade_origem', produto_data->'cidade_origem',
    'tipo_de_hospedagem', produto_data->'tipo_de_hospedagem'
  )
WHERE id = '44e853ce-1ad0-42fc-9c12-8eedf5c63db1'
  AND produto_data->'destinos' IS NOT NULL;

-- Step 2: Sync observacoes fields de produto_data.observacoes_criticas → briefing_inicial.observacoes
UPDATE cards
SET briefing_inicial = jsonb_set(
  briefing_inicial,
  '{observacoes}',
  COALESCE(briefing_inicial->'observacoes', '{}'::jsonb)
    || jsonb_build_object(
      'briefing', produto_data->'observacoes_criticas'->'briefing',
      'observacoes', produto_data->'observacoes_criticas'->'observacoes',
      'frequencia_viagem', produto_data->'observacoes_criticas'->'frequencia_viagem'
    )
)
WHERE id = '44e853ce-1ad0-42fc-9c12-8eedf5c63db1'
  AND produto_data->'observacoes_criticas' IS NOT NULL;

-- Step 3: Sync resumo_consultor
UPDATE cards
SET briefing_inicial = briefing_inicial || jsonb_build_object(
  'resumo_consultor', produto_data->'resumo_consultor',
  'resumo_consultor_at', produto_data->'resumo_consultor_at'
)
WHERE id = '44e853ce-1ad0-42fc-9c12-8eedf5c63db1'
  AND produto_data->'resumo_consultor' IS NOT NULL;

-- =============================================================================
-- Fix retroativo GENÉRICO: sync ALL cards que tiveram extração IA em Planner/
-- Pós-venda mas briefing_inicial ficou desatualizado.
-- Identificados: 4 cards adicionais com desync.
-- =============================================================================

-- Sync trip_info: produto_data → briefing_inicial (apenas campos que existem em pd mas não em bi)
UPDATE cards
SET briefing_inicial =
  COALESCE(briefing_inicial, '{}'::jsonb)
  || (
    SELECT jsonb_object_agg(key, value)
    FROM jsonb_each(produto_data)
    WHERE key IN ('destinos', 'cidade_origem', 'tipo_de_hospedagem', 'motivo', 'orcamento', 'duracao_viagem')
      AND value IS NOT NULL
      AND value != 'null'::jsonb
      AND (briefing_inicial->key IS NULL OR briefing_inicial->key = 'null'::jsonb)
  )
WHERE id IN (
  '1120176c-2e7b-4590-88ef-151ffba8fef9',
  '5dd6d1f8-d080-424f-a52b-0cc201d0bd36',
  'c69bac0f-4fa2-4a2e-80c8-3c2ce60d1496',
  'effcf3d4-1ab6-4caa-ac6c-6cdd1a559d48'
)
AND produto_data IS NOT NULL;

-- Sync observacoes: produto_data.observacoes_criticas or .observacoes_pos_venda → briefing_inicial.observacoes
UPDATE cards
SET briefing_inicial = jsonb_set(
  briefing_inicial,
  '{observacoes}',
  COALESCE(briefing_inicial->'observacoes', '{}'::jsonb)
  || (
    SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
    FROM jsonb_each(
      COALESCE(produto_data->'observacoes_criticas', produto_data->'observacoes_pos_venda', '{}'::jsonb)
    )
    WHERE key IN ('briefing', 'observacoes', 'frequencia_viagem', 'prioridade_viagem', 'o_que_e_importante', 'algo_especial_viagem', 'receio_ou_medo', 'usa_agencia')
      AND value IS NOT NULL
      AND value != 'null'::jsonb
      AND (
        COALESCE(briefing_inicial->'observacoes', '{}'::jsonb)->key IS NULL
        OR COALESCE(briefing_inicial->'observacoes', '{}'::jsonb)->key = 'null'::jsonb
      )
  )
)
WHERE id IN (
  '1120176c-2e7b-4590-88ef-151ffba8fef9',
  '5dd6d1f8-d080-424f-a52b-0cc201d0bd36',
  'c69bac0f-4fa2-4a2e-80c8-3c2ce60d1496',
  'effcf3d4-1ab6-4caa-ac6c-6cdd1a559d48'
)
AND produto_data IS NOT NULL;
