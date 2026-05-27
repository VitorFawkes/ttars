-- ============================================================================
-- Parsers de texto livre para campos do "Weddings | Questionário do casal"
--
-- Os campos DW do AC são preenchidos pelos casais em texto livre. Audit
-- de 21 valores únicos em produção (27/05/2026) identificou padrões:
--
-- CONVIDADOS:
--   Número puro:   "50", "60", "100", "0"
--   Range -:       "100-120", "50-75"
--   Range a:       "4 a 6"
--   Range /:       "70/80"
--   Aproximado:    "~50", "uns 50", "cerca de 30"
--   Min explicito: "mais de 100", "+100", "acima de 50"
--
-- ORÇAMENTO:
--   R$ explícito:  "R$ 150.000,00", "R$ 25.000"
--   Mil sufixo:    "50 mil", "160 mil", "100mil"
--   K sufixo:      "60k", "100k"
--   Milhão:        "1 milhão", "1.5 milhão"
--   Range:         "80.000 - 100.000", "80 a 100 mil"
--   Limite máx:    "No máximo R$40.000", "não mais 100k"
--   Frase narr.:   "Considerando os 20 convidados, 100 mil reais"
--   Subjetivo:     "Não sabemos", "nao sei", "depende"
--   Moeda extern.: "15.000 euros", "USD 30000"
--
-- DECISÕES (validadas com Marcelo 27/05/2026):
--   1. Range → MÉDIA (representa expectativa central)
--   2. Limite máximo → pegar o número declarado (referência)
--   3. Moeda estrangeira → faixa 'Outro' (não converte)
--   4. "0 convidados" → NULL (erro de preenchimento)
--   5. Valores absurdos (< R$ 5k em orçamento) → NULL
-- ============================================================================

-- Parser de convidados — texto livre → INT (ou NULL)
CREATE OR REPLACE FUNCTION public._ww_parse_convidados_to_int(p_raw TEXT)
RETURNS INT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v TEXT;
    m TEXT[];
    n1 NUMERIC;
    n2 NUMERIC;
    result INT;
BEGIN
    IF p_raw IS NULL OR TRIM(p_raw) = '' THEN RETURN NULL; END IF;

    -- Normalizar: lower, trim, remover acentos básicos
    v := LOWER(TRIM(p_raw));
    v := TRANSLATE(v, 'áàâãéêíóôõúç', 'aaaaeeiooouc');

    -- Texto subjetivo sem número → NULL
    IF v ~ '^(nao sei|nao sabemos|indefinido|depende|varia)$' THEN
        RETURN NULL;
    END IF;

    -- Strip aproximadores/qualificadores: ~, "cerca de", "uns", "aproximadamente", "mais de", "+", "acima de"
    v := REGEXP_REPLACE(v, '~|cerca de|uns |aproximadamente|aprox\.|mais de |acima de |\+', '', 'g');
    v := TRIM(v);

    -- Range com - ou /: "100-120", "70/80"
    IF v ~ '^\s*\d+\s*[-/]\s*\d+\s*$' THEN
        m := REGEXP_MATCH(v, '^(\d+)\s*[-/]\s*(\d+)');
        n1 := m[1]::NUMERIC;
        n2 := m[2]::NUMERIC;
        result := ROUND((n1 + n2) / 2)::INT;
    -- Range com "a" ou "até": "4 a 6", "10 ate 20"
    ELSIF v ~ '^\s*\d+\s+(a|ate)\s+\d+' THEN
        m := REGEXP_MATCH(v, '^(\d+)\s+(?:a|ate)\s+(\d+)');
        n1 := m[1]::NUMERIC;
        n2 := m[2]::NUMERIC;
        result := ROUND((n1 + n2) / 2)::INT;
    -- Número puro inteiro
    ELSIF v ~ '^\d+$' THEN
        result := v::INT;
    -- Formato AC "50.000" = number 50 (com 3 decimais)
    ELSIF v ~ '^\d+\.\d{3}$' THEN
        result := SPLIT_PART(v, '.', 1)::INT;
    -- Decimal com vírgula: "50,5" → 50
    ELSIF v ~ '^\d+,\d+$' THEN
        result := SPLIT_PART(v, ',', 1)::INT;
    -- Fallback: pegar primeiro número que aparecer
    ELSIF v ~ '\d+' THEN
        m := REGEXP_MATCH(v, '(\d+)');
        result := m[1]::INT;
    ELSE
        RETURN NULL;
    END IF;

    -- "0 convidados" = erro de preenchimento, retornar NULL
    IF result = 0 THEN RETURN NULL; END IF;

    -- Validação de sanidade: casamento real raramente > 2000 convidados
    IF result > 2000 THEN RETURN NULL; END IF;

    RETURN result;
END $$;

-- Parser de orçamento — texto livre → NUMERIC em R$ (ou NULL, ou -1 pra "Outro")
CREATE OR REPLACE FUNCTION public._ww_parse_orcamento_to_brl(p_raw TEXT)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v TEXT;
    nums NUMERIC[] := ARRAY[]::NUMERIC[];
    n NUMERIC;
    m TEXT[];
    num_str TEXT;
BEGIN
    IF p_raw IS NULL OR TRIM(p_raw) = '' THEN RETURN NULL; END IF;

    v := LOWER(TRIM(p_raw));
    v := TRANSLATE(v, 'áàâãéêíóôõúç', 'aaaaeeiooouc');

    -- Texto subjetivo → NULL
    IF v ~ 'nao sei|nao sabemos|indefinido|sem orcamento|sem ideia|depende' THEN
        RETURN NULL;
    END IF;

    -- Moeda estrangeira → -1 (código especial pra 'Outro')
    -- \y é word boundary no PostgreSQL POSIX regex (\b é backspace, não funciona)
    IF v ~ '\yeuro|\yeuros\y|\ydolar|\ydolares\y|\yusd\y|\yeur\y' THEN
        RETURN -1;
    END IF;

    -- 1. Capturar "X milhão" ou "X milhões"
    FOR m IN SELECT REGEXP_MATCHES(v, '(\d+(?:[,.]\d+)?)\s*milh', 'g') LOOP
        BEGIN
            num_str := REPLACE(m[1], ',', '.');
            nums := array_append(nums, num_str::NUMERIC * 1000000);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END LOOP;

    -- 2. Capturar "X mil" (não "milhão") — pode estar como "50mil", "50 mil"
    FOR m IN SELECT REGEXP_MATCHES(v, '(\d+(?:[,.]\d+)?)\s*mil(?!h)', 'g') LOOP
        BEGIN
            num_str := REPLACE(m[1], ',', '.');
            nums := array_append(nums, num_str::NUMERIC * 1000);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END LOOP;

    -- 3. Capturar "Xk" como abreviação de mil (\y = word boundary em PostgreSQL)
    FOR m IN SELECT REGEXP_MATCHES(v, '(\d+(?:[,.]\d+)?)\s*k(?:\y|$)', 'g') LOOP
        BEGIN
            num_str := REPLACE(m[1], ',', '.');
            nums := array_append(nums, num_str::NUMERIC * 1000);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
    END LOOP;

    -- 4. Se ainda não pegou nada, tentar capturar R$ ou números grandes
    IF array_length(nums, 1) IS NULL THEN
        -- "R$ 150.000,00" formato BR completo
        FOR m IN SELECT REGEXP_MATCHES(v, 'r?\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{4,}(?:,\d+)?)', 'g') LOOP
            num_str := m[1];
            BEGIN
                IF num_str LIKE '%.%' AND num_str LIKE '%,%' THEN
                    n := REPLACE(REPLACE(num_str, '.', ''), ',', '.')::NUMERIC;
                ELSIF num_str ~ '^\d{1,3}\.\d{3}' THEN
                    n := REPLACE(num_str, '.', '')::NUMERIC;
                ELSE
                    n := REPLACE(num_str, ',', '.')::NUMERIC;
                END IF;
                nums := array_append(nums, n);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END LOOP;

        -- Sem R$ mas números no formato BR de milhar: "150.000" ou "70000" puros
        IF array_length(nums, 1) IS NULL THEN
            FOR m IN SELECT REGEXP_MATCHES(v, '(\d{1,3}(?:\.\d{3})+|\d{4,})', 'g') LOOP
                num_str := m[1];
                BEGIN
                    IF num_str ~ '^\d{1,3}\.\d{3}' THEN
                        n := REPLACE(num_str, '.', '')::NUMERIC;
                    ELSE
                        n := num_str::NUMERIC;
                    END IF;
                    nums := array_append(nums, n);
                EXCEPTION WHEN OTHERS THEN NULL;
                END;
            END LOOP;
        END IF;
    END IF;

    -- Sem números → NULL
    IF array_length(nums, 1) IS NULL THEN RETURN NULL; END IF;

    -- Range (2+ números): usar média
    SELECT AVG(x) INTO n FROM UNNEST(nums) AS x;

    -- Validação: < R$ 5.000 é absurdo pra casamento → NULL (provável erro de unidade)
    IF n < 5000 THEN RETURN NULL; END IF;

    -- Validação: > R$ 50 milhões é absurdo → NULL (provável erro de digitação)
    IF n > 50000000 THEN RETURN NULL; END IF;

    RETURN n;
END $$;

-- Wrapper que converte o R$ em faixa canônica
CREATE OR REPLACE FUNCTION public._ww_parse_orcamento_to_faixa(p_raw TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    v NUMERIC := _ww_parse_orcamento_to_brl(p_raw);
BEGIN
    IF v IS NULL THEN RETURN NULL; END IF;
    IF v < 0 THEN RETURN 'Outro'; END IF;          -- moeda estrangeira
    IF v <  50000 THEN RETURN 'Até R$50 mil'; END IF;
    IF v <  80000 THEN RETURN 'R$50-80 mil'; END IF;
    IF v < 100000 THEN RETURN 'R$80-100 mil'; END IF;
    IF v < 200000 THEN RETURN 'R$100-200 mil'; END IF;
    IF v < 500000 THEN RETURN 'R$200-500 mil'; END IF;
    RETURN '+R$500 mil';
END $$;
