-- =============================================================================
-- Migration: Upsert Contacts from Import
-- RPC que recebe array de contatos e faz match + update/insert inteligente.
-- Match: CPF normalizado → email → nome completo (mesma prioridade do frontend)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.upsert_contacts_from_import(
    p_contacts jsonb,
    p_created_by uuid DEFAULT NULL,
    p_origem_detalhe text DEFAULT NULL
)
RETURNS TABLE (
    inserted_count int,
    updated_count int,
    skipped_count int,
    error_count int,
    errors text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_contact jsonb;
    v_inserted int := 0;
    v_updated int := 0;
    v_skipped int := 0;
    v_errors text[] := ARRAY[]::text[];
    v_matched_id uuid;
    v_match_type text;
    v_cpf_norm text;
    v_email text;
    v_nome text;
    v_sobrenome text;
    v_contact_id uuid;
BEGIN
    FOR v_contact IN SELECT jsonb_array_elements(p_contacts)
    LOOP
        BEGIN
            v_matched_id := NULL;
            v_match_type := NULL;

            -- Extrair campos-chave para matching
            v_nome := NULLIF(trim(v_contact->>'nome'), '');
            v_sobrenome := NULLIF(trim(COALESCE(v_contact->>'sobrenome', '')), '');
            v_email := NULLIF(trim(lower(COALESCE(v_contact->>'email', ''))), '');
            v_cpf_norm := NULL;

            -- Normalizar CPF para matching
            IF v_contact->>'cpf' IS NOT NULL AND trim(v_contact->>'cpf') != '' THEN
                v_cpf_norm := normalize_cpf(v_contact->>'cpf');
            END IF;

            -- Skip se sem nome
            IF v_nome IS NULL THEN
                v_skipped := v_skipped + 1;
                CONTINUE;
            END IF;

            -- === MATCHING (prioridade: CPF > Email > Nome) ===

            -- 1. Match por CPF normalizado
            IF v_cpf_norm IS NOT NULL THEN
                SELECT id INTO v_matched_id
                FROM contatos
                WHERE cpf_normalizado = v_cpf_norm
                  AND deleted_at IS NULL
                LIMIT 1;
                IF v_matched_id IS NOT NULL THEN
                    v_match_type := 'cpf';
                END IF;
            END IF;

            -- 2. Match por email
            IF v_matched_id IS NULL AND v_email IS NOT NULL AND v_email != '' THEN
                SELECT id INTO v_matched_id
                FROM contatos
                WHERE lower(email) = v_email
                  AND deleted_at IS NULL
                LIMIT 1;
                IF v_matched_id IS NOT NULL THEN
                    v_match_type := 'email';
                END IF;
            END IF;

            -- 3. Match por nome completo (só quando sem CPF e sem email)
            IF v_matched_id IS NULL AND v_cpf_norm IS NULL AND (v_email IS NULL OR v_email = '') AND v_sobrenome IS NOT NULL THEN
                SELECT id INTO v_matched_id
                FROM contatos
                WHERE lower(trim(nome)) = lower(v_nome)
                  AND lower(trim(COALESCE(sobrenome, ''))) = lower(COALESCE(v_sobrenome, ''))
                  AND deleted_at IS NULL
                LIMIT 1;
                IF v_matched_id IS NOT NULL THEN
                    v_match_type := 'nome';
                END IF;
            END IF;

            -- === UPDATE ou INSERT ===

            IF v_matched_id IS NOT NULL THEN
                -- UPDATE: só atualizar campos que vieram não-nulos
                UPDATE contatos SET
                    nome = COALESCE(NULLIF(v_nome, ''), nome),
                    sobrenome = CASE
                        WHEN v_sobrenome IS NOT NULL AND v_sobrenome != '' THEN v_sobrenome
                        ELSE sobrenome
                    END,
                    cpf = CASE
                        WHEN v_contact->>'cpf' IS NOT NULL AND trim(v_contact->>'cpf') != '' THEN v_contact->>'cpf'
                        ELSE cpf
                    END,
                    email = CASE
                        WHEN v_contact->>'email' IS NOT NULL AND trim(v_contact->>'email') != '' THEN lower(trim(v_contact->>'email'))
                        ELSE email
                    END,
                    telefone = CASE
                        WHEN v_contact->>'telefone' IS NOT NULL AND trim(v_contact->>'telefone') != '' THEN v_contact->>'telefone'
                        ELSE telefone
                    END,
                    data_nascimento = CASE
                        WHEN v_contact->>'data_nascimento' IS NOT NULL AND trim(v_contact->>'data_nascimento') != ''
                            THEN (v_contact->>'data_nascimento')::date
                        ELSE data_nascimento
                    END,
                    rg = CASE
                        WHEN v_contact->>'rg' IS NOT NULL AND trim(v_contact->>'rg') != '' THEN v_contact->>'rg'
                        ELSE rg
                    END,
                    sexo = CASE
                        WHEN v_contact->>'sexo' IS NOT NULL AND trim(v_contact->>'sexo') != '' THEN v_contact->>'sexo'
                        ELSE sexo
                    END,
                    tipo_cliente = CASE
                        WHEN v_contact->>'tipo_cliente' IS NOT NULL AND trim(v_contact->>'tipo_cliente') != '' THEN v_contact->>'tipo_cliente'
                        ELSE tipo_cliente
                    END,
                    passaporte = CASE
                        WHEN v_contact->>'passaporte' IS NOT NULL AND trim(v_contact->>'passaporte') != '' THEN v_contact->>'passaporte'
                        ELSE passaporte
                    END,
                    passaporte_validade = CASE
                        WHEN v_contact->>'passaporte_validade' IS NOT NULL AND trim(v_contact->>'passaporte_validade') != ''
                            THEN (v_contact->>'passaporte_validade')::date
                        ELSE passaporte_validade
                    END,
                    endereco = CASE
                        WHEN v_contact->'endereco' IS NOT NULL AND v_contact->'endereco' != 'null'::jsonb
                            THEN COALESCE(endereco, '{}'::jsonb) || (v_contact->'endereco')
                        ELSE endereco
                    END,
                    observacoes = CASE
                        WHEN v_contact->>'observacoes' IS NOT NULL AND trim(v_contact->>'observacoes') != '' THEN v_contact->>'observacoes'
                        ELSE observacoes
                    END,
                    tags = CASE
                        WHEN v_contact->'tags' IS NOT NULL AND v_contact->'tags' != 'null'::jsonb
                            THEN (
                                SELECT array_agg(DISTINCT elem)
                                FROM (
                                    SELECT unnest(COALESCE(tags, ARRAY[]::text[])) AS elem
                                    UNION
                                    SELECT jsonb_array_elements_text(v_contact->'tags') AS elem
                                ) sub
                            )
                        ELSE tags
                    END,
                    data_cadastro_original = CASE
                        WHEN v_contact->>'data_cadastro_original' IS NOT NULL AND data_cadastro_original IS NULL
                            THEN (v_contact->>'data_cadastro_original')::date
                        ELSE data_cadastro_original
                    END,
                    primeira_venda_data = CASE
                        WHEN v_contact->>'primeira_venda_data' IS NOT NULL AND trim(v_contact->>'primeira_venda_data') != ''
                            THEN (v_contact->>'primeira_venda_data')::date
                        ELSE primeira_venda_data
                    END,
                    ultima_venda_data = CASE
                        WHEN v_contact->>'ultima_venda_data' IS NOT NULL AND trim(v_contact->>'ultima_venda_data') != ''
                            THEN (v_contact->>'ultima_venda_data')::date
                        ELSE ultima_venda_data
                    END,
                    ultimo_retorno_data = CASE
                        WHEN v_contact->>'ultimo_retorno_data' IS NOT NULL AND trim(v_contact->>'ultimo_retorno_data') != ''
                            THEN (v_contact->>'ultimo_retorno_data')::date
                        ELSE ultimo_retorno_data
                    END,
                    updated_at = now()
                WHERE id = v_matched_id;

                v_contact_id := v_matched_id;
                v_updated := v_updated + 1;
            ELSE
                -- INSERT novo contato
                INSERT INTO contatos (
                    nome, sobrenome, cpf, email, telefone,
                    data_nascimento, rg, sexo, tipo_cliente,
                    passaporte, passaporte_validade,
                    endereco, observacoes, tags,
                    data_cadastro_original, primeira_venda_data,
                    ultima_venda_data, ultimo_retorno_data,
                    origem, origem_detalhe, created_by
                ) VALUES (
                    v_nome,
                    v_sobrenome,
                    NULLIF(trim(COALESCE(v_contact->>'cpf', '')), ''),
                    v_email,
                    NULLIF(trim(COALESCE(v_contact->>'telefone', '')), ''),
                    CASE WHEN v_contact->>'data_nascimento' IS NOT NULL AND trim(v_contact->>'data_nascimento') != ''
                         THEN (v_contact->>'data_nascimento')::date ELSE NULL END,
                    NULLIF(trim(COALESCE(v_contact->>'rg', '')), ''),
                    NULLIF(trim(COALESCE(v_contact->>'sexo', '')), ''),
                    NULLIF(trim(COALESCE(v_contact->>'tipo_cliente', '')), ''),
                    NULLIF(trim(COALESCE(v_contact->>'passaporte', '')), ''),
                    CASE WHEN v_contact->>'passaporte_validade' IS NOT NULL AND trim(v_contact->>'passaporte_validade') != ''
                         THEN (v_contact->>'passaporte_validade')::date ELSE NULL END,
                    CASE WHEN v_contact->'endereco' IS NOT NULL AND v_contact->'endereco' != 'null'::jsonb
                         THEN v_contact->'endereco' ELSE NULL END,
                    NULLIF(trim(COALESCE(v_contact->>'observacoes', '')), ''),
                    CASE WHEN v_contact->'tags' IS NOT NULL AND v_contact->'tags' != 'null'::jsonb
                         THEN ARRAY(SELECT jsonb_array_elements_text(v_contact->'tags'))
                         ELSE NULL END,
                    CASE WHEN v_contact->>'data_cadastro_original' IS NOT NULL AND trim(v_contact->>'data_cadastro_original') != ''
                         THEN (v_contact->>'data_cadastro_original')::date ELSE NULL END,
                    CASE WHEN v_contact->>'primeira_venda_data' IS NOT NULL AND trim(v_contact->>'primeira_venda_data') != ''
                         THEN (v_contact->>'primeira_venda_data')::date ELSE NULL END,
                    CASE WHEN v_contact->>'ultima_venda_data' IS NOT NULL AND trim(v_contact->>'ultima_venda_data') != ''
                         THEN (v_contact->>'ultima_venda_data')::date ELSE NULL END,
                    CASE WHEN v_contact->>'ultimo_retorno_data' IS NOT NULL AND trim(v_contact->>'ultimo_retorno_data') != ''
                         THEN (v_contact->>'ultimo_retorno_data')::date ELSE NULL END,
                    'importacao',
                    p_origem_detalhe,
                    p_created_by
                )
                RETURNING id INTO v_contact_id;

                v_inserted := v_inserted + 1;
            END IF;

            -- Sincronizar contato_meios (telefone + email)
            IF v_contact_id IS NOT NULL THEN
                -- Telefone
                IF v_contact->>'telefone' IS NOT NULL AND trim(v_contact->>'telefone') != '' THEN
                    INSERT INTO contato_meios (contato_id, tipo, valor, is_principal, origem)
                    VALUES (v_contact_id, 'telefone', v_contact->>'telefone', true, 'importacao')
                    ON CONFLICT (tipo, valor_normalizado) WHERE valor_normalizado IS NOT NULL
                    DO NOTHING;
                END IF;
                -- Email
                IF v_email IS NOT NULL AND v_email != '' THEN
                    INSERT INTO contato_meios (contato_id, tipo, valor, is_principal, origem)
                    VALUES (v_contact_id, 'email', v_email, true, 'importacao')
                    ON CONFLICT (tipo, valor_normalizado) WHERE valor_normalizado IS NOT NULL
                    DO NOTHING;
                END IF;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            v_errors := v_errors || (COALESCE(v_nome, '?') || ' ' || COALESCE(v_sobrenome, '') || ': ' || SQLERRM);
        END;
    END LOOP;

    RETURN QUERY SELECT v_inserted, v_updated, v_skipped, COALESCE(array_length(v_errors, 1), 0), v_errors;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_contacts_from_import(jsonb, uuid, text) TO authenticated;
