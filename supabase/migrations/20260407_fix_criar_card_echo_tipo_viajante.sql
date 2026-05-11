-- Fix: criar_card_de_conversa_echo usava 'adulto' em cards_contatos.tipo_viajante,
-- mas o enum tipo_viajante_enum só aceita 'titular' | 'acompanhante'.
-- O contato principal deve ser 'titular'.

CREATE OR REPLACE FUNCTION public.criar_card_de_conversa_echo(
    p_conversation_id TEXT,
    p_name            TEXT,
    p_phone           TEXT,
    p_phone_number_id TEXT DEFAULT NULL,
    p_phone_number_label TEXT DEFAULT NULL,
    p_agent_email     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id          UUID := requesting_org_id();
    v_linha           RECORD;
    v_produto         TEXT;
    v_pipeline_id     UUID;
    v_stage_id        UUID;
    v_owner_id        UUID;
    v_contact_id      UUID;
    v_contact_created BOOLEAN := FALSE;
    v_existing_card   RECORD;
    v_new_card_id     UUID;
    v_titulo          TEXT;
    v_name_parts      TEXT[];
    v_nome            TEXT;
    v_sobrenome       TEXT;
BEGIN
    IF p_conversation_id IS NULL OR p_conversation_id = '' THEN
        RAISE EXCEPTION 'conversation_id obrigatório' USING ERRCODE = '22023';
    END IF;
    IF p_name IS NULL OR p_name = '' THEN
        RAISE EXCEPTION 'name obrigatório' USING ERRCODE = '22023';
    END IF;
    IF p_phone IS NULL OR p_phone = '' THEN
        RAISE EXCEPTION 'phone obrigatório' USING ERRCODE = '22023';
    END IF;

    SELECT produto, pipeline_id, stage_id, criar_card, criar_contato,
           phone_number_label, default_owner_id
      INTO v_linha
      FROM whatsapp_linha_config
     WHERE (p_phone_number_id IS NOT NULL AND phone_number_id = p_phone_number_id)
        OR (p_phone_number_label IS NOT NULL AND phone_number_label = p_phone_number_label)
     ORDER BY (phone_number_id = p_phone_number_id) DESC NULLS LAST
     LIMIT 1;

    IF v_linha.criar_card = FALSE THEN
        RAISE EXCEPTION 'Criação de card desabilitada para a linha "%"', v_linha.phone_number_label
            USING ERRCODE = 'P0001';
    END IF;

    v_produto := COALESCE(v_linha.produto, 'TRIPS');
    v_pipeline_id := v_linha.pipeline_id;

    IF v_pipeline_id IS NULL THEN
        SELECT id INTO v_pipeline_id
          FROM pipelines
         WHERE produto::TEXT = v_produto
           AND org_id = v_org_id
         LIMIT 1;
    END IF;

    IF v_pipeline_id IS NULL THEN
        RAISE EXCEPTION 'Nenhum pipeline configurado para produto % (org %)', v_produto, v_org_id
            USING ERRCODE = 'P0002';
    END IF;

    v_stage_id := v_linha.stage_id;
    IF v_stage_id IS NULL THEN
        SELECT s.id INTO v_stage_id
          FROM pipeline_stages s
          LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE s.pipeline_id = v_pipeline_id
         ORDER BY COALESCE(ph.order_index, 0) ASC, s.ordem ASC
         LIMIT 1;
    END IF;

    v_owner_id := v_linha.default_owner_id;
    IF v_owner_id IS NULL AND p_agent_email IS NOT NULL AND p_agent_email <> '' THEN
        SELECT id INTO v_owner_id
          FROM profiles
         WHERE email = p_agent_email
           AND org_id = v_org_id
         LIMIT 1;
    END IF;

    v_contact_id := find_contact_by_whatsapp(p_phone, p_conversation_id);

    IF v_contact_id IS NULL THEN
        IF v_linha.criar_contato = FALSE THEN
            RAISE EXCEPTION 'Criação de contato desabilitada para a linha "%"', v_linha.phone_number_label
                USING ERRCODE = 'P0001';
        END IF;

        v_name_parts := regexp_split_to_array(trim(p_name), '\s+');
        v_nome := v_name_parts[1];
        v_sobrenome := CASE WHEN array_length(v_name_parts, 1) > 1
                            THEN array_to_string(v_name_parts[2:], ' ')
                            ELSE NULL END;

        INSERT INTO contatos (
            org_id, nome, sobrenome, telefone, tipo_pessoa, origem,
            last_whatsapp_conversation_id
        ) VALUES (
            v_org_id, v_nome, v_sobrenome, p_phone, 'adulto', 'echo',
            p_conversation_id
        )
        RETURNING id INTO v_contact_id;

        v_contact_created := TRUE;

        INSERT INTO contato_meios (org_id, contato_id, tipo, valor, is_principal, origem)
        VALUES (v_org_id, v_contact_id, 'whatsapp', p_phone, TRUE, 'echo')
        ON CONFLICT DO NOTHING;
    ELSE
        UPDATE contatos
           SET last_whatsapp_conversation_id = p_conversation_id
         WHERE id = v_contact_id
           AND last_whatsapp_conversation_id IS NULL;
    END IF;

    SELECT id, titulo INTO v_existing_card
      FROM cards
     WHERE pessoa_principal_id = v_contact_id
       AND produto::TEXT = v_produto
       AND status_comercial NOT IN ('ganho', 'perdido')
       AND deleted_at IS NULL
       AND org_id = v_org_id
     LIMIT 1;

    IF v_existing_card.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'id', v_existing_card.id,
            'titulo', v_existing_card.titulo,
            'dedup', TRUE,
            'contact_id', v_contact_id,
            'contact_created', v_contact_created
        );
    END IF;

    v_titulo := p_name;

    INSERT INTO cards (
        org_id, titulo, pessoa_principal_id, pipeline_id, pipeline_stage_id,
        produto, origem, dono_atual_id, sdr_owner_id, status_comercial, moeda
    ) VALUES (
        v_org_id, v_titulo, v_contact_id, v_pipeline_id, v_stage_id,
        v_produto::app_product, 'whatsapp', v_owner_id, v_owner_id, 'aberto', 'BRL'
    )
    RETURNING id INTO v_new_card_id;

    -- FIX: enum tipo_viajante_enum aceita apenas 'titular' | 'acompanhante'
    INSERT INTO cards_contatos (org_id, card_id, contato_id, tipo_viajante, ordem)
    VALUES (v_org_id, v_new_card_id, v_contact_id, 'titular', 0);

    RETURN jsonb_build_object(
        'id', v_new_card_id,
        'titulo', v_titulo,
        'dedup', FALSE,
        'contact_id', v_contact_id,
        'contact_created', v_contact_created
    );
END;
$$;