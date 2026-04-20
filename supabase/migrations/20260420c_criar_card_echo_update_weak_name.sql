-- ============================================================================
-- Marco A — Atualizar nome de contato existente quando fraco
-- Date: 2026-04-20
--
-- Base: 20260408_criar_card_echo_robust_dedup.sql
--
-- Mudança: no bloco de "contato existente" (após lookup por telefone), a
-- função passa a atualizar nome/sobrenome se:
--   - contatos.nome_locked_at IS NULL (operador ainda não travou)
--   - nome atual é fraco (is_weak_contact_name = true)
--   - p_name recebido é um nome válido (não é fraco)
--
-- Origem do padrão: nome é placeholder tipo "554199979212" ou "WhatsApp 55…"
-- criado em fluxos antigos; agora, a primeira vez que o Echo envia um p_name
-- de verdade, o nome é corrigido automaticamente.
-- ============================================================================

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
    v_contact_name_updated BOOLEAN := FALSE;
    v_current_nome    TEXT;
    v_current_locked  TIMESTAMPTZ;
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
    v_phone_clean     TEXT;
    v_phone_norm      TEXT;
    v_phone_id        TEXT;
    v_phone_label     TEXT;
    v_agent_email     TEXT;
    v_parts           TEXT[];
    v_part            TEXT;
    v_match           TEXT[];
BEGIN
    v_conv        := regexp_replace(COALESCE(p_conversation_id, ''), '^\{(.*)\}$', '\1');
    v_name        := regexp_replace(COALESCE(p_name, ''), '^\{(.*)\}$', '\1');
    v_phone_raw   := regexp_replace(COALESCE(p_phone, ''), '^\{(.*)\}$', '\1');
    v_phone_id    := regexp_replace(COALESCE(p_phone_number_id, ''), '^\{(.*)\}$', '\1');
    v_phone_label := regexp_replace(COALESCE(p_phone_number_label, ''), '^\{(.*)\}$', '\1');
    v_agent_email := regexp_replace(COALESCE(p_agent_email, ''), '^\{(.*)\}$', '\1');

    IF position(E'\u260E' IN v_phone_raw) > 0
       OR v_phone_raw ~* '\}\s*id\s*=\s*\{' THEN
        v_parts := string_to_array(v_phone_raw, E'\u260E');
        v_phone_raw := regexp_replace(COALESCE(v_parts[1], ''), '[\{\}]', '', 'g');
        FOREACH v_part IN ARRAY v_parts LOOP
            IF v_part ~* '^\s*id\s*=' THEN
                v_match := regexp_matches(v_part, '=\s*\{?([^}]*)\}?');
                IF v_match IS NOT NULL AND (v_phone_id IS NULL OR v_phone_id = '') THEN
                    v_phone_id := trim(v_match[1]);
                END IF;
            ELSIF v_part ~* '^\s*label\s*=' THEN
                v_match := regexp_matches(v_part, '=\s*\{?([^}]*)\}?');
                IF v_match IS NOT NULL AND (v_phone_label IS NULL OR v_phone_label = '') THEN
                    v_phone_label := trim(v_match[1]);
                END IF;
            END IF;
        END LOOP;
    END IF;

    v_phone_id    := NULLIF(v_phone_id, '');
    v_phone_label := NULLIF(v_phone_label, '');
    v_agent_email := NULLIF(v_agent_email, '');

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

    v_phone_clean := regexp_replace(v_phone_raw, '\D', '', 'g');
    v_phone_norm  := normalize_phone_brazil(v_phone_clean);

    IF length(v_phone_clean) < 10 OR length(v_phone_clean) > 15 THEN
        RAISE EXCEPTION 'Telefone inválido. Bruto: "%" | Dígitos: "%" (length=%)',
            COALESCE(p_phone, '<null>'),
            v_phone_clean,
            length(v_phone_clean)
            USING ERRCODE = '22023';
    END IF;

    -- Split nome/sobrenome uma vez (reusado em create e update)
    v_name_parts := regexp_split_to_array(trim(v_name), '\s+');
    v_nome       := v_name_parts[1];
    v_sobrenome  := CASE WHEN array_length(v_name_parts, 1) > 1
                         THEN array_to_string(v_name_parts[2:], ' ')
                         ELSE NULL END;

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
     ORDER BY s.ordem ASC
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
    END IF;

    IF v_stage_id IS NULL THEN
        SELECT id INTO v_stage_id
          FROM pipeline_stages
         WHERE pipeline_id = v_pipeline_id
         ORDER BY ordem ASC
         LIMIT 1;
    END IF;

    -- ========================================================================
    -- 4. Resolve owner
    -- ========================================================================
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
    -- 5. Dedup / cria contato
    -- ========================================================================
    SELECT cm.contato_id INTO v_contact_id
      FROM contato_meios cm
     WHERE cm.org_id = v_org_id
       AND cm.tipo IN ('whatsapp', 'telefone')
       AND cm.valor_normalizado = v_phone_norm
     ORDER BY cm.is_principal DESC NULLS LAST, cm.created_at ASC
     LIMIT 1;

    IF v_contact_id IS NULL THEN
        SELECT id INTO v_contact_id
          FROM contatos
         WHERE org_id = v_org_id
           AND telefone_normalizado = v_phone_norm
           AND deleted_at IS NULL
         ORDER BY created_at ASC
         LIMIT 1;
    END IF;

    IF v_contact_id IS NULL THEN
        v_contact_id := find_contact_by_whatsapp(v_phone_clean, v_conv);
    END IF;

    IF v_contact_id IS NULL THEN
        IF v_linha.criar_contato = FALSE THEN
            RAISE EXCEPTION 'Criação de contato desabilitada para a linha "%"', v_linha.phone_number_label
                USING ERRCODE = 'P0001';
        END IF;

        INSERT INTO contatos (
            org_id, nome, sobrenome, telefone, tipo_pessoa, origem,
            last_whatsapp_conversation_id
        ) VALUES (
            v_org_id, v_nome, v_sobrenome, v_phone_clean, 'adulto', 'echo',
            v_conv
        )
        RETURNING id INTO v_contact_id;

        v_contact_created := TRUE;

        INSERT INTO contato_meios (org_id, contato_id, tipo, valor, is_principal, origem)
        VALUES (v_org_id, v_contact_id, 'whatsapp', v_phone_clean, TRUE, 'echo')
        ON CONFLICT DO NOTHING;
    ELSE
        -- Contato existente: ler estado atual e decidir update
        SELECT nome, nome_locked_at
          INTO v_current_nome, v_current_locked
          FROM contatos
         WHERE id = v_contact_id;

        IF is_weak_contact_name(v_current_nome)
           AND v_current_locked IS NULL
           AND NOT is_weak_contact_name(v_name) THEN
            UPDATE contatos
               SET nome = v_nome,
                   sobrenome = COALESCE(sobrenome, v_sobrenome),
                   last_whatsapp_conversation_id = COALESCE(last_whatsapp_conversation_id, v_conv),
                   updated_at = NOW()
             WHERE id = v_contact_id;
            v_contact_name_updated := TRUE;
        ELSE
            UPDATE contatos
               SET last_whatsapp_conversation_id = COALESCE(last_whatsapp_conversation_id, v_conv)
             WHERE id = v_contact_id
               AND last_whatsapp_conversation_id IS DISTINCT FROM v_conv;
        END IF;
    END IF;

    -- ========================================================================
    -- 6. Dedup card (mesmo contato + produto, ainda aberto)
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
            'contact_created', v_contact_created,
            'contact_name_updated', COALESCE(v_contact_name_updated, FALSE)
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
        'contact_created', v_contact_created,
        'contact_name_updated', COALESCE(v_contact_name_updated, FALSE)
    );
END;
$$;

COMMENT ON FUNCTION public.criar_card_de_conversa_echo IS
'Cria card a partir de conversa Echo. Dedup forte por valor_normalizado em contato_meios. Atualiza nome do contato quando fraco e p_name é válido (Marco A).';
