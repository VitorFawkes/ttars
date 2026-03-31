-- =============================================================================
-- Migration: Contact Data Quality System
-- Funções para auditoria e correção inteligente de dados cadastrais
-- =============================================================================

-- 1. smart_title_case(name TEXT) → TEXT
-- Title Case brasileiro: capitaliza palavras, preposições ficam minúsculas
-- (de, da, do, dos, das, e, em, com, por, para) exceto primeira palavra.
CREATE OR REPLACE FUNCTION public.smart_title_case(name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    words text[];
    result text[];
    i int;
    word text;
    lower_words text[] := ARRAY['de','da','do','dos','das','e','em','com','por','para'];
BEGIN
    IF name IS NULL OR trim(name) = '' THEN
        RETURN name;
    END IF;

    -- Normaliza espaços: trim + colapsa múltiplos espaços
    name := regexp_replace(trim(name), '\s+', ' ', 'g');

    words := string_to_array(name, ' ');
    result := ARRAY[]::text[];

    FOR i IN 1..array_length(words, 1) LOOP
        word := lower(words[i]);
        IF word = '' THEN CONTINUE; END IF;

        IF i = 1 THEN
            -- Primeira palavra sempre capitalizada
            result := result || (upper(left(word, 1)) || substring(word from 2));
        ELSIF word = ANY(lower_words) THEN
            result := result || word;
        ELSE
            result := result || (upper(left(word, 1)) || substring(word from 2));
        END IF;
    END LOOP;

    RETURN array_to_string(result, ' ');
END;
$$;


-- 2. sanitize_contact_names(p_nome, p_sobrenome) → TABLE(nome, sobrenome)
-- Corrige: nome=sobrenome, nome com full name sem sobrenome, aplica title case
CREATE OR REPLACE FUNCTION public.sanitize_contact_names(
    p_nome text,
    p_sobrenome text
)
RETURNS TABLE (nome text, sobrenome text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    v_nome text;
    v_sobrenome text;
    v_parts text[];
BEGIN
    v_nome := trim(COALESCE(p_nome, ''));
    v_sobrenome := trim(COALESCE(p_sobrenome, ''));

    -- Case 1: nome == sobrenome (duplicado) → split
    IF v_nome != '' AND v_sobrenome != '' AND lower(v_nome) = lower(v_sobrenome) THEN
        -- Normaliza espaços antes de split
        v_nome := regexp_replace(v_nome, '\s+', ' ', 'g');
        v_parts := string_to_array(v_nome, ' ');
        IF array_length(v_parts, 1) > 1 THEN
            v_nome := v_parts[1];
            v_sobrenome := array_to_string(v_parts[2:], ' ');
        ELSE
            v_sobrenome := '';
        END IF;
    END IF;

    -- Case 2: nome com full name + sobrenome vazio → split
    IF v_sobrenome = '' AND v_nome LIKE '% %' THEN
        v_nome := regexp_replace(v_nome, '\s+', ' ', 'g');
        v_parts := string_to_array(v_nome, ' ');
        v_nome := v_parts[1];
        v_sobrenome := array_to_string(v_parts[2:], ' ');
    END IF;

    -- Case 3: Aplica title case
    v_nome := smart_title_case(v_nome);
    v_sobrenome := smart_title_case(v_sobrenome);

    -- Sobrenome vazio → NULL
    IF v_sobrenome = '' THEN
        v_sobrenome := NULL;
    END IF;

    RETURN QUERY SELECT v_nome, v_sobrenome;
END;
$$;


-- 3. validate_cpf(cpf TEXT) → BOOLEAN
-- Valida CPF brasileiro pelo algoritmo de checksum (2 dígitos verificadores)
CREATE OR REPLACE FUNCTION public.validate_cpf(cpf text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
    digits text;
    d int[];
    sum1 int := 0;
    sum2 int := 0;
    check1 int;
    check2 int;
    i int;
BEGIN
    IF cpf IS NULL THEN RETURN FALSE; END IF;

    -- Extrai só dígitos
    digits := regexp_replace(cpf, '\D', '', 'g');
    IF length(digits) != 11 THEN RETURN FALSE; END IF;

    -- Rejeita sequências iguais (000.000.000-00, 111.111.111-11, etc.)
    IF digits ~ '^(\d)\1{10}$' THEN RETURN FALSE; END IF;

    -- Converte para array de inteiros
    FOR i IN 1..11 LOOP
        d[i] := substring(digits from i for 1)::int;
    END LOOP;

    -- Primeiro dígito verificador: pesos 10,9,8,...,2
    FOR i IN 1..9 LOOP
        sum1 := sum1 + d[i] * (11 - i);
    END LOOP;
    check1 := 11 - (sum1 % 11);
    IF check1 >= 10 THEN check1 := 0; END IF;
    IF d[10] != check1 THEN RETURN FALSE; END IF;

    -- Segundo dígito verificador: pesos 11,10,9,...,2
    FOR i IN 1..10 LOOP
        sum2 := sum2 + d[i] * (12 - i);
    END LOOP;
    check2 := 11 - (sum2 % 11);
    IF check2 >= 10 THEN check2 := 0; END IF;
    IF d[11] != check2 THEN RETURN FALSE; END IF;

    RETURN TRUE;
END;
$$;


-- 4. audit_contact_quality(p_issue_types, p_limit) → TABLE com issues detectados
-- Escaneia contatos ativos e retorna problemas com sugestões de correção
CREATE OR REPLACE FUNCTION public.audit_contact_quality(
    p_issue_types text[] DEFAULT NULL,
    p_limit int DEFAULT 500
)
RETURNS TABLE (
    contact_id uuid,
    contact_nome text,
    contact_sobrenome text,
    contact_email text,
    contact_cpf text,
    contact_data_nascimento date,
    issue_type text,
    issue_description text,
    confidence text,
    suggested_nome text,
    suggested_sobrenome text,
    suggested_data_nascimento date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_check_all boolean;
    v_swapped date;
    v_year_fix date;
BEGIN
    v_check_all := (p_issue_types IS NULL OR array_length(p_issue_types, 1) IS NULL);

    -- 1. nome === sobrenome (duplicado)
    IF v_check_all OR 'nome_duplicado' = ANY(p_issue_types) THEN
        RETURN QUERY
        SELECT
            c.id, c.nome, c.sobrenome, c.email, c.cpf, c.data_nascimento,
            'nome_duplicado'::text,
            'Nome e sobrenome idênticos'::text,
            'high'::text,
            (sanitize_contact_names(c.nome, c.sobrenome)).nome,
            (sanitize_contact_names(c.nome, c.sobrenome)).sobrenome,
            NULL::date
        FROM contatos c
        WHERE c.deleted_at IS NULL
        AND c.nome IS NOT NULL
        AND c.sobrenome IS NOT NULL
        AND trim(c.sobrenome) != ''
        AND lower(trim(c.nome)) = lower(trim(c.sobrenome))
        LIMIT p_limit;
    END IF;

    -- 2. Nome completo no campo nome, sobrenome vazio
    IF v_check_all OR 'nome_completo_no_nome' = ANY(p_issue_types) THEN
        RETURN QUERY
        SELECT
            c.id, c.nome, c.sobrenome, c.email, c.cpf, c.data_nascimento,
            'nome_completo_no_nome'::text,
            'Nome completo no campo nome, sobrenome vazio'::text,
            'high'::text,
            (sanitize_contact_names(c.nome, c.sobrenome)).nome,
            (sanitize_contact_names(c.nome, c.sobrenome)).sobrenome,
            NULL::date
        FROM contatos c
        WHERE c.deleted_at IS NULL
        AND c.nome IS NOT NULL
        AND (c.sobrenome IS NULL OR trim(c.sobrenome) = '')
        AND trim(c.nome) LIKE '% %'
        LIMIT p_limit;
    END IF;

    -- 3. Nome em CAIXA ALTA
    IF v_check_all OR 'nome_maiusculo' = ANY(p_issue_types) THEN
        RETURN QUERY
        SELECT
            c.id, c.nome, c.sobrenome, c.email, c.cpf, c.data_nascimento,
            'nome_maiusculo'::text,
            'Nome em caixa alta'::text,
            'high'::text,
            smart_title_case(c.nome),
            smart_title_case(c.sobrenome),
            NULL::date
        FROM contatos c
        WHERE c.deleted_at IS NULL
        AND c.nome IS NOT NULL
        AND length(trim(c.nome)) > 1
        AND (
            (c.nome = upper(c.nome) AND c.nome ~ '[A-ZÀ-Ü]{2}')
            OR (c.sobrenome IS NOT NULL AND trim(c.sobrenome) != '' AND c.sobrenome = upper(c.sobrenome) AND c.sobrenome ~ '[A-ZÀ-Ü]{2}')
        )
        -- Excluir já capturados por nome_duplicado
        AND NOT (c.sobrenome IS NOT NULL AND trim(c.sobrenome) != '' AND lower(trim(c.nome)) = lower(trim(c.sobrenome)))
        LIMIT p_limit;
    END IF;

    -- 4. Nome todo minúsculo
    IF v_check_all OR 'nome_minusculo' = ANY(p_issue_types) THEN
        RETURN QUERY
        SELECT
            c.id, c.nome, c.sobrenome, c.email, c.cpf, c.data_nascimento,
            'nome_minusculo'::text,
            'Nome todo em minúsculo'::text,
            'high'::text,
            smart_title_case(c.nome),
            smart_title_case(c.sobrenome),
            NULL::date
        FROM contatos c
        WHERE c.deleted_at IS NULL
        AND c.nome IS NOT NULL
        AND length(trim(c.nome)) > 1
        AND (
            (c.nome = lower(c.nome) AND c.nome ~ '[a-zà-ü]{2}')
            OR (c.sobrenome IS NOT NULL AND trim(c.sobrenome) != '' AND c.sobrenome = lower(c.sobrenome) AND c.sobrenome ~ '[a-zà-ü]{2}')
        )
        -- Excluir já capturados por nome_duplicado
        AND NOT (c.sobrenome IS NOT NULL AND trim(c.sobrenome) != '' AND lower(trim(c.nome)) = lower(trim(c.sobrenome)))
        LIMIT p_limit;
    END IF;

    -- 5. CPF inválido (checksum incorreto)
    IF v_check_all OR 'cpf_invalido' = ANY(p_issue_types) THEN
        RETURN QUERY
        SELECT
            c.id, c.nome, c.sobrenome, c.email, c.cpf, c.data_nascimento,
            'cpf_invalido'::text,
            'CPF com dígitos verificadores inválidos'::text,
            'high'::text,
            c.nome,
            c.sobrenome,
            NULL::date
        FROM contatos c
        WHERE c.deleted_at IS NULL
        AND c.cpf IS NOT NULL
        AND length(regexp_replace(c.cpf, '\D', '', 'g')) = 11
        AND NOT validate_cpf(c.cpf)
        LIMIT p_limit;
    END IF;

    -- 6. Data de nascimento inválida com sugestão inteligente
    -- Tenta: (a) swap DD↔MM, (b) corrigir ano futuro (2090→1990)
    IF v_check_all OR 'nascimento_invalido' = ANY(p_issue_types) THEN
        RETURN QUERY
        SELECT
            c.id, c.nome, c.sobrenome, c.email, c.cpf, c.data_nascimento,
            'nascimento_invalido'::text,
            CASE
                WHEN c.data_nascimento > CURRENT_DATE THEN 'Data no futuro: ' || to_char(c.data_nascimento, 'DD/MM/YYYY')
                WHEN age(c.data_nascimento) > interval '120 years' THEN 'Idade impossível: ' || (EXTRACT(YEAR FROM age(c.data_nascimento)))::int || ' anos'
                WHEN c.data_nascimento < '1900-01-01'::date THEN 'Data anterior a 1900: ' || to_char(c.data_nascimento, 'DD/MM/YYYY')
                ELSE 'Data suspeita'
            END::text,
            'high'::text,
            c.nome,
            c.sobrenome,
            -- Sugestão inteligente de data corrigida
            CASE
                -- Ano futuro próximo → provavelmente typo de século (2090→1990)
                WHEN EXTRACT(YEAR FROM c.data_nascimento) > EXTRACT(YEAR FROM CURRENT_DATE)
                     AND EXTRACT(YEAR FROM c.data_nascimento) <= EXTRACT(YEAR FROM CURRENT_DATE) + 100
                     AND make_date(
                         (EXTRACT(YEAR FROM c.data_nascimento) - 100)::int,
                         EXTRACT(MONTH FROM c.data_nascimento)::int,
                         EXTRACT(DAY FROM c.data_nascimento)::int
                     ) BETWEEN '1900-01-01'::date AND CURRENT_DATE
                THEN make_date(
                         (EXTRACT(YEAR FROM c.data_nascimento) - 100)::int,
                         EXTRACT(MONTH FROM c.data_nascimento)::int,
                         EXTRACT(DAY FROM c.data_nascimento)::int
                     )
                -- Swap DD↔MM se dia<=12 e resultado é data válida no passado
                WHEN EXTRACT(DAY FROM c.data_nascimento) <= 12
                     AND EXTRACT(MONTH FROM c.data_nascimento) <= 12
                     AND EXTRACT(DAY FROM c.data_nascimento) != EXTRACT(MONTH FROM c.data_nascimento)
                     AND make_date(
                         EXTRACT(YEAR FROM c.data_nascimento)::int,
                         EXTRACT(DAY FROM c.data_nascimento)::int,
                         EXTRACT(MONTH FROM c.data_nascimento)::int
                     ) BETWEEN '1900-01-01'::date AND CURRENT_DATE
                THEN make_date(
                         EXTRACT(YEAR FROM c.data_nascimento)::int,
                         EXTRACT(DAY FROM c.data_nascimento)::int,
                         EXTRACT(MONTH FROM c.data_nascimento)::int
                     )
                ELSE NULL
            END
        FROM contatos c
        WHERE c.deleted_at IS NULL
        AND c.data_nascimento IS NOT NULL
        AND (
            c.data_nascimento > CURRENT_DATE
            OR age(c.data_nascimento) > interval '120 years'
            OR c.data_nascimento < '1900-01-01'::date
        )
        LIMIT p_limit;
    END IF;

    -- 7. Sem data de nascimento (informativo)
    IF v_check_all OR 'sem_nascimento' = ANY(p_issue_types) THEN
        RETURN QUERY
        SELECT
            c.id, c.nome, c.sobrenome, c.email, c.cpf, c.data_nascimento,
            'sem_nascimento'::text,
            'Data de nascimento ausente'::text,
            'low'::text,
            c.nome,
            c.sobrenome,
            NULL::date
        FROM contatos c
        WHERE c.deleted_at IS NULL
        AND c.data_nascimento IS NULL
        LIMIT p_limit;
    END IF;

    RETURN;
END;
$$;


-- 4. apply_contact_quality_fixes(p_fixes JSONB) → fixed/errors
-- Aplica correções aprovadas em lote
CREATE OR REPLACE FUNCTION public.apply_contact_quality_fixes(
    p_fixes jsonb
)
RETURNS TABLE (
    fixed_count int,
    error_count int,
    errors text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_fix jsonb;
    v_fixed int := 0;
    v_errors text[] := ARRAY[]::text[];
    v_contact_id uuid;
BEGIN
    FOR v_fix IN SELECT jsonb_array_elements(p_fixes)
    LOOP
        BEGIN
            v_contact_id := (v_fix->>'contact_id')::uuid;

            UPDATE contatos
            SET
                nome = COALESCE(v_fix->>'nome', nome),
                sobrenome = CASE
                    WHEN v_fix ? 'sobrenome' THEN v_fix->>'sobrenome'
                    ELSE sobrenome
                END,
                data_nascimento = CASE
                    WHEN (v_fix->>'clear_data_nascimento')::boolean IS TRUE THEN NULL
                    WHEN v_fix ? 'data_nascimento' AND v_fix->>'data_nascimento' IS NOT NULL
                        THEN (v_fix->>'data_nascimento')::date
                    ELSE data_nascimento
                END,
                cpf = CASE
                    WHEN (v_fix->>'clear_cpf')::boolean IS TRUE THEN NULL
                    ELSE cpf
                END,
                updated_at = now()
            WHERE id = v_contact_id
            AND deleted_at IS NULL;

            v_fixed := v_fixed + 1;
        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors || (v_contact_id::text || ': ' || SQLERRM);
        END;
    END LOOP;

    RETURN QUERY SELECT v_fixed, COALESCE(array_length(v_errors, 1), 0), v_errors;
END;
$$;


-- Permissões
GRANT EXECUTE ON FUNCTION public.smart_title_case(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_contact_names(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_cpf(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.audit_contact_quality(text[], int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_contact_quality_fixes(jsonb) TO authenticated;
