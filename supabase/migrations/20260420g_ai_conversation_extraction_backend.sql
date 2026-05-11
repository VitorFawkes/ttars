-- ============================================================================
-- Marco C — Motor de extração IA da conversa completa
-- Date: 2026-04-20
--
-- Backend do botão "IA lê conversa": uma chamada de IA retorna três escopos
-- (campos do card, dados do contato principal, viajantes acompanhantes).
-- Três RPCs independentes para aplicação seletiva do preview.
--
-- 1. Estende ai_extraction_field_config com seção 'contato_principal'.
-- 2. update_contato_principal_from_ai_extraction(card_id, contact_id, fields)
-- 3. upsert_viajantes_from_ai_extraction(card_id, viajantes JSONB)
-- 4. apply_ai_conversation_extraction(card_id, ...) — wrapper transacional
-- ============================================================================

-- Extensões (já presentes em prod, idempotente)
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- 1) Seção contato_principal em ai_extraction_field_config
--    Amplia CHECKs de section e field_type antes de inserir os novos campos.
-- ============================================================================

ALTER TABLE ai_extraction_field_config
    DROP CONSTRAINT IF EXISTS ai_extraction_field_config_section_check;

ALTER TABLE ai_extraction_field_config
    ADD CONSTRAINT ai_extraction_field_config_section_check
    CHECK (section = ANY (ARRAY['trip_info', 'observacoes', 'contato_principal']));

ALTER TABLE ai_extraction_field_config
    DROP CONSTRAINT IF EXISTS ai_extraction_field_config_field_type_check;

ALTER TABLE ai_extraction_field_config
    ADD CONSTRAINT ai_extraction_field_config_field_type_check
    CHECK (field_type = ANY (ARRAY[
        'text', 'textarea', 'number', 'boolean', 'select', 'multiselect',
        'array', 'currency', 'smart_budget', 'flexible_duration', 'date', 'date_range'
    ]));

INSERT INTO ai_extraction_field_config (
    field_key, section, field_type, label,
    prompt_question, prompt_format, prompt_examples, prompt_extract_when,
    allowed_values, sort_order, is_active
) VALUES
    ('contato_nome',
     'contato_principal', 'text', 'Nome do Cliente',
     'Qual o nome completo do cliente (pessoa principal da conversa)?',
     'String com nome completo (ex: "Ilana Guilgen")',
     '"Ana Souza", "João Silva"',
     'Cliente se apresenta, operador menciona o nome, ou assinatura em mensagem. Ignorar apelidos fraccionados.',
     NULL, 100, TRUE),
    ('contato_email',
     'contato_principal', 'text', 'Email do Cliente',
     'Qual o email do cliente?',
     'String com email válido',
     '"cliente@exemplo.com"',
     'Cliente compartilha email explicitamente. Nunca inferir de outros dados.',
     NULL, 101, TRUE),
    ('contato_data_nascimento',
     'contato_principal', 'date', 'Data de Nascimento',
     'Qual a data de nascimento do cliente?',
     'Data no formato YYYY-MM-DD',
     '"1985-07-23"',
     'Cliente menciona data ou faz aniversário em data específica.',
     NULL, 102, TRUE),
    ('contato_cidade',
     'contato_principal', 'text', 'Cidade',
     'Em qual cidade o cliente mora?',
     'String com nome da cidade (UF opcional)',
     '"Curitiba", "São Paulo - SP"',
     'Cliente menciona explicitamente onde mora. NÃO usar origem da viagem.',
     NULL, 103, TRUE),
    ('contato_profissao',
     'contato_principal', 'text', 'Profissão',
     'Qual a profissão do cliente?',
     'String com profissão',
     '"Médica", "Advogado", "Engenheiro"',
     'Cliente menciona profissão explicitamente.',
     NULL, 104, TRUE),
    ('contato_observacoes',
     'contato_principal', 'textarea', 'Observações',
     'Alguma observação relevante sobre o cliente (preferências pessoais, contexto)?',
     'Texto livre curto',
     '"Vegetariana", "Tem medo de avião"',
     'Informação pessoal relevante que não cabe em outros campos. Não é sobre a viagem.',
     NULL, 105, TRUE)
ON CONFLICT (field_key) DO NOTHING;

-- ============================================================================
-- 2) update_contato_principal_from_ai_extraction
--     Atualiza o contato pessoa_principal do card com campos aprovados no preview.
--     Respeita nome_locked_at (não sobrescreve nome se trancado).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_contato_principal_from_ai_extraction(
    p_card_id    UUID,
    p_contact_id UUID,
    p_fields     JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id              UUID := requesting_org_id();
    v_card_org_id         UUID;
    v_contact_org_id      UUID;
    v_contact_parent      UUID;
    v_current_nome        TEXT;
    v_current_locked      TIMESTAMPTZ;
    v_nome                TEXT;
    v_sobrenome           TEXT;
    v_name_parts          TEXT[];
    v_applied             JSONB := '[]'::jsonb;
    v_skipped_locked_nome BOOLEAN := FALSE;
BEGIN
    IF p_card_id IS NULL OR p_contact_id IS NULL THEN
        RAISE EXCEPTION 'card_id e contact_id são obrigatórios' USING ERRCODE = '22023';
    END IF;

    -- Valida que o card está no workspace do operador
    SELECT org_id INTO v_card_org_id FROM cards WHERE id = p_card_id;
    IF v_card_org_id IS NULL THEN
        RAISE EXCEPTION 'Card % não encontrado', p_card_id USING ERRCODE = 'P0002';
    END IF;
    IF v_card_org_id <> v_org_id THEN
        RAISE EXCEPTION 'Card pertence a outra organização' USING ERRCODE = '42501';
    END IF;

    -- Valida que o contato é pessoa_principal do card OU está vinculado via cards_contatos
    PERFORM 1 FROM cards
     WHERE id = p_card_id
       AND pessoa_principal_id = p_contact_id;
    IF NOT FOUND THEN
        PERFORM 1 FROM cards_contatos
         WHERE card_id = p_card_id
           AND contato_id = p_contact_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Contato % não está vinculado ao card %', p_contact_id, p_card_id
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Valida que o contato está numa org acessível (mesmo workspace ou account pai)
    SELECT org_id INTO v_contact_org_id FROM contatos WHERE id = p_contact_id;
    IF v_contact_org_id IS NULL THEN
        RAISE EXCEPTION 'Contato % não encontrado', p_contact_id USING ERRCODE = 'P0002';
    END IF;

    -- contact_org deve ser igual ao workspace OU ser a account pai
    SELECT parent_org_id INTO v_contact_parent FROM organizations WHERE id = v_org_id;
    IF v_contact_org_id <> v_org_id
       AND (v_contact_parent IS NULL OR v_contact_org_id <> v_contact_parent) THEN
        RAISE EXCEPTION 'Contato em organização não acessível' USING ERRCODE = '42501';
    END IF;

    -- Lê estado atual do nome para decidir lock
    SELECT nome, nome_locked_at INTO v_current_nome, v_current_locked
      FROM contatos WHERE id = p_contact_id;

    PERFORM set_config('app.update_source', 'ai_extraction', true);

    -- Campo nome: só sobrescreve se não está trancado
    IF p_fields ? 'nome' AND p_fields->>'nome' IS NOT NULL AND btrim(p_fields->>'nome') <> '' THEN
        IF v_current_locked IS NOT NULL THEN
            v_skipped_locked_nome := TRUE;
        ELSIF NOT is_weak_contact_name(p_fields->>'nome') THEN
            -- Split em nome / sobrenome
            v_name_parts := regexp_split_to_array(btrim(p_fields->>'nome'), '\s+');
            v_nome       := v_name_parts[1];
            v_sobrenome  := CASE WHEN array_length(v_name_parts, 1) > 1
                                 THEN array_to_string(v_name_parts[2:], ' ')
                                 ELSE NULL END;
            UPDATE contatos
               SET nome = v_nome,
                   sobrenome = COALESCE(v_sobrenome, sobrenome),
                   updated_at = NOW()
             WHERE id = p_contact_id;
            v_applied := v_applied || jsonb_build_array('nome');
        END IF;
    END IF;

    -- Demais campos: UPDATE direto só quando valor não-nulo foi enviado
    IF p_fields ? 'email' AND p_fields->>'email' IS NOT NULL AND btrim(p_fields->>'email') <> '' THEN
        UPDATE contatos SET email = btrim(p_fields->>'email'), updated_at = NOW()
         WHERE id = p_contact_id;
        v_applied := v_applied || jsonb_build_array('email');
    END IF;

    IF p_fields ? 'data_nascimento' AND p_fields->>'data_nascimento' IS NOT NULL
       AND btrim(p_fields->>'data_nascimento') <> '' THEN
        BEGIN
            UPDATE contatos SET data_nascimento = (p_fields->>'data_nascimento')::DATE, updated_at = NOW()
             WHERE id = p_contact_id;
            v_applied := v_applied || jsonb_build_array('data_nascimento');
        EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
            NULL;
        END;
    END IF;

    IF p_fields ? 'cidade' AND p_fields->>'cidade' IS NOT NULL AND btrim(p_fields->>'cidade') <> '' THEN
        UPDATE contatos
           SET endereco = COALESCE(endereco, '{}'::jsonb) || jsonb_build_object('cidade', btrim(p_fields->>'cidade')),
               updated_at = NOW()
         WHERE id = p_contact_id;
        v_applied := v_applied || jsonb_build_array('cidade');
    END IF;

    IF p_fields ? 'profissao' AND p_fields->>'profissao' IS NOT NULL AND btrim(p_fields->>'profissao') <> '' THEN
        UPDATE contatos
           SET endereco = COALESCE(endereco, '{}'::jsonb) || jsonb_build_object('profissao', btrim(p_fields->>'profissao')),
               updated_at = NOW()
         WHERE id = p_contact_id;
        v_applied := v_applied || jsonb_build_array('profissao');
    END IF;

    IF p_fields ? 'observacoes' AND p_fields->>'observacoes' IS NOT NULL
       AND btrim(p_fields->>'observacoes') <> '' THEN
        -- Append não-destrutivo
        UPDATE contatos
           SET observacoes = CASE
                 WHEN observacoes IS NULL OR btrim(observacoes) = '' THEN btrim(p_fields->>'observacoes')
                 WHEN observacoes LIKE '%' || btrim(p_fields->>'observacoes') || '%' THEN observacoes
                 ELSE observacoes || E'\n\n' || btrim(p_fields->>'observacoes')
               END,
               updated_at = NOW()
         WHERE id = p_contact_id;
        v_applied := v_applied || jsonb_build_array('observacoes');
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'contact_id', p_contact_id,
        'applied_fields', v_applied,
        'skipped_locked_nome', v_skipped_locked_nome
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_contato_principal_from_ai_extraction(UUID, UUID, JSONB)
    TO authenticated;

COMMENT ON FUNCTION public.update_contato_principal_from_ai_extraction IS
'Marco C: aplica campos do contato principal extraídos pela IA. Respeita nome_locked_at.';

-- ============================================================================
-- 3) upsert_viajantes_from_ai_extraction
--     Para cada viajante da IA:
--       a) Matching por telefone → contato existente (UPDATE só campos vazios)
--       b) Fuzzy match por nome dentro do mesmo card (similarity > 0.7)
--       c) INSERT novo contato herdando org via contatos_default_org_id()
--     Vincula em cards_contatos (unique card_id+contato_id, ON CONFLICT nothing).
--     Nunca remove. Idempotente.
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

    -- Valida que o card está no workspace do operador
    SELECT org_id INTO v_card_org_id FROM cards WHERE id = p_card_id;
    IF v_card_org_id IS NULL THEN
        RAISE EXCEPTION 'Card % não encontrado', p_card_id USING ERRCODE = 'P0002';
    END IF;
    IF v_card_org_id <> v_org_id THEN
        RAISE EXCEPTION 'Card pertence a outra organização' USING ERRCODE = '42501';
    END IF;

    -- Fallback: se contatos_default_org_id retornou NULL (config default-off), usa org do workspace
    IF v_contatos_org_id IS NULL THEN
        v_contatos_org_id := v_org_id;
    END IF;

    -- conversation_id do card (via pessoa_principal) para lookup find_contact_by_whatsapp
    SELECT ct.last_whatsapp_conversation_id INTO v_conversation_id
      FROM cards c
      JOIN contatos ct ON ct.id = c.pessoa_principal_id
     WHERE c.id = p_card_id;

    -- Próximo ordem disponível no card (viajantes novos entram no final)
    SELECT COALESCE(MAX(ordem), 0) + 1 INTO v_next_ordem
      FROM cards_contatos WHERE card_id = p_card_id;

    PERFORM set_config('app.update_source', 'ai_extraction', true);

    -- Processa cada viajante
    FOR v_viajante IN SELECT * FROM jsonb_array_elements(COALESCE(p_viajantes, '[]'::jsonb))
    LOOP
        v_nome_raw       := btrim(COALESCE(v_viajante->>'nome', ''));
        v_telefone_raw   := COALESCE(v_viajante->>'telefone', '');
        v_tipo_vinculo   := NULLIF(btrim(COALESCE(v_viajante->>'tipo_vinculo', '')), '');
        v_tipo_pessoa    := LOWER(NULLIF(btrim(COALESCE(v_viajante->>'tipo_pessoa', '')), ''));
        v_data_nasc      := NULLIF(btrim(COALESCE(v_viajante->>'data_nascimento', '')), '');

        -- Nome obrigatório e não-fraco
        IF v_nome_raw = '' OR is_weak_contact_name(v_nome_raw) THEN
            v_skipped_count := v_skipped_count + 1;
            v_results := v_results || jsonb_build_array(jsonb_build_object(
                'nome', v_nome_raw, 'action', 'skipped', 'reason', 'weak_name'
            ));
            CONTINUE;
        END IF;

        -- Normaliza tipo_pessoa
        IF v_tipo_pessoa NOT IN ('adulto', 'crianca') THEN
            v_tipo_pessoa := CASE
                WHEN v_tipo_pessoa IN ('criança', 'filho', 'filha', 'bebê', 'bebe') THEN 'crianca'
                ELSE 'adulto'
            END;
        END IF;

        v_contact_id := NULL;
        v_is_new := FALSE;
        v_is_newly_linked := FALSE;

        -- (a) Lookup por telefone
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
            END IF;
        END IF;

        -- (b) Fuzzy match por nome dentro do mesmo card (similarity > 0.7 sobre nome completo sem acentos)
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

        -- (c) Cria contato novo
        IF v_contact_id IS NULL THEN
            v_name_parts := regexp_split_to_array(v_nome_raw, '\s+');
            v_nome       := v_name_parts[1];
            v_sobrenome  := CASE WHEN array_length(v_name_parts, 1) > 1
                                 THEN array_to_string(v_name_parts[2:], ' ')
                                 ELSE NULL END;

            INSERT INTO contatos (
                org_id, nome, sobrenome, tipo_pessoa, origem, origem_detalhe,
                data_nascimento, telefone, telefone_normalizado
            ) VALUES (
                v_contatos_org_id,
                v_nome,
                v_sobrenome,
                v_tipo_pessoa::tipo_pessoa_enum,
                'ai_extraction',
                'viajante_extraido_conversa',
                CASE WHEN v_data_nasc IS NOT NULL THEN
                    (SELECT CASE WHEN v_data_nasc ~ '^\d{4}-\d{2}-\d{2}$' THEN v_data_nasc::DATE ELSE NULL END)
                ELSE NULL END,
                NULLIF(v_telefone_clean, ''),
                NULLIF(v_telefone_norm, '')
            )
            RETURNING id INTO v_contact_id;

            v_is_new := TRUE;
            v_created_count := v_created_count + 1;

            -- Meio WhatsApp se tinha telefone
            IF v_telefone_clean IS NOT NULL AND v_telefone_clean <> '' THEN
                INSERT INTO contato_meios (org_id, contato_id, tipo, valor, is_principal, origem)
                VALUES (v_contatos_org_id, v_contact_id, 'whatsapp', v_telefone_clean, TRUE, 'ai_extraction')
                ON CONFLICT DO NOTHING;
            END IF;
        ELSE
            -- Contato já existe — preenche só campos vazios (não-destrutivo)
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

        -- Vincula ao card (idempotente via unique index)
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

COMMENT ON FUNCTION public.upsert_viajantes_from_ai_extraction IS
'Marco C: aplica viajantes extraídos pela IA. Matching por telefone → nome fuzzy dentro do card → cria novo. Idempotente e não-destrutivo.';

-- ============================================================================
-- 4) apply_ai_conversation_extraction — wrapper transacional
--     Chama as três RPCs conforme as seções aprovadas no preview.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_ai_conversation_extraction(
    p_card_id              UUID,
    p_produto_data         JSONB DEFAULT NULL,
    p_briefing_inicial     JSONB DEFAULT NULL,
    p_contact_fields       JSONB DEFAULT NULL,
    p_viajantes            JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id         UUID := requesting_org_id();
    v_card_org_id    UUID;
    v_contact_id     UUID;
    v_card_result    JSONB := NULL;
    v_contact_result JSONB := NULL;
    v_viajantes_res  JSONB := NULL;
BEGIN
    IF p_card_id IS NULL THEN
        RAISE EXCEPTION 'card_id é obrigatório' USING ERRCODE = '22023';
    END IF;

    SELECT org_id, pessoa_principal_id INTO v_card_org_id, v_contact_id
      FROM cards WHERE id = p_card_id;
    IF v_card_org_id IS NULL THEN
        RAISE EXCEPTION 'Card % não encontrado', p_card_id USING ERRCODE = 'P0002';
    END IF;
    IF v_card_org_id <> v_org_id THEN
        RAISE EXCEPTION 'Card pertence a outra organização' USING ERRCODE = '42501';
    END IF;

    -- a) Campos do card (delegando para RPC existente)
    IF p_produto_data IS NOT NULL OR p_briefing_inicial IS NOT NULL THEN
        v_card_result := update_card_from_ai_extraction(
            p_card_id,
            COALESCE(p_produto_data, '{}'::jsonb),
            COALESCE(p_briefing_inicial, '{}'::jsonb)
        );
    END IF;

    -- b) Contato principal
    IF p_contact_fields IS NOT NULL AND jsonb_typeof(p_contact_fields) = 'object'
       AND p_contact_fields <> '{}'::jsonb AND v_contact_id IS NOT NULL THEN
        v_contact_result := update_contato_principal_from_ai_extraction(
            p_card_id, v_contact_id, p_contact_fields
        );
    END IF;

    -- c) Viajantes
    IF p_viajantes IS NOT NULL AND jsonb_typeof(p_viajantes) = 'array'
       AND jsonb_array_length(p_viajantes) > 0 THEN
        v_viajantes_res := upsert_viajantes_from_ai_extraction(p_card_id, p_viajantes);
    END IF;

    -- Log de auditoria (activity) — org_id explícito para não depender de default em SECURITY DEFINER
    INSERT INTO activities (card_id, org_id, tipo, descricao, metadata, created_by)
    VALUES (
        p_card_id,
        v_card_org_id,
        'ai_extraction',
        'IA extraiu conversa completa (campos + contato + viajantes)',
        jsonb_build_object(
            'source', 'conversation_full',
            'card_applied', v_card_result IS NOT NULL,
            'contact_applied', v_contact_result IS NOT NULL,
            'viajantes_applied', v_viajantes_res IS NOT NULL,
            'card_result', v_card_result,
            'contact_result', v_contact_result,
            'viajantes_result', v_viajantes_res
        ),
        auth.uid()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'card_id', p_card_id,
        'card_result', v_card_result,
        'contact_result', v_contact_result,
        'viajantes_result', v_viajantes_res
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_ai_conversation_extraction(UUID, JSONB, JSONB, JSONB, JSONB)
    TO authenticated;

COMMENT ON FUNCTION public.apply_ai_conversation_extraction IS
'Marco C: wrapper que aplica as três seções aprovadas no preview da extração de conversa (card + contato + viajantes).';
