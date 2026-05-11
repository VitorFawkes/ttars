-- =============================================================================
-- Fix: AI Extraction suportar smart_budget (range) e flexible_duration (range)
-- =============================================================================
-- Problema: orcamento extraía apenas número único (tipo 'total'),
-- ignorando faixas de valor ("80 a 100 mil" → só 80000).
-- Duração idem ("7 a 10 dias" → só 7).
-- Motivo não era atualizado quando diferente do existente.
-- =============================================================================

-- 1. Alterar CHECK constraint para aceitar novos tipos
ALTER TABLE ai_extraction_field_config
    DROP CONSTRAINT IF EXISTS ai_extraction_field_config_field_type_check;

ALTER TABLE ai_extraction_field_config
    ADD CONSTRAINT ai_extraction_field_config_field_type_check
    CHECK (field_type IN (
        'text', 'number', 'boolean', 'select', 'multiselect', 'array', 'currency',
        'smart_budget', 'flexible_duration'
    ));

-- 2. Atualizar orcamento: currency → smart_budget com instruções de range
UPDATE ai_extraction_field_config
SET
    field_type = 'smart_budget',
    prompt_format = 'Número para valor total único, {min, max} para faixa, ou {por_pessoa: X} para valor por pessoa. Exemplos: 50000, {min: 80000, max: 100000}, {por_pessoa: 15000}',
    prompt_examples = '50000, {min: 30000, max: 50000}, {por_pessoa: 15000}. Conversão: "50 mil" = 50000, "entre 80 e 100 mil" = {min: 80000, max: 100000}, "15 mil por pessoa" = {por_pessoa: 15000}',
    prompt_extract_when = 'Cliente menciona valor, budget ou investimento. FAIXA ("entre X e Y") → {min, max}. POR PESSOA ("X por pessoa/cabeça") → {por_pessoa: X}. Valor total único → número',
    updated_at = now()
WHERE field_key = 'orcamento';

-- 3. Atualizar duracao_viagem: number → flexible_duration com instruções de range
UPDATE ai_extraction_field_config
SET
    field_type = 'flexible_duration',
    prompt_format = 'Número para dias fixos OU objeto {min, max} para faixa. Exemplos: 10 (fixo), {min: 7, max: 10} (faixa "7 a 10 dias")',
    prompt_examples = '10, 15, {min: 7, max: 10}, {min: 12, max: 15}. Conversão: "10 dias" = 10, "7 a 10 dias" = {min: 7, max: 10}, "2 semanas" = 14',
    prompt_extract_when = 'Cliente menciona duração em dias ou semanas. Se menciona FAIXA ("de X a Y dias"), usar formato {min, max}',
    updated_at = now()
WHERE field_key = 'duracao_viagem';

-- 4. Atualizar motivo: reforçar instrução de extração
UPDATE ai_extraction_field_config
SET
    prompt_extract_when = 'Cliente menciona ocasião especial ou motivo da viagem. IMPORTANTE: se o motivo na transcrição é DIFERENTE do valor atual no CRM, ATUALIZE o campo (ex: CRM tem "Férias Familia" mas cliente disse "Lua de mel" → extraia "Lua de mel")',
    updated_at = now()
WHERE field_key = 'motivo';
