-- =============================================================================
-- Migration: Audit Contact Quality Counts
-- RPC leve que retorna apenas contagens por tipo de issue.
-- Resolve o problema de PostgREST max_rows=1000 truncando resultados.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_contact_quality_counts()
RETURNS TABLE (issue_type text, issue_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. nome_duplicado
    RETURN QUERY
    SELECT 'nome_duplicado'::text, COUNT(*)
    FROM contatos c
    WHERE c.deleted_at IS NULL
    AND c.nome IS NOT NULL
    AND c.sobrenome IS NOT NULL
    AND trim(c.sobrenome) != ''
    AND lower(trim(c.nome)) = lower(trim(c.sobrenome));

    -- 2. nome_completo_no_nome
    RETURN QUERY
    SELECT 'nome_completo_no_nome'::text, COUNT(*)
    FROM contatos c
    WHERE c.deleted_at IS NULL
    AND c.nome IS NOT NULL
    AND (c.sobrenome IS NULL OR trim(c.sobrenome) = '')
    AND trim(c.nome) LIKE '% %';

    -- 3. nome_maiusculo
    RETURN QUERY
    SELECT 'nome_maiusculo'::text, COUNT(*)
    FROM contatos c
    WHERE c.deleted_at IS NULL
    AND c.nome IS NOT NULL
    AND length(trim(c.nome)) > 1
    AND (
        (c.nome = upper(c.nome) AND c.nome ~ '[A-ZÀ-Ü]{2}')
        OR (c.sobrenome IS NOT NULL AND trim(c.sobrenome) != '' AND c.sobrenome = upper(c.sobrenome) AND c.sobrenome ~ '[A-ZÀ-Ü]{2}')
    )
    AND NOT (c.sobrenome IS NOT NULL AND trim(c.sobrenome) != '' AND lower(trim(c.nome)) = lower(trim(c.sobrenome)));

    -- 4. nome_minusculo
    RETURN QUERY
    SELECT 'nome_minusculo'::text, COUNT(*)
    FROM contatos c
    WHERE c.deleted_at IS NULL
    AND c.nome IS NOT NULL
    AND length(trim(c.nome)) > 1
    AND (
        (c.nome = lower(c.nome) AND c.nome ~ '[a-zà-ü]{2}')
        OR (c.sobrenome IS NOT NULL AND trim(c.sobrenome) != '' AND c.sobrenome = lower(c.sobrenome) AND c.sobrenome ~ '[a-zà-ü]{2}')
    )
    AND NOT (c.sobrenome IS NOT NULL AND trim(c.sobrenome) != '' AND lower(trim(c.nome)) = lower(trim(c.sobrenome)));

    -- 5. cpf_invalido
    RETURN QUERY
    SELECT 'cpf_invalido'::text, COUNT(*)
    FROM contatos c
    WHERE c.deleted_at IS NULL
    AND c.cpf IS NOT NULL
    AND length(regexp_replace(c.cpf, '\D', '', 'g')) = 11
    AND NOT validate_cpf(c.cpf);

    -- 6. nascimento_invalido
    RETURN QUERY
    SELECT 'nascimento_invalido'::text, COUNT(*)
    FROM contatos c
    WHERE c.deleted_at IS NULL
    AND c.data_nascimento IS NOT NULL
    AND (
        c.data_nascimento > CURRENT_DATE
        OR age(c.data_nascimento) > interval '120 years'
        OR c.data_nascimento < '1900-01-01'::date
    );

    -- 7. sem_nascimento
    RETURN QUERY
    SELECT 'sem_nascimento'::text, COUNT(*)
    FROM contatos c
    WHERE c.deleted_at IS NULL
    AND c.data_nascimento IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_contact_quality_counts() TO authenticated;
