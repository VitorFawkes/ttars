-- ============================================================================
-- criar_card_de_conversa_echo: parse defensivo + dedup por dígitos
-- Date: 2026-04-08
--
-- Bug observado em prod (card 2dea2f18-...):
--   p_phone chegou como "{554188413454}☎id={3dece9d0-...}☎label={Mariana Volpi}"
--   (Echo concatenando os 3 valores em um único param com separador U+260E).
--   O strip antigo só removia as chaves externas, então gravou o lixo inteiro
--   em contatos.telefone e contato_meios.valor. Resultado: telefone_normalizado
--   = "554188413454390941631670590" (phone + dígitos do UUID embutido) → próximo
--   lookup nunca acha o contato → cria duplicata.
--
-- Esta migration:
--   1. Faz split defensivo do separador ☎ (e padrão "}id={" / "}label={").
--   2. Normaliza phone para SOMENTE DÍGITOS (via normalize_phone_brazil).
--   3. Faz lookup do contato por valor_normalizado em contato_meios PRIMEIRO
--      (mais confiável que find_contact_by_whatsapp, que depende de
--      conversation_id linkado). Só cria contato novo se não achar.
--   4. Persiste telefone limpo (digits-only) tanto em contatos.telefone quanto
--      em contato_meios.valor.
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
    -- ========================================================================
    -- Sanitização agressiva: strip {...} + split do separador ☎ (U+260E)
    -- ========================================================================
    v_conv        := regexp_replace(COALESCE(p_conversation_id, ''), '^\{(.*)\}$', '\1');
    v_name        := regexp_replace(COALESCE(p_name, ''), '^\{(.*)\}$', '\1');
    v_phone_raw   := regexp_replace(COALESCE(p_phone, ''), '^\{(.*)\}$', '\1');
    v_phone_id    := regexp_replace(COALESCE(p_phone_number_id, ''), '^\{(.*)\}$', '\1');
    v_phone_label := regexp_replace(COALESCE(p_phone_number_label, ''), '^\{(.*)\}$', '\1');
    v_agent_email := regexp_replace(COALESCE(p_agent_email, ''), '^\{(.*)\}$', '\1');

    -- Caso degenerado: Echo concatenou phone + id + label num único param
    -- com separador U+260E. Ex: "554...}☎id={uuid}☎label={Linha Y"
    IF position(E'\u260E' IN v_phone_raw) > 0
       OR v_phone_raw ~* '\}\s*id\s*=\s*\{' THEN
        v_parts := string_to_array(v_phone_raw, E'\u260E');
        -- primeiro elemento é o phone
        v_phone_raw := regexp_replace(COALESCE(v_parts[1], ''), '[\{\}]', '', 'g');
        -- procurar id= e label= nos demais
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

    -- ========================================================================
    -- Validações
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

    -- Versão limpa: somente dígitos. Único formato aceito para gravar.
    v_phone_clean := regexp_replace(v_phone_raw, '\D', '', 'g');
    v_phone_norm  := normalize_phone_brazil(v_phone_clean);

    IF length(v_phone_clean) < 10 OR length(v_phone_clean) > 15 THEN
        RAISE EXCEPTION 'Telefone inválido. Bruto: "%" | Dígitos: "%" (length=%)',
            COALESCE(p_phone, '<null>'),
            v_phone_clean,
            length(v_phone_clean)
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
    -- 5. Resolve contato — REGRA OBRIGATÓRIA: se já existe, REUSAR
    --    Estratégia em camadas (mais robusto primeiro):
    --      a) lookup por valor_normalizado em contato_meios (digits-only)
    --      b) lookup por contatos.telefone_normalizado direto
    --      c) find_contact_by_whatsapp (fallback que tenta variações 9º dígito)
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

        v_name_parts := regexp_split_to_array(trim(v_name), '\s+');
        v_nome := v_name_parts[1];
        v_sobrenome := CASE WHEN array_length(v_name_parts, 1) > 1
                            THEN array_to_string(v_name_parts[2:], ' ')
                            ELSE NULL END;

        -- Grava SEMPRE o phone limpo (digits-only). Nunca a string bruta.
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
        -- Contato existente: linka conversa se ainda não tem
        UPDATE contatos
           SET last_whatsapp_conversation_id = v_conv
         WHERE id = v_contact_id
           AND last_whatsapp_conversation_id IS NULL;
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

GRANT EXECUTE ON FUNCTION public.criar_card_de_conversa_echo(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.criar_card_de_conversa_echo IS
'Cria card a partir de conversa Echo. Parse defensivo de payloads concatenados, dedup forte por valor_normalizado em contato_meios. Idempotente: reusa contato e card existentes.';

-- ============================================================================
-- Cleanup defensivo de registros corrompidos pelo bug (qualquer phone com ☎)
-- Wrap em DO block para tolerar staging onde a tabela pode não existir.
-- ============================================================================

DO $cleanup$
BEGIN
    IF to_regclass('public.contatos') IS NOT NULL THEN
        UPDATE public.contatos
           SET telefone = regexp_replace(split_part(telefone, E'\u260E', 1), '\D', '', 'g')
         WHERE telefone LIKE '%' || E'\u260E' || '%';
    END IF;

    IF to_regclass('public.contato_meios') IS NOT NULL THEN
        UPDATE public.contato_meios
           SET valor = regexp_replace(split_part(valor, E'\u260E', 1), '\D', '', 'g')
         WHERE valor LIKE '%' || E'\u260E' || '%';
    END IF;
END
$cleanup$;
