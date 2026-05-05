-- ============================================================================
-- MIGRATION: Converte regras boolean_true → ai_subjective
-- Date: 2026-05-05
--
-- O tipo boolean_true exigia um "nome de campo técnico" digitado livremente
-- (ex: 'referencia_casamento_premium'), confuso pro admin e dependente de
-- runtime preencher esse boolean. Como nenhum runtime atual preenche o input
-- com esse boolean, a regra nunca disparava.
--
-- Solução: virar ai_subjective com pergunta clara que a IA avalia da
-- conversa — mesmo padrão de todas as outras regras da Estela.
--
-- Escopo: única regra boolean_true em produção é a "Referência a casamento
-- premium" da Estela.
-- ============================================================================

UPDATE ai_agent_scoring_rules
SET
  condition_type = 'ai_subjective',
  condition_value = jsonb_build_object(
    'question',
    'O casal demonstra circulação em meio premium ou referência cultural a casamentos de alto padrão? Considere sinais como: mencionar casamentos de amigas/parentes em destinos premium (Caribe, Europa, Maldivas, Nordeste premium), citar lugares de elite que frequenta, falar de fornecedores conhecidos do mercado de alto padrão, demonstrar familiaridade com termos como destination wedding, reference de produtoras conhecidas, etc.'
  ),
  dimension = 'referencia_casamento_premium',
  label = 'Referência a casamento premium',
  updated_at = NOW()
WHERE condition_type = 'boolean_true'
  AND dimension = 'sinal_indireto'
  AND (condition_value ->> 'field') = 'referencia_casamento_premium';
