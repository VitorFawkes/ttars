-- ============================================================================
-- Hotfix — upsert_viajantes_from_ai_extraction quebrava por tentar setar
-- contatos.telefone_normalizado, que é uma coluna GENERATED.
--
-- Ajuste: inserir apenas telefone; o banco calcula telefone_normalizado
-- via generated expression.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_viajantes_from_ai_extraction(
    p_card_id   UUID,
    p_viajantes JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id             UUID := requesting_org_id();
    v_card_org_id        UUID;
    v_contatos_org_id    UUID := contatos_default_org_id();
    v_viajante           JSONB;
    v_nome_raw           TEXT;
    v_nome               TEXT;
    v_sobrenome          TEXT;
    v_name_parts         TEXT[];
    v_telefone_raw       TEXT;
    v_telefone_clean     TEXT;
    v_telefone_norm      TEXT;
    v_tipo_vinculo       TEXT;
    v_tipo_pessoa        TEXT;
    v_data_nasc          TEXT;
    v_contact_id         UUID;
    v_next_ordem         INTEGER;
    v_is_new             BOOLEAN;
    v_is_newly_linked    BOOLEAN;
    v_results            JSONB := '[]'::jsonb;
    v_created_count      INTEGER := 0;
    v_linked_count       INTEGER := 0;
    v_skipped_count      INTEGER := 0;
    v_conversation_id    TEXT;
BEGIN
    IF p_card_id IS NULL THEN
        RAISE EXCEPTION 'card_id é obrigatório' USING ERRCODE = '22023';
    END IF;

    SELECT org_id INTO v_card_org_id FROM cards WHERE id = p_card_id;
    IF v_card_org_id IS NULL THEN
        RAISE EXCEPTION 'Card % não encontrado', p_card_id USING ERRCODE = 'P0002';
    END IF;
    IF v_card_org_id <> v_org_id THEN
        RAISE EXCEPTION 'Card pertence a outra organização' USING ERRCODE = '42501';
    END IF;

    IF v_contatos_org_id IS NULL THEN
        v_contatos_org_id := v_org_id;
    END IF;

    SELECT ct.last_whatsapp_conversation_id INTO v_conversation_id
      FROM cards c
      JOIN contatos ct ON ct.id = c.pessoa_principal_id
     WHERE c.id = p_card_id;

    SELECT COALESCE(MAX(ordem), 0) + 1 INTO v_next_ordem
      FROM cards_contatos WHERE card_id = p_card_id;

    PERFORM set_config('app.update_source', 'ai_extraction', true);

    FOR v_viajante IN SELECT * FROM jsonb_array_elements(COALESCE(p_viajantes, '[]'::jsonb))
    LOOP
        v_nome_raw       := btrim(COALESCE(v_viajante->>'nome', ''));
        v_telefone_raw   := COALESCE(v_viajante->>'telefone', '');
        v_tipo_vinculo   := NULLIF(btrim(COALESCE(v_viajante->>'tipo_vinculo', '')), '');
        v_tipo_pessoa    := LOWER(NULLIF(btrim(COALESCE(v_viajante->>'tipo_pessoa', '')), ''));
        v_data_nasc      := NULLIF(btrim(COALESCE(v_viajante->>'data_nascimento', '')), '');

        IF v_nome_raw = '' OR is_weak_contact_name(v_nome_raw) THEN
            v_skipped_count := v_skipped_count + 1;
            v_results := v_results || jsonb_build_array(jsonb_build_object(
                'nome', v_nome_raw, 'action', 'skipped', 'reason', 'weak_name'
            ));
            CONTINUE;
        END IF;

        IF v_tipo_pessoa NOT IN ('adulto', 'crianca') THEN
            v_tipo_pessoa := CASE
                WHEN v_tipo_pessoa IN ('criança', 'filho', 'filha', 'bebê', 'bebe') THEN 'crianca'
                ELSE 'adulto'
            END;
        END IF;

        v_contact_id := NULL;
        v_is_new := FALSE;
        v_is_newly_linked := FALSE;
        v_telefone_clean := NULL;
        v_telefone_norm := NULL;

        IF v_telefone_raw <> '' THEN
            v_telefone_clean := regexp_replace(v_telefone_raw, '\D', '', 'g');
            IF length(v_telefone_clean) BETWEEN 10 AND 15 THEN
                v_telefone_norm := normalize_phone_brazil(v_telefone_clean);

                SELECT cm.contato_id INTO v_contact_id
                  FROM contato_meios cm
                 WHERE cm.org_id = v_contatos_org_id
                   AND cm.tipo IN ('whatsapp', 'telefone')
                   AND cm.valor_normalizado = v_telefone_norm
                 ORDER BY cm.is_principal DESC NULLS LAST, cm.created_at ASC
                 LIMIT 1;

                IF v_contact_id IS NULL THEN
                    SELECT id INTO v_contact_id
                      FROM contatos
                     WHERE org_id = v_contatos_org_id
                       AND telefone_normalizado = v_telefone_norm
                       AND deleted_at IS NULL
                     ORDER BY created_at ASC
                     LIMIT 1;
                END IF;
            ELSE
                v_telefone_clean := NULL;
            END IF;
        END IF;

        IF v_contact_id IS NULL THEN
            SELECT ct.id INTO v_contact_id
              FROM cards_contatos cc
              JOIN contatos ct ON ct.id = cc.contato_id
             WHERE cc.card_id = p_card_id
               AND ct.deleted_at IS NULL
               AND similarity(
                     unaccent(LOWER(COALESCE(ct.nome, '') || ' ' || COALESCE(ct.sobrenome, ''))),
                     unaccent(LOWER(v_nome_raw))
                   ) > 0.7
             ORDER BY similarity(
                   unaccent(LOWER(COALESCE(ct.nome, '') || ' ' || COALESCE(ct.sobrenome, ''))),
                   unaccent(LOWER(v_nome_raw))
                 ) DESC
             LIMIT 1;
        END IF;

        IF v_contact_id IS NULL THEN
            v_name_parts := regexp_split_to_array(v_nome_raw, '\s+');
            v_nome       := v_name_parts[1];
            v_sobrenome  := CASE WHEN array_length(v_name_parts, 1) > 1
                                 THEN array_to_string(v_name_parts[2:], ' ')
                                 ELSE NULL END;

            -- NOTA: telefone_normalizado é GENERATED — NÃO incluir no INSERT
            INSERT INTO contatos (
                org_id, nome, sobrenome, tipo_pessoa, origem, origem_detalhe,
                data_nascimento, telefone
            ) VALUES (
                v_contatos_org_id,
                v_nome,
                v_sobrenome,
                v_tipo_pessoa::tipo_pessoa_enum,
                'ai_extraction',
                'viajante_extraido_conversa',
                CASE WHEN v_data_nasc ~ '^\d{4}-\d{2}-\d{2}$' THEN v_data_nasc::DATE ELSE NULL END,
                NULLIF(v_telefone_clean, '')
            )
            RETURNING id INTO v_contact_id;

            v_is_new := TRUE;
            v_created_count := v_created_count + 1;

            IF v_telefone_clean IS NOT NULL AND v_telefone_clean <> '' THEN
                INSERT INTO contato_meios (org_id, contato_id, tipo, valor, is_principal, origem)
                VALUES (v_contatos_org_id, v_contact_id, 'whatsapp', v_telefone_clean, TRUE, 'ai_extraction')
                ON CONFLICT DO NOTHING;
            END IF;
        ELSE
            UPDATE contatos
               SET tipo_pessoa = COALESCE(tipo_pessoa, v_tipo_pessoa::tipo_pessoa_enum),
                   data_nascimento = CASE
                       WHEN data_nascimento IS NULL AND v_data_nasc ~ '^\d{4}-\d{2}-\d{2}$'
                         THEN v_data_nasc::DATE
                       ELSE data_nascimento
                   END,
                   updated_at = NOW()
             WHERE id = v_contact_id;
        END IF;

        INSERT INTO cards_contatos (
            card_id, contato_id, tipo_viajante, ordem, tipo_vinculo, org_id
        ) VALUES (
            p_card_id,
            v_contact_id,
            'acompanhante'::tipo_viajante_enum,
            v_next_ordem,
            v_tipo_vinculo,
            v_card_org_id
        )
        ON CONFLICT (card_id, contato_id) DO UPDATE
            SET tipo_vinculo = COALESCE(cards_contatos.tipo_vinculo, EXCLUDED.tipo_vinculo)
        RETURNING (xmax = 0) INTO v_is_newly_linked;

        IF v_is_newly_linked THEN
            v_next_ordem := v_next_ordem + 1;
            v_linked_count := v_linked_count + 1;
        END IF;

        v_results := v_results || jsonb_build_array(jsonb_build_object(
            'nome', v_nome_raw,
            'contact_id', v_contact_id,
            'is_new_contact', v_is_new,
            'newly_linked', v_is_newly_linked,
            'tipo_vinculo', v_tipo_vinculo,
            'tipo_pessoa', v_tipo_pessoa,
            'action', CASE
                WHEN v_is_new THEN 'created'
                WHEN v_is_newly_linked THEN 'linked_existing'
                ELSE 'already_linked'
            END
        ));
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'card_id', p_card_id,
        'created_count', v_created_count,
        'linked_count', v_linked_count,
        'skipped_count', v_skipped_count,
        'results', v_results
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_viajantes_from_ai_extraction(UUID, JSONB)
    TO authenticated;
