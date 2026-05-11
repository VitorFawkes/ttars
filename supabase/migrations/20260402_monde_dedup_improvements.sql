-- Migration: Melhorias de dedup para sync Monde V2
-- 1. Unique constraint em monde_person_id
-- 2. Extension unaccent + normalize_name()
-- 3. Atualizar check_contact_duplicates para usar unaccent
-- 4. Ajustar cron de import para cada 2h

-- 1. Unique constraint: um Monde person → no máximo um contato ativo
CREATE UNIQUE INDEX IF NOT EXISTS idx_contatos_monde_person_id_unique
  ON public.contatos(monde_person_id)
  WHERE monde_person_id IS NOT NULL AND deleted_at IS NULL;

-- 2. Extension unaccent (para normalização de nomes com acento)
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.normalize_name(name text)
RETURNS text AS $$
  SELECT unaccent(lower(trim(COALESCE($1, ''))));
$$ LANGUAGE sql IMMUTABLE;

-- 3. Atualizar check_contact_duplicates para usar unaccent no match de nome
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
    v_full_name_normalized text;
BEGIN
    v_cpf_normalized := normalize_cpf(p_cpf);
    v_phone_normalized := normalize_phone_brazil(p_telefone);

    IF p_email IS NOT NULL AND trim(p_email) != '' AND p_email LIKE '%@%' THEN
        v_email_lower := lower(trim(p_email));
    END IF;

    IF p_nome IS NOT NULL AND p_sobrenome IS NOT NULL
       AND length(trim(p_nome)) >= 2 AND length(trim(p_sobrenome)) >= 2 THEN
        v_full_name_normalized := normalize_name(trim(p_nome) || ' ' || trim(p_sobrenome));
    END IF;

    -- 1. CPF match (maior confiança)
    IF v_cpf_normalized IS NOT NULL THEN
        RETURN QUERY
        SELECT
            'cpf'::text, 'exact'::text,
            c.id, c.nome, c.sobrenome, c.email, c.telefone, c.cpf
        FROM contatos c
        WHERE c.cpf_normalizado = v_cpf_normalized
        AND c.deleted_at IS NULL
        AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
        LIMIT 3;
    END IF;

    -- 2. Email match
    IF v_email_lower IS NOT NULL THEN
        RETURN QUERY
        SELECT
            'email'::text, 'exact'::text,
            c.id, c.nome, c.sobrenome, c.email, c.telefone, c.cpf
        FROM contatos c
        WHERE lower(c.email) = v_email_lower
        AND c.deleted_at IS NULL
        AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
        LIMIT 3;
    END IF;

    -- 3. Telefone match (coluna normalizada)
    IF v_phone_normalized IS NOT NULL AND v_phone_normalized != '' THEN
        RETURN QUERY
        SELECT
            'telefone'::text, 'normalized'::text,
            c.id, c.nome, c.sobrenome, c.email, c.telefone, c.cpf
        FROM contatos c
        WHERE c.telefone_normalizado = v_phone_normalized
        AND c.deleted_at IS NULL
        AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
        LIMIT 3;
    END IF;

    -- 4. Telefone match (contato_meios — múltiplos telefones/WhatsApp)
    IF v_phone_normalized IS NOT NULL AND v_phone_normalized != '' THEN
        RETURN QUERY
        SELECT DISTINCT ON (c.id)
            'telefone_meios'::text, 'normalized'::text,
            c.id, c.nome, c.sobrenome, c.email, c.telefone, c.cpf
        FROM contato_meios cm
        JOIN contatos c ON cm.contato_id = c.id
        WHERE cm.tipo IN ('telefone', 'whatsapp')
        AND cm.valor_normalizado = v_phone_normalized
        AND c.deleted_at IS NULL
        AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
        LIMIT 3;
    END IF;

    -- 5. Nome completo match (com unaccent — "João" = "Joao")
    IF v_full_name_normalized IS NOT NULL THEN
        RETURN QUERY
        SELECT
            'nome'::text, 'fuzzy'::text,
            c.id, c.nome, c.sobrenome, c.email, c.telefone, c.cpf
        FROM contatos c
        WHERE c.sobrenome IS NOT NULL
        AND c.deleted_at IS NULL
        AND normalize_name(c.nome || ' ' || c.sobrenome) = v_full_name_normalized
        AND (p_exclude_id IS NULL OR c.id != p_exclude_id)
        LIMIT 3;
    END IF;

    RETURN;
END;
$$;

-- 4. Ajustar cron de import: de 30min para 2h
SELECT cron.unschedule('monde-people-import');
SELECT cron.schedule(
  'monde-people-import',
  '0 */2 * * *',
  $$SELECT net.http_post(
    url := 'https://szyrzxvlptqqheizyrxu.supabase.co/functions/v1/monde-people-import',
    headers := '{"Authorization": "Bearer ' || current_setting('supabase.service_role_key') || '", "Content-Type": "application/json"}'::jsonb,
    body := '{"page_limit": 100}'::jsonb
  )$$
);
