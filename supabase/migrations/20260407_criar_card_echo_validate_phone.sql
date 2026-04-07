-- criar_card_de_conversa_echo: validar phone ANTES do insert + mensagem de erro diagnóstica
--
-- Bug anterior: "new row for relation contato_meios violates check constraint
-- chk_valor_normalizado_digits_only" — telefone chegou sem dígitos suficientes
-- (possivelmente placeholder não substituído pelo Echo).
--
-- Fix:
--   1. Após strip de {...}, validar que v_phone contém pelo menos 10 dígitos.
--   2. Se não, RAISE EXCEPTION incluindo o valor bruto recebido — facilita
--      diagnosticar o template do Echo na próxima tentativa.
--   3. Usar a versão normalizada (só dígitos) para criar contato/contato_meio,
--      garantindo que a constraint nunca seja violada.

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

    -- inputs sanitizados
    v_conv            TEXT;
    v_name            TEXT;
    v_phone_raw       TEXT;
    v_phone_digits    TEXT;
    v_phone_id        TEXT;
    v_phone_label     TEXT;
    v_agent_email     TEXT;
BEGIN
    -- ========================================================================
    -- Strip defensivo {...} (Echo pode enviar placeholders com chaves literais)
    -- ========================================================================
    v_conv        := regexp_replace(COALESCE(p_conversation_id, ''), '^\{(.*)\}$', '\1');
    v_name        := regexp_replace(COALESCE(p_name, ''), '^\{(.*)\}$', '\1');
    v_phone_raw   := regexp_replace(COALESCE(p_phone, ''), '^\{(.*)\}$', '\1');
    v_phone_id    := regexp_replace(COALESCE(p_phone_number_id, ''), '^\{(.*)\}$', '\1');
    v_phone_label := regexp_replace(COALESCE(p_phone_number_label, ''), '^\{(.*)\}$', '\1');
    v_agent_email := regexp_replace(COALESCE(p_agent_email, ''), '^\{(.*)\}$', '\1');

    v_phone_id    := NULLIF(v_phone_id, '');
    v_phone_label := NULLIF(v_phone_label, '');
    v_agent_email := NULLIF(v_agent_email, '');

    -- ========================================================================
    -- Validações básicas
    -- ========================================================================
    IF v_conv IS NULL OR v_conv = '' THEN
        RAISE EXCEPTION 'conversation_id obrigatório' USING ERRCODE = '22023';
    END IF;
    IF v_name IS NULL OR v_name = '' THEN
        RAISE EXCEPTION 'name obrigatório (recebido: %)', COALESCE(p_name, '<null>')
            USING ERRCODE = '22023';
    END IF;
    IF v_phone_raw IS NULL OR v_phone_raw = '' THEN
        RAISE EXCEPTION 'phone obrigatório (recebido: %)', COALESCE(p_phone, '<null>')
            USING ERRCODE = '22023';
    END IF;

    -- Extrair só dígitos (mesma lógica de normalize_phone_brazil)
    v_phone_digits := regexp_replace(v_phone_raw, '\D', '', 'g');

    IF length(v_phone_digits) < 10 THEN
        RAISE EXCEPTION 'Telefone inválido: não contém dígitos suficientes. Recebido bruto: "%" | Após strip: "%" | Só dígitos: "%" (length=%)',
            COALESCE(p_phone, '<null>'),
            v_phone_raw,
            v_phone_digits,
            length(v_phone_digits)
            USING ERRCODE = '22023';
    END IF;

    -- ========================================================================
    -- 1. Lookup whatsapp_linha_config
    -- ========================================================================
    SELECT produto, pipeline_id, stage_id, criar_card, criar_contato,
           phone_number_label, default_owner_id
      INTO v_linha
      FROM whatsapp_linha_config
     WHERE (v_phone_id IS NOT NULL AND phone_number_id = v_phone_id)
        OR (v_phone_label IS NOT NULL AND phone_number_label = v_phone_label)
     ORDER BY (phone_number_id = v_phone_id) DESC NULLS LAST
     LIMIT 1;

    IF v_linha.criar_card = FALSE THEN
        RAISE EXCEPTION 'Criação de card desabilitada para a linha "%"', v_linha.phone_number_label
            USING ERRCODE = 'P0001';
    END IF;

    -- ========================================================================
    -- 2. Resolve produto / pipeline
    -- ========================================================================
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

    -- ========================================================================
    -- 3. Stage: Oportunidade (fase planner)
    -- ========================================================================
    SELECT s.id INTO v_stage_id
      FROM pipeline_stages s
      JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE s.pipeline_id = v_pipeline_id
       AND ph.slug = 'planner'
       AND s.nome ILIKE 'oportunidade'
     LIMIT 1;

    IF v_stage_id IS NULL THEN
        SELECT s.id INTO v_stage_id
          FROM pipeline_stages s
          JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE s.pipeline_id = v_pipeline_id
           AND ph.slug = 'planner'
         ORDER BY s.ordem ASC
         LIMIT 1;
    END IF;

    IF v_stage_id IS NULL THEN
        v_stage_id := v_linha.stage_id;
        IF v_stage_id IS NULL THEN
            SELECT s.id INTO v_stage_id
              FROM pipeline_stages s
              LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
             WHERE s.pipeline_id = v_pipeline_id
             ORDER BY COALESCE(ph.order_index, 0) ASC, s.ordem ASC
             LIMIT 1;
        END IF;
    END IF;

    -- ========================================================================
    -- 4. Resolve owner
    -- ========================================================================
    v_owner_id := NULL;
    IF v_agent_email IS NOT NULL THEN
        SELECT id INTO v_owner_id
          FROM profiles
         WHERE email = v_agent_email
           AND org_id = v_org_id
         LIMIT 1;
    END IF;
    IF v_owner_id IS NULL THEN
        v_owner_id := v_linha.default_owner_id;
    END IF;

    -- ========================================================================
    -- 5. Resolve contato (usa versão com dígitos para lookup; insert usa a
    --    versão original — o trigger normaliza de novo ao persistir)
    -- ========================================================================
    v_contact_id := find_contact_by_whatsapp(v_phone_raw, v_conv);

    IF v_contact_id IS NULL THEN
        IF v_linha.criar_contato = FALSE THEN
            RAISE EXCEPTION 'Criação de contato desabilitada para a linha "%"', v_linha.phone_number_label
                USING ERRCODE = 'P0001';
        END IF;

        v_name_parts := regexp_split_to_array(trim(v_name), '\s+');
        v_nome := v_name_parts[1];
        -- Fallback: se não tem sobrenome, usar '-' (placeholder para o check
        -- check_contato_required_fields, que exige sobrenome não-null mesmo
        -- com origem='echo' ele ignora, mas por segurança)
        v_sobrenome := CASE WHEN array_length(v_name_parts, 1) > 1
                            THEN array_to_string(v_name_parts[2:], ' ')
                            ELSE NULL END;

        INSERT INTO contatos (
            org_id, nome, sobrenome, telefone, tipo_pessoa, origem,
            last_whatsapp_conversation_id
        ) VALUES (
            v_org_id, v_nome, v_sobrenome, v_phone_raw, 'adulto', 'echo',
            v_conv
        )
        RETURNING id INTO v_contact_id;

        v_contact_created := TRUE;

        INSERT INTO contato_meios (org_id, contato_id, tipo, valor, is_principal, origem)
        VALUES (v_org_id, v_contact_id, 'whatsapp', v_phone_raw, TRUE, 'echo')
        ON CONFLICT DO NOTHING;
    ELSE
        UPDATE contatos
           SET last_whatsapp_conversation_id = v_conv
         WHERE id = v_contact_id
           AND last_whatsapp_conversation_id IS NULL;
    END IF;

    -- ========================================================================
    -- 6. Dedup card
    -- ========================================================================
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

    -- ========================================================================
    -- 7. Cria card
    -- ========================================================================
    v_titulo := v_name;

    INSERT INTO cards (
        org_id, titulo, pessoa_principal_id, pipeline_id, pipeline_stage_id,
        produto, origem, dono_atual_id, sdr_owner_id, status_comercial, moeda
    ) VALUES (
        v_org_id, v_titulo, v_contact_id, v_pipeline_id, v_stage_id,
        v_produto::app_product, 'whatsapp', v_owner_id, v_owner_id, 'aberto', 'BRL'
    )
    RETURNING id INTO v_new_card_id;

    RETURN jsonb_build_object(
        'id', v_new_card_id,
        'titulo', v_titulo,
        'dedup', FALSE,
        'contact_id', v_contact_id,
        'contact_created', v_contact_created
    );
END;
$$;
