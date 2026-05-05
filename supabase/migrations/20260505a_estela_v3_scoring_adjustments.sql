-- ============================================================================
-- MIGRATION: Estela V3 (sandbox) — ajustes finais de scoring
-- Date: 2026-05-05
--
-- 1. Adiciona coluna exclusion_group em ai_agent_scoring_rules.
--    Permite ao admin agrupar regras mutuamente exclusivas explicitamente.
--    Garantia: dentro de um mesmo exclusion_group, só UMA regra pontua.
--    Compat: continua valendo a convenção _N_N do subjective_evaluator
--    (fallback quando exclusion_group é NULL).
--
-- 2. Pesos da Estela V3 (agente 43180319-650c-490a-87be-f275550285f8):
--    - valor_convidado_3000_3500: 15 → 20 (corrige plateau com 2500_3000)
--    - planejamento_avancado: 3 → 5
--
-- 3. Troca regra disqualify de orçamento de 'equals' → 'ai_subjective'.
--    O Data Agent grava texto livre ('80k', 'até 100k', 'ideal 100k;
--    máximo 150k', '100000', etc), nunca o enum exato 'Até R$ 50 mil'
--    que a regra equals esperava — disqualify nunca disparava.
--
-- 4. Marca exclusion_group:
--    - 5 destinos → 'destino'
--    - 6 faixas valor_convidado → 'valor_convidado'
--
-- 5. Atualiza anchor_text do moment sondagem com lógica condicional pra
--    viagem internacional/família ajuda (sondar quando casal está em
--    fronteira de qualificação, não sempre).
--
-- Escopo: apenas Estela V3 sandbox (ativa=false). Não afeta Estela V2
-- (Playbook) que está em produção, nem Luna.
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Coluna exclusion_group (genérica — afeta TODOS os agentes)
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE ai_agent_scoring_rules
  ADD COLUMN IF NOT EXISTS exclusion_group TEXT;

COMMENT ON COLUMN ai_agent_scoring_rules.exclusion_group IS
  'Grupo de exclusividade. Quando duas regras compartilham o mesmo exclusion_group, apenas UMA pode pontuar (a melhor match). NULL = regra independente. Lido pelo subjective_evaluator antes da convenção _N_N. Ex: 5 regras de destino com exclusion_group=''destino'' garantem que casal não soma Caribe+Maldivas.';

-- Backfill: regras com convenção _N_N viram exclusion_group explícito
-- (idempotente — só aplica em quem não tem exclusion_group ainda).
UPDATE ai_agent_scoring_rules
SET exclusion_group = regexp_replace(dimension, '_\d+_\d+$', '')
WHERE exclusion_group IS NULL
  AND dimension ~ '_\d+_\d+$';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Pesos da Estela V3
-- ──────────────────────────────────────────────────────────────────────────

UPDATE ai_agent_scoring_rules
SET weight = 20, updated_at = NOW()
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8'
  AND dimension = 'valor_convidado_3000_3500';

UPDATE ai_agent_scoring_rules
SET weight = 5, updated_at = NOW()
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8'
  AND dimension = 'planejamento_avancado';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Disqualify de orçamento: equals → ai_subjective
-- ──────────────────────────────────────────────────────────────────────────

UPDATE ai_agent_scoring_rules
SET
  dimension = 'orcamento_abaixo_piso',
  condition_type = 'ai_subjective',
  condition_value = jsonb_build_object(
    'question',
    'O casal declarou um investimento total para o casamento abaixo de R$ 50.000? Considere qualquer forma que tenham expressado: "até 50k", "uns 40 mil", "menos de 50", "30 a 50 mil", "abaixo de 50", etc. Se o casal disse uma faixa que tem o teto acima de R$ 50.000 (ex: "50 a 80 mil", "ideal 50 máximo 100"), responda NO. Se o casal não declarou valor ainda, responda NO (conservador).'
  ),
  label = 'Orçamento total abaixo de R$ 50 mil',
  updated_at = NOW()
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8'
  AND rule_type = 'disqualify'
  AND dimension = 'ww_orcamento_faixa';

-- ──────────────────────────────────────────────────────────────────────────
-- 4. exclusion_group para destinos da Estela V3
-- ──────────────────────────────────────────────────────────────────────────

UPDATE ai_agent_scoring_rules
SET exclusion_group = 'destino', updated_at = NOW()
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8'
  AND dimension IN ('destino_caribe', 'destino_maldivas', 'destino_nordeste', 'destino_mendoza', 'destino_europa');

-- (As 6 faixas valor_convidado_X_Y já foram backfilladas pelo passo 1
-- com exclusion_group='valor_convidado' via regexp.)

-- ──────────────────────────────────────────────────────────────────────────
-- 5. anchor_text do moment sondagem da Estela V3 (sondagem condicional)
-- ──────────────────────────────────────────────────────────────────────────

UPDATE ai_agent_moments
SET
  anchor_text = 'Conhecer o casal com no máximo DUAS perguntas por turno. Priorizar sempre os 4 críticos: data, destino, número de convidados (que devem comparecer de fato), investimento. Ordem livre conforme a conversa flui.

Sobre as duas perguntas opcionais (rotina de viagem e ajuda da família): NÃO perguntar sempre. Perguntar SOMENTE quando o casal estiver em fronteira de qualificação — ou seja, quando os 4 críticos já foram coletados E o score ainda está incerto pra qualificar (ex: destino fora dos top tier OU faixa de valor por convidado abaixo de R$ 2.500). Nesses casos, essas duas perguntas podem desempatar. Se o casal já demonstrou fit claro (Caribe, Maldivas, valor por convidado alto), não precisa investigar — agradeça e siga pro desfecho.',
  updated_at = NOW()
WHERE agent_id = '43180319-650c-490a-87be-f275550285f8'
  AND moment_key = 'sondagem';
