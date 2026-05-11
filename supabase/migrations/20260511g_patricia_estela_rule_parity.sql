-- 20260511g_patricia_estela_rule_parity.sql
--
-- Sincroniza regras de comportamento (ações, perguntas, falas) da Estela para a Patricia,
-- preservando a estrutura v2 (engine=single_agent_v2). Não toca em:
--   - engine, system_prompt, system_prompt_version
--   - sondagem.anchor_text (Patricia tem versão v2 ampliada com regra de quando perguntar slots opcionais)
--   - desfecho_qualificado (Patricia usa anchor_text+faithful; Estela usa must_cover+free — ambos expressam a mesma intenção)
--   - silent_signals (Patricia tem superset: 3 sinais, Estela tem 1)
--
-- Gaps corrigidos (paridade Estela → Patricia):
--   1. voice_config.rules — Patricia tinha null, recebe 3 regras explícitas da Estela
--   2. boundaries_config.custom_by_category.Comunicação — adiciona 2 regras custom da Estela
--      (nada de bajulação + nada de bajular resposta factual)
--   3. ai_agent_moments.sondagem.discovery_config.slots — alinha questões dos 6 slots
--      ao texto da Estela (que respeita never_price e never sugerir cidade específica)
--   4. ai_agent_scoring_rules — corrige pesos de destino_pref_3_3 (20→15) e destino_pref_4_4 (15→10)
--
-- Patricia continua ativa em prod com whitelist nos números de teste (Vitor + 1 outro).

BEGIN;

-- ============================================================================
-- 1. voice_config.rules — adicionar 3 regras explícitas da Estela
-- ============================================================================
UPDATE ai_agents
SET voice_config = voice_config || jsonb_build_object(
  'rules', jsonb_build_array(
    'Não usa emoji na primeira mensagem. Depois de rapport, máximo 1 emoji por mensagem.',
    'Diz "a gente" em vez de "nós".',
    'Trata casal/grupo como "vocês" (sem separar em "você e seu parceiro").'
  )
),
updated_at = NOW()
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'::uuid;

-- ============================================================================
-- 2. boundaries_config.custom_by_category — adicionar 2 regras à Comunicação
-- ============================================================================
UPDATE ai_agents
SET boundaries_config = jsonb_set(
  boundaries_config,
  '{custom_by_category,Comunicação}',
  COALESCE(boundaries_config->'custom_by_category'->'Comunicação', '[]'::jsonb) || jsonb_build_array(
    'Não ficar "bajulando" ou "puxando o saco" do cliente sempre com o que ele fala.',
    'Não bajular resposta factual. Quando o lead responde uma pergunta direta (data, destino, número de convidados, orçamento), vai pra próxima pergunta com naturalidade. Sem "Bom saber que...", "Que bom saber que...", "Boa, então X já está definido", "Legal, vocês querem Y" antes.'
  ),
  true
),
updated_at = NOW()
WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'::uuid;

-- ============================================================================
-- 3. ai_agent_moments.sondagem.discovery_config.slots — alinhar questões da Estela
--    Preserva crm_field_key e estrutura v2; só sobrescreve as questions/must_collect/reject_if
-- ============================================================================
UPDATE ai_agent_moments
SET discovery_config = jsonb_build_object(
  'slots', jsonb_build_array(
    jsonb_build_object(
      'key', 'data',
      'icon', '📅',
      'label', 'Data do casamento - Mês e Ano',
      'required', true,
      'questions', '[]'::jsonb,
      'reject_if', jsonb_build_array(
        jsonb_build_object('hint', 'peça mês específico', 'pattern', 'no fim do ano'),
        jsonb_build_object('hint', 'peça mês específico', 'pattern', 'ano que vem')
      ),
      'must_collect', jsonb_build_array('mês', 'ano'),
      'crm_field_key', 'ww_data_casamento',
      'coverage_notes', 'Se o casal já sabe o mês e ano do casamento'
    ),
    jsonb_build_object(
      'key', 'destino',
      'icon', '🌍',
      'label', 'Destino - Cidade ou Local',
      'required', true,
      'questions', jsonb_build_array(
        'E sobre o destino, já têm uma região ou país em mente?'
      ),
      'crm_field_key', 'ww_destino'
    ),
    jsonb_build_object(
      'key', 'convidados',
      'icon', '👥',
      'label', 'Número de convidados (que realmente vão)',
      'required', true,
      'questions', jsonb_build_array(
        'Dos convidados, quantos vocês acreditam que realmente vão? Destination wedding costuma ter taxa de presença diferente de casamento na cidade.'
      ),
      'crm_field_key', 'ww_num_convidados'
    ),
    jsonb_build_object(
      'key', 'investimento',
      'icon', '💰',
      'label', 'Investimento ideal e máximo que pensam investir',
      'required', true,
      'questions', jsonb_build_array(
        'Sobre o investimento: Qual é o valor que vocês desejam investir e o máximo que podem chegar? Muitas pessoas acham que quanto mais alto falarem, mais caro fica, mas, na verdade, a nossa assessoria não muda de valor por quanto vocês investem. A ideia aqui é encaixar o sonho de vocês no valor que vocês possuem.'
      ),
      'crm_field_key', 'ww_orcamento_faixa'
    ),
    jsonb_build_object(
      'key', 'info_3d8u',
      'icon', 'V',
      'label', 'Viagens Internacionais no último ano',
      'required', false,
      'questions', '[]'::jsonb,
      'must_collect', jsonb_build_array(
        'Saber se viajou internacionalmente, para fora da América do Sul no último ano.'
      ),
      'crm_field_key', 'ww_sdr_perfil_viagem_internacional'
    ),
    jsonb_build_object(
      'key', 'info_779o',
      'icon', 'F',
      'label', 'Familia ajuda financeiramente no casamento',
      'required', false,
      'questions', jsonb_build_array(
        'E sobre o investimento, é algo que vocês irão fazer por conta própria ou tem apoio da familia?'
      ),
      'must_collect', jsonb_build_array(
        'Saber se a família vai ajudar financeiramente no casamento.'
      ),
      'crm_field_key', 'ww_sdr_ajuda_familia'
    )
  )
),
updated_at = NOW()
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'::uuid
  AND moment_key = 'sondagem';

-- ============================================================================
-- 4. ai_agent_scoring_rules — alinhar pesos de destino_pref_3_3 e destino_pref_4_4
-- ============================================================================
UPDATE ai_agent_scoring_rules
SET weight = 15, updated_at = NOW()
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'::uuid
  AND dimension = 'destino_pref_3_3'
  AND rule_type = 'qualify'
  AND weight = 20;

UPDATE ai_agent_scoring_rules
SET weight = 10, updated_at = NOW()
WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'::uuid
  AND dimension = 'destino_pref_4_4'
  AND rule_type = 'qualify'
  AND weight = 15;

-- ============================================================================
-- Verificações sanity (rodar e abortar se algo inesperado)
-- ============================================================================
DO $$
DECLARE
  v_voice_rules INT;
  v_communication_count INT;
  v_sondagem_slots INT;
  v_score_3 INT;
  v_score_4 INT;
BEGIN
  SELECT jsonb_array_length(voice_config->'rules')
    INTO v_voice_rules
    FROM ai_agents WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'::uuid;

  SELECT jsonb_array_length(boundaries_config->'custom_by_category'->'Comunicação')
    INTO v_communication_count
    FROM ai_agents WHERE id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'::uuid;

  SELECT jsonb_array_length(discovery_config->'slots')
    INTO v_sondagem_slots
    FROM ai_agent_moments
    WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'::uuid
      AND moment_key = 'sondagem';

  SELECT weight INTO v_score_3 FROM ai_agent_scoring_rules
    WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'::uuid
      AND dimension = 'destino_pref_3_3' AND rule_type = 'qualify';

  SELECT weight INTO v_score_4 FROM ai_agent_scoring_rules
    WHERE agent_id = '4d96d9b4-e909-4441-bd85-d3f807cccfa7'::uuid
      AND dimension = 'destino_pref_4_4' AND rule_type = 'qualify';

  RAISE NOTICE 'Patricia parity check: voice.rules=%, communication=%, sondagem_slots=%, score_3=%, score_4=%',
    v_voice_rules, v_communication_count, v_sondagem_slots, v_score_3, v_score_4;

  IF v_voice_rules <> 3 THEN RAISE EXCEPTION 'voice_config.rules deveria ter 3 itens, tem %', v_voice_rules; END IF;
  IF v_communication_count < 2 THEN RAISE EXCEPTION 'custom_by_category.Comunicação deveria ter ≥ 2 itens, tem %', v_communication_count; END IF;
  IF v_sondagem_slots <> 6 THEN RAISE EXCEPTION 'sondagem.slots deveria ter 6 itens, tem %', v_sondagem_slots; END IF;
  IF v_score_3 <> 15 THEN RAISE EXCEPTION 'destino_pref_3_3 deveria ter weight 15, tem %', v_score_3; END IF;
  IF v_score_4 <> 10 THEN RAISE EXCEPTION 'destino_pref_4_4 deveria ter weight 10, tem %', v_score_4; END IF;
END $$;

COMMIT;
