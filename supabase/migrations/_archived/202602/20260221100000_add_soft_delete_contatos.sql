-- =============================================================================
-- Soft-delete para contatos + atualizar RPC para ignorar deletados
-- =============================================================================

-- 1. Colunas de soft-delete
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE contatos ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id);

-- 2. Index parcial para buscas de deletados (Lixeira)
CREATE INDEX IF NOT EXISTS idx_contatos_deleted_at ON contatos (deleted_at) WHERE deleted_at IS NOT NULL;

-- 3. View para Lixeira
CREATE OR REPLACE VIEW view_deleted_contacts AS
SELECT
    c.id, c.nome, c.sobrenome, c.email, c.telefone, c.cpf, c.tipo_pessoa,
    c.deleted_at, c.deleted_by, d.nome AS deleted_by_nome, c.created_at
FROM contatos c
LEFT JOIN profiles d ON c.deleted_by = d.id
WHERE c.deleted_at IS NOT NULL
ORDER BY c.deleted_at DESC;

GRANT SELECT ON view_deleted_contacts TO authenticated;

-- 4. Atualizar RPC check_contact_duplicates para ignorar contatos deletados
CREATE OR REPLACE FUNCTION public.check_contact_duplicates(
    p_cpf text DEFAULT NULL,
    p_email text DEFAULT NULL,
    p_telefone text DEFAULT NULL,
    p_nome text DEFAULT NULL,
    p_sobrenome text DEFAULT NULL,
    p_exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (
    match_type text,
    match_strength text,
    contact_id uuid,
    contact_nome text,
    contact_sobrenome text,
    contact_email text,
    contact_telefone text,
    contact_cpf text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cpf_normalized text;
    v_phone_normalized text;
    v_email_lower text;
    v_full_name_lower text;
BEGIN
    v_cpf_normalized := normalize_cpf(p_cpf);
    v_phone_normalized := normalize_phone_brazil(p_telefone);

    IF p_email IS NOT NULL AND trim(p_email) != '' AND p_email LIKE '%@%' THEN
        v_email_lower := lower(trim(p_email));
    END IF;

    IF p_nome IS NOT NULL AND p_sobrenome IS NOT NULL
       AND length(trim(p_nome)) >= 2 AND length(trim(p_sobrenome)) >= 2 THEN
        v_full_name_lower := lower(trim(p_nome) || ' ' || trim(p_sobrenome));
    END IF;

    -- 1. CPF match (maior confiança)
    IF v_cpf_normalized IS NOT NULL THEN
        RETURN QUERY
        SELECT
            'cpf'::text,
            'exact'::text,
            c.id, c.nome, c.sobrenome, c.email, c.telefone, c.cpf
        FROM contatos c
        WHERE c.cpf_normalizado = v_cpf_normalized
        AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
        AND c.deleted_at IS NULL
        LIMIT 3;
    END IF;

    -- 2. Email match
    IF v_email_lower IS NOT NULL THEN
        RETURN QUERY
        SELECT
            'email'::text,
            'exact'::text,
            c.id, c.nome, c.sobrenome, c.email, c.telefone, c.cpf
        FROM contatos c
        WHERE lower(c.email) = v_email_lower
        AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
        AND c.deleted_at IS NULL
        LIMIT 3;
    END IF;

    -- 3. Telefone match (coluna normalizada do contatos)
    IF v_phone_normalized IS NOT NULL AND v_phone_normalized != '' THEN
        RETURN QUERY
        SELECT
            'telefone'::text,
            'normalized'::text,
            c.id, c.nome, c.sobrenome, c.email, c.telefone, c.cpf
        FROM contatos c
        WHERE c.telefone_normalizado = v_phone_normalized
        AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
        AND c.deleted_at IS NULL
        LIMIT 3;
    END IF;

    -- 4. Telefone match (contato_meios — suporta múltiplos telefones)
    IF v_phone_normalized IS NOT NULL AND v_phone_normalized != '' THEN
        RETURN QUERY
        SELECT DISTINCT ON (c.id)
            'telefone'::text,
            'normalized'::text,
            c.id, c.nome, c.sobrenome, c.email, c.telefone, c.cpf
        FROM contato_meios cm
        JOIN contatos c ON cm.contato_id = c.id
        WHERE cm.tipo IN ('telefone', 'whatsapp')
        AND cm.valor_normalizado = v_phone_normalized
        AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
        AND c.deleted_at IS NULL
        LIMIT 3;
    END IF;

    -- 5. Nome completo match (menor confiança, só com nome+sobrenome)
    IF v_full_name_lower IS NOT NULL THEN
        RETURN QUERY
        SELECT
            'nome'::text,
            'exact'::text,
            c.id, c.nome, c.sobrenome, c.email, c.telefone, c.cpf
        FROM contatos c
        WHERE c.sobrenome IS NOT NULL
        AND lower(c.nome || ' ' || c.sobrenome) = v_full_name_lower
        AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
        AND c.deleted_at IS NULL
        LIMIT 3;
    END IF;

    RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_contact_duplicates TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_contact_duplicates TO anon;
