-- Migration: CPF Normalization + Novas Colunas para Import
-- Contexto: Preparar tabela contatos para importação em massa de 45k+ registros
--           com deduplicação por CPF/CNPJ

-- 1. Função normalize_cpf (aceita CPF=11 e CNPJ=14 dígitos)
CREATE OR REPLACE FUNCTION normalize_cpf(cpf_input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_normalized text;
BEGIN
    IF cpf_input IS NULL OR cpf_input = '' THEN
        RETURN NULL;
    END IF;
    -- Remove tudo que não é dígito
    v_normalized := regexp_replace(cpf_input, '\D', '', 'g');
    -- Aceita CPF (11 dígitos) e CNPJ (14 dígitos)
    IF length(v_normalized) NOT IN (11, 14) THEN
        RETURN NULL;
    END IF;
    RETURN v_normalized;
END;
$$;

-- 2. Novas colunas
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS rg text;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS passaporte_validade date;

-- 3. Limpar formatação de CPFs existentes (pontos, hífens)
UPDATE contatos
SET cpf = regexp_replace(cpf, '\D', '', 'g')
WHERE cpf IS NOT NULL AND cpf ~ '\D';

-- 4. Coluna gerada cpf_normalizado (auto-calculada)
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS cpf_normalizado text
    GENERATED ALWAYS AS (normalize_cpf(cpf)) STORED;

-- 5. Index para busca rápida por cpf_normalizado
CREATE INDEX IF NOT EXISTS idx_contatos_cpf_normalizado
ON contatos(cpf_normalizado) WHERE cpf_normalizado IS NOT NULL;

-- NOTA: O unique index será criado APÓS verificação manual de duplicados.
-- Executar ANTES:
--   SELECT normalize_cpf(cpf) as cpf_norm, count(*),
--          array_agg(id) as ids, array_agg(nome) as nomes
--   FROM contatos
--   WHERE cpf IS NOT NULL AND normalize_cpf(cpf) IS NOT NULL
--   GROUP BY normalize_cpf(cpf)
--   HAVING count(*) > 1;
--
-- Se zero duplicados, executar:
--   CREATE UNIQUE INDEX idx_contatos_cpf_normalizado_unique
--   ON contatos(cpf_normalizado) WHERE cpf_normalizado IS NOT NULL;
