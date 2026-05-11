-- ============================================================================
-- MIGRATION: Welcome Corporativo — vincular pessoas à empresa cliente
-- Date: 2026-04-30
--
-- Hoje cada WhatsApp de uma pessoa nova cria contato + card desconectados.
-- Quando 2 pessoas da mesma empresa (Beatriz e Frederico da Magazine Luiza)
-- mandam mensagem, viram 2 cards independentes. Esta migration estende o
-- modelo pra suportar empresa→pessoas:
--
--   - contatos.tipo_contato distingue 'pessoa' de 'empresa'
--   - contatos.empresa_id liga uma pessoa à empresa
--   - contatos.cargo guarda função (ex: "Secretaria executiva")
--   - criar_card_de_conversa_echo: se pessoa tem empresa_id, dedup/cria
--     card com pessoa_principal = empresa, e adiciona pessoa em
--     cards_contatos como solicitante
--   - listar_cards_abertos_do_contato_echo: lista cards da empresa quando
--     contato é uma pessoa vinculada
--   - RPC vincular_contato_a_empresa: atendente vincula pessoa solta a uma
--     empresa, e cards órfãos da pessoa migram pra empresa
--   - RPC criar_pessoa_da_empresa: cadastrar manualmente nova pessoa
--
-- IDEMPOTENTE.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Estender tabela contatos
-- ============================================================================

ALTER TABLE contatos
  ADD COLUMN IF NOT EXISTS tipo_contato TEXT DEFAULT 'pessoa'
    CHECK (tipo_contato IN ('pessoa', 'empresa')),
  ADD COLUMN IF NOT EXISTS empresa_id UUID REFERENCES contatos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cargo TEXT;

CREATE INDEX IF NOT EXISTS idx_contatos_empresa_id
  ON contatos(empresa_id) WHERE empresa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contatos_tipo
  ON contatos(tipo_contato);

-- Constraint: empresa_id só é válido pra contatos do tipo 'pessoa'
DO $cstr$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'contatos_empresa_id_only_for_pessoa'
    ) THEN
        ALTER TABLE contatos ADD CONSTRAINT contatos_empresa_id_only_for_pessoa
            CHECK ((empresa_id IS NULL) OR (tipo_contato = 'pessoa'));
    END IF;
END $cstr$;

-- Trigger: empresa_id deve apontar pra um contato do tipo 'empresa' na mesma org
CREATE OR REPLACE FUNCTION public.contatos_check_empresa_id_target()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE
    v_target_tipo TEXT;
    v_target_org UUID;
BEGIN
    IF NEW.empresa_id IS NULL THEN RETURN NEW; END IF;
    SELECT tipo_contato, org_id INTO v_target_tipo, v_target_org
      FROM contatos WHERE id = NEW.empresa_id;
    IF v_target_tipo IS DISTINCT FROM 'empresa' THEN
        RAISE EXCEPTION 'empresa_id (%) deve apontar pra um contato tipo_contato=empresa', NEW.empresa_id
            USING ERRCODE = '23514';
    END IF;
    IF v_target_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'empresa_id (%) é de outra org', NEW.empresa_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_contatos_check_empresa_id ON contatos;
CREATE TRIGGER trg_contatos_check_empresa_id
    BEFORE INSERT OR UPDATE OF empresa_id ON contatos
    FOR EACH ROW EXECUTE FUNCTION public.contatos_check_empresa_id_target();

-- ============================================================================
-- 2. Migração de dados: Welcome Corporativo cards existentes → marcar
--    o contato principal como tipo_contato='empresa'
-- ============================================================================

UPDATE contatos
   SET tipo_contato = 'empresa'
 WHERE tipo_contato = 'pessoa'
   AND id IN (
       SELECT DISTINCT pessoa_principal_id
         FROM cards
        WHERE produto = 'CORP'
          AND pessoa_principal_id IS NOT NULL
          AND deleted_at IS NULL
   );

-- ============================================================================
-- 3. Função helper: resolve "qual contato é o dono lógico do card"
--    Pessoa com empresa → empresa
--    Pessoa sem empresa OU empresa → ela mesma
-- ============================================================================
CREATE OR REPLACE FUNCTION public.resolve_card_owner_contact(p_contato_id UUID)
RETURNS UUID LANGUAGE plpgsql STABLE AS $fn$
DECLARE
    v_empresa_id UUID;
BEGIN
    IF p_contato_id IS NULL THEN RETURN NULL; END IF;
    SELECT empresa_id INTO v_empresa_id FROM contatos WHERE id = p_contato_id;
    RETURN COALESCE(v_empresa_id, p_contato_id);
END;
$fn$;

-- ============================================================================
-- 4. Atualizar criar_card_de_conversa_echo (replace completo)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.criar_card_de_conversa_echo(
    p_conversation_id    TEXT,
    p_name               TEXT,
    p_phone              TEXT,
    p_phone_number_id    TEXT DEFAULT NULL,
    p_phone_number_label TEXT DEFAULT NULL,
    p_agent_email        TEXT DEFAULT NULL,
    p_force_create       BOOLEAN DEFAULT FALSE
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
    v_contact_id      UUID;          -- contato real (Beatriz)
    v_card_owner_id   UUID;          -- dono lógico do card (Magazine Luiza, ou Beatriz se sem empresa)
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
    -- (sanitização — igual à versão anterior)
    v_conv        := regexp_replace(COALESCE(p_conversation_id, ''), '^\{(.*)\}$', '\1');
    v_name        := regexp_replace(COALESCE(p_name, ''), '^\{(.*)\}$', '\1');
    v_phone_raw   := regexp_replace(COALESCE(p_phone, ''), '^\{(.*)\}$', '\1');
    v_phone_id    := regexp_replace(COALESCE(p_phone_number_id, ''), '^\{(.*)\}$', '\1');
    v_phone_label := regexp_replace(COALESCE(p_phone_number_label, ''), '^\{(.*)\}$', '\1');
    v_agent_email := regexp_replace(COALESCE(p_agent_email, ''), '^\{(.*)\}$', '\1');

    IF position(E'☎' IN v_phone_raw) > 0
       OR v_phone_raw ~* '\}\s*id\s*=\s*\{' THEN
        v_parts := string_to_array(v_phone_raw, E'☎');
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
        RAISE EXCEPTION 'name obrigatório' USING ERRCODE = '22023';
    END IF;
    IF v_phone_raw IS NULL OR v_phone_raw = '' THEN
        RAISE EXCEPTION 'phone obrigatório' USING ERRCODE = '22023';
    END IF;

    v_phone_clean := regexp_replace(v_phone_raw, '\D', '', 'g');
    v_phone_norm  := normalize_phone_brazil(v_phone_clean);

    IF length(v_phone_clean) < 10 OR length(v_phone_clean) > 15 THEN
        RAISE EXCEPTION 'Telefone inválido. Dígitos: "%" (length=%)',
            v_phone_clean, length(v_phone_clean) USING ERRCODE = '22023';
    END IF;

    v_name_parts := regexp_split_to_array(trim(v_name), '\s+');
    v_nome       := v_name_parts[1];
    v_sobrenome  := CASE WHEN array_length(v_name_parts, 1) > 1
                         THEN array_to_string(v_name_parts[2:], ' ')
                         ELSE NULL END;

    -- 1. Linha config
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

    -- 2. Produto/pipeline
    v_produto := COALESCE(v_linha.produto, 'TRIPS');
    v_pipeline_id := v_linha.pipeline_id;
    IF v_pipeline_id IS NULL THEN
        SELECT id INTO v_pipeline_id FROM pipelines
         WHERE produto::TEXT = v_produto AND org_id = v_org_id LIMIT 1;
    END IF;
    IF v_pipeline_id IS NULL THEN
        RAISE EXCEPTION 'Nenhum pipeline configurado para produto % (org %)', v_produto, v_org_id
            USING ERRCODE = 'P0002';
    END IF;

    -- 3. Stage inicial
    SELECT s.id INTO v_stage_id
      FROM pipeline_stages s
      JOIN pipeline_phases ph ON ph.id = s.phase_id
     WHERE s.pipeline_id = v_pipeline_id AND ph.slug = 'planner'
       AND s.nome ILIKE 'oportunidade'
     ORDER BY s.ordem ASC LIMIT 1;
    IF v_stage_id IS NULL THEN
        SELECT s.id INTO v_stage_id
          FROM pipeline_stages s
          JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE s.pipeline_id = v_pipeline_id AND ph.slug = 'planner'
         ORDER BY s.ordem ASC LIMIT 1;
    END IF;
    IF v_stage_id IS NULL THEN v_stage_id := v_linha.stage_id; END IF;
    IF v_stage_id IS NULL THEN
        SELECT id INTO v_stage_id FROM pipeline_stages
         WHERE pipeline_id = v_pipeline_id ORDER BY ordem ASC LIMIT 1;
    END IF;

    -- 4. Owner
    IF v_agent_email IS NOT NULL THEN
        SELECT id INTO v_owner_id FROM profiles
         WHERE email = v_agent_email AND org_id = v_org_id LIMIT 1;
    END IF;
    IF v_owner_id IS NULL THEN v_owner_id := v_linha.default_owner_id; END IF;

    -- 5. Resolve / cria contato
    SELECT cm.contato_id INTO v_contact_id
      FROM contato_meios cm
     WHERE cm.org_id = v_org_id
       AND cm.tipo IN ('whatsapp', 'telefone')
       AND cm.valor_normalizado = v_phone_norm
     ORDER BY cm.is_principal DESC NULLS LAST, cm.created_at ASC
     LIMIT 1;

    IF v_contact_id IS NULL THEN
        SELECT id INTO v_contact_id FROM contatos
         WHERE org_id = v_org_id AND telefone_normalizado = v_phone_norm
           AND deleted_at IS NULL
         ORDER BY created_at ASC LIMIT 1;
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
            org_id, nome, sobrenome, telefone, tipo_pessoa, tipo_contato,
            origem, last_whatsapp_conversation_id
        ) VALUES (
            v_org_id, v_nome, v_sobrenome, v_phone_clean, 'adulto', 'pessoa',
            'echo', v_conv
        ) RETURNING id INTO v_contact_id;

        v_contact_created := TRUE;

        INSERT INTO contato_meios (org_id, contato_id, tipo, valor, is_principal, origem)
        VALUES (v_org_id, v_contact_id, 'whatsapp', v_phone_clean, TRUE, 'echo')
        ON CONFLICT DO NOTHING;
    ELSE
        SELECT nome, nome_locked_at INTO v_current_nome, v_current_locked
          FROM contatos WHERE id = v_contact_id;

        IF is_weak_contact_name(v_current_nome) AND v_current_locked IS NULL
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

    -- 6. NOVO: resolve "dono lógico do card" — se pessoa tem empresa, é a empresa
    v_card_owner_id := resolve_card_owner_contact(v_contact_id);

    -- 7. Dedup card (busca pelo dono lógico — empresa se houver)
    IF NOT p_force_create THEN
        SELECT id, titulo INTO v_existing_card
          FROM cards
         WHERE pessoa_principal_id = v_card_owner_id
           AND produto::TEXT = v_produto
           AND status_comercial NOT IN ('ganho', 'perdido')
           AND deleted_at IS NULL
           AND org_id = v_org_id
         LIMIT 1;

        IF v_existing_card.id IS NOT NULL THEN
            -- Garante que a pessoa real entre em cards_contatos como solicitante
            -- (caso tenha sido empresa, e a Beatriz mande mensagem)
            IF v_card_owner_id IS DISTINCT FROM v_contact_id THEN
                INSERT INTO cards_contatos (card_id, contato_id, tipo_vinculo, org_id)
                VALUES (v_existing_card.id, v_contact_id, 'solicitante', v_org_id)
                ON CONFLICT DO NOTHING;
            END IF;

            RETURN jsonb_build_object(
                'id', v_existing_card.id,
                'titulo', v_existing_card.titulo,
                'dedup', TRUE,
                'contact_id', v_contact_id,
                'card_owner_id', v_card_owner_id,
                'contact_created', v_contact_created,
                'contact_name_updated', COALESCE(v_contact_name_updated, FALSE)
            );
        END IF;
    END IF;

    -- 8. Cria card. Título usa nome da empresa se aplicável, senão da pessoa.
    SELECT COALESCE(c.nome, v_name) INTO v_titulo
      FROM contatos c WHERE c.id = v_card_owner_id;
    IF v_titulo IS NULL OR v_titulo = '' THEN v_titulo := v_name; END IF;

    INSERT INTO cards (
        org_id, titulo, pessoa_principal_id, pipeline_id, pipeline_stage_id,
        produto, origem, dono_atual_id, sdr_owner_id, status_comercial, moeda
    ) VALUES (
        v_org_id, v_titulo, v_card_owner_id, v_pipeline_id, v_stage_id,
        v_produto::app_product, 'whatsapp', v_owner_id, v_owner_id, 'aberto', 'BRL'
    ) RETURNING id INTO v_new_card_id;

    -- Se card é da empresa mas a pessoa real é diferente, registra ela em cards_contatos
    IF v_card_owner_id IS DISTINCT FROM v_contact_id THEN
        INSERT INTO cards_contatos (card_id, contato_id, tipo_vinculo, org_id)
        VALUES (v_new_card_id, v_contact_id, 'solicitante', v_org_id)
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'id', v_new_card_id,
        'titulo', v_titulo,
        'dedup', FALSE,
        'contact_id', v_contact_id,
        'card_owner_id', v_card_owner_id,
        'contact_created', v_contact_created,
        'contact_name_updated', COALESCE(v_contact_name_updated, FALSE),
        'forced', p_force_create
    );
END;
$$;

COMMENT ON FUNCTION public.criar_card_de_conversa_echo(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) IS
'Cria card via Echo. Se contato é uma pessoa com empresa_id, o card é vinculado à empresa (pessoa_principal_id = empresa) e a pessoa real entra em cards_contatos como solicitante. Pessoa sem empresa: card linkado à própria pessoa (atendente vincula depois).';

-- ============================================================================
-- 5. Atualizar listar_cards_abertos_do_contato_echo
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listar_cards_abertos_do_contato_echo(
    p_phone              TEXT,
    p_phone_number_id    TEXT DEFAULT NULL,
    p_phone_number_label TEXT DEFAULT NULL,
    p_conversation_id    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id       UUID := requesting_org_id();
    v_linha        RECORD;
    v_produto      TEXT;
    v_phone_raw    TEXT;
    v_phone_clean  TEXT;
    v_phone_norm   TEXT;
    v_phone_id     TEXT;
    v_phone_label  TEXT;
    v_conv         TEXT;
    v_contact_id   UUID;
    v_card_owner_id UUID;
    v_parts        TEXT[];
    v_part         TEXT;
    v_match        TEXT[];
    v_cards        JSONB;
BEGIN
    v_phone_raw   := regexp_replace(COALESCE(p_phone, ''), '^\{(.*)\}$', '\1');
    v_phone_id    := regexp_replace(COALESCE(p_phone_number_id, ''), '^\{(.*)\}$', '\1');
    v_phone_label := regexp_replace(COALESCE(p_phone_number_label, ''), '^\{(.*)\}$', '\1');
    v_conv        := regexp_replace(COALESCE(p_conversation_id, ''), '^\{(.*)\}$', '\1');

    IF position(E'☎' IN v_phone_raw) > 0
       OR v_phone_raw ~* '\}\s*id\s*=\s*\{' THEN
        v_parts := string_to_array(v_phone_raw, E'☎');
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
    v_conv        := NULLIF(v_conv, '');

    v_phone_clean := regexp_replace(v_phone_raw, '\D', '', 'g');
    IF length(v_phone_clean) < 10 OR length(v_phone_clean) > 15 THEN
        RETURN jsonb_build_object('contact_found', FALSE, 'produto', NULL,
            'cards', '[]'::jsonb, 'error', 'phone_invalid');
    END IF;
    v_phone_norm := normalize_phone_brazil(v_phone_clean);

    SELECT produto INTO v_linha
      FROM whatsapp_linha_config
     WHERE (v_phone_id IS NOT NULL AND phone_number_id = v_phone_id)
        OR (v_phone_label IS NOT NULL AND phone_number_label = v_phone_label)
     ORDER BY (phone_number_id = v_phone_id) DESC NULLS LAST
     LIMIT 1;
    v_produto := COALESCE(v_linha.produto, 'TRIPS');

    SELECT cm.contato_id INTO v_contact_id
      FROM contato_meios cm
     WHERE cm.org_id = v_org_id
       AND cm.tipo IN ('whatsapp', 'telefone')
       AND cm.valor_normalizado = v_phone_norm
     ORDER BY cm.is_principal DESC NULLS LAST, cm.created_at ASC
     LIMIT 1;

    IF v_contact_id IS NULL THEN
        SELECT id INTO v_contact_id FROM contatos
         WHERE org_id = v_org_id AND telefone_normalizado = v_phone_norm
           AND deleted_at IS NULL
         ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_contact_id IS NULL THEN
        v_contact_id := find_contact_by_whatsapp(v_phone_clean, v_conv);
    END IF;

    IF v_contact_id IS NULL THEN
        RETURN jsonb_build_object('contact_found', FALSE,
            'produto', v_produto, 'cards', '[]'::jsonb);
    END IF;

    -- NOVO: resolve dono lógico (empresa se aplicável)
    v_card_owner_id := resolve_card_owner_contact(v_contact_id);

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'titulo', c.titulo,
                'produto', c.produto,
                'pipeline_stage_id', c.pipeline_stage_id,
                'etapa_nome', s.nome,
                'fase_nome', ph.name,
                'fase_slug', ph.slug,
                'destinos', c.produto_data->'destinos',
                'epoca', COALESCE(
                    c.produto_data->'data_exata_da_viagem',
                    c.produto_data->'epoca_viagem'
                ),
                'valor_estimado', c.valor_estimado,
                'updated_at', c.updated_at,
                'created_at', c.created_at,
                'dono_nome', COALESCE(p.nome, p.email)
            )
            ORDER BY c.updated_at DESC
        ), '[]'::jsonb
    ) INTO v_cards
      FROM cards c
      LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
      LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
      LEFT JOIN profiles p ON p.id = c.dono_atual_id
     WHERE c.pessoa_principal_id = v_card_owner_id
       AND c.org_id = v_org_id
       AND c.produto::TEXT = v_produto
       AND c.status_comercial NOT IN ('ganho', 'perdido')
       AND c.deleted_at IS NULL;

    RETURN jsonb_build_object(
        'contact_found', TRUE,
        'contact_id', v_contact_id,
        'card_owner_id', v_card_owner_id,
        'produto', v_produto,
        'cards', v_cards
    );
END;
$$;

-- ============================================================================
-- 6. RPC nova: vincular_contato_a_empresa
--    Atendente clica "Vincular à empresa" e a pessoa solta passa a apontar
--    pra empresa. Cards abertos da pessoa migram pra empresa (pessoa_principal
--    vira a empresa, pessoa real entra em cards_contatos).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.vincular_contato_a_empresa(
    p_contato_id UUID,
    p_empresa_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID := requesting_org_id();
    v_contato_org UUID;
    v_empresa_org UUID;
    v_empresa_tipo TEXT;
    v_cards_migrated INT := 0;
BEGIN
    IF p_contato_id IS NULL OR p_empresa_id IS NULL THEN
        RAISE EXCEPTION 'contato_id e empresa_id obrigatórios';
    END IF;
    IF p_contato_id = p_empresa_id THEN
        RAISE EXCEPTION 'contato não pode ser vinculado a si mesmo';
    END IF;

    SELECT org_id INTO v_contato_org FROM contatos WHERE id = p_contato_id;
    SELECT org_id, tipo_contato INTO v_empresa_org, v_empresa_tipo
      FROM contatos WHERE id = p_empresa_id;

    IF v_contato_org IS DISTINCT FROM v_org_id OR v_empresa_org IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'contato ou empresa fora da org atual' USING ERRCODE = '42501';
    END IF;
    IF v_empresa_tipo IS DISTINCT FROM 'empresa' THEN
        RAISE EXCEPTION 'empresa_id deve apontar pra um contato tipo_contato=empresa';
    END IF;

    -- Atualiza vínculo
    UPDATE contatos
       SET empresa_id = p_empresa_id,
           tipo_contato = 'pessoa',
           updated_at = NOW()
     WHERE id = p_contato_id;

    -- Migra cards abertos onde pessoa_principal era a pessoa solta → empresa
    WITH migrados AS (
        UPDATE cards
           SET pessoa_principal_id = p_empresa_id,
               updated_at = NOW()
         WHERE pessoa_principal_id = p_contato_id
           AND status_comercial NOT IN ('ganho', 'perdido')
           AND deleted_at IS NULL
           AND org_id = v_org_id
        RETURNING id
    )
    INSERT INTO cards_contatos (card_id, contato_id, tipo_vinculo, org_id)
    SELECT id, p_contato_id, 'solicitante', v_org_id FROM migrados
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_cards_migrated = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', TRUE,
        'contato_id', p_contato_id,
        'empresa_id', p_empresa_id,
        'cards_migrated', v_cards_migrated
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.vincular_contato_a_empresa(UUID, UUID) TO authenticated;

-- ============================================================================
-- 7. RPC nova: criar_pessoa_da_empresa
-- ============================================================================
CREATE OR REPLACE FUNCTION public.criar_pessoa_da_empresa(
    p_empresa_id UUID,
    p_nome TEXT,
    p_cargo TEXT DEFAULT NULL,
    p_telefone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org_id UUID := requesting_org_id();
    v_empresa_org UUID;
    v_empresa_tipo TEXT;
    v_new_id UUID;
    v_phone_clean TEXT;
    v_phone_norm TEXT;
    v_name_parts TEXT[];
    v_nome TEXT;
    v_sobrenome TEXT;
BEGIN
    IF p_empresa_id IS NULL THEN
        RAISE EXCEPTION 'empresa_id obrigatório';
    END IF;
    IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
        RAISE EXCEPTION 'nome obrigatório';
    END IF;

    SELECT org_id, tipo_contato INTO v_empresa_org, v_empresa_tipo
      FROM contatos WHERE id = p_empresa_id;

    IF v_empresa_org IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'empresa fora da org atual' USING ERRCODE = '42501';
    END IF;
    IF v_empresa_tipo IS DISTINCT FROM 'empresa' THEN
        RAISE EXCEPTION 'empresa_id deve apontar pra um contato tipo_contato=empresa';
    END IF;

    v_name_parts := regexp_split_to_array(trim(p_nome), '\s+');
    v_nome       := v_name_parts[1];
    v_sobrenome  := CASE WHEN array_length(v_name_parts, 1) > 1
                         THEN array_to_string(v_name_parts[2:], ' ')
                         ELSE NULL END;

    v_phone_clean := CASE WHEN p_telefone IS NOT NULL
                          THEN regexp_replace(p_telefone, '\D', '', 'g')
                          ELSE NULL END;
    v_phone_norm := CASE WHEN v_phone_clean IS NOT NULL AND length(v_phone_clean) >= 10
                         THEN normalize_phone_brazil(v_phone_clean)
                         ELSE NULL END;

    INSERT INTO contatos (
        org_id, nome, sobrenome, telefone, telefone_normalizado, email,
        tipo_pessoa, tipo_contato, empresa_id, cargo, origem
    ) VALUES (
        v_org_id, v_nome, v_sobrenome, v_phone_clean, v_phone_norm, p_email,
        'adulto', 'pessoa', p_empresa_id, p_cargo, 'manual_corp'
    ) RETURNING id INTO v_new_id;

    IF v_phone_clean IS NOT NULL AND length(v_phone_clean) >= 10 THEN
        INSERT INTO contato_meios (org_id, contato_id, tipo, valor, valor_normalizado, is_principal, origem)
        VALUES (v_org_id, v_new_id, 'whatsapp', v_phone_clean, v_phone_norm, TRUE, 'manual_corp')
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.criar_pessoa_da_empresa(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 8. RPC para listar pessoas de uma empresa (com seus telefones)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.listar_pessoas_da_empresa(p_empresa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_org_id UUID := requesting_org_id();
    v_result JSONB;
BEGIN
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'nome', c.nome,
                'sobrenome', c.sobrenome,
                'cargo', c.cargo,
                'email', c.email,
                'telefone', c.telefone,
                'created_at', c.created_at,
                'meios', (
                    SELECT COALESCE(jsonb_agg(jsonb_build_object(
                        'id', cm.id, 'tipo', cm.tipo, 'valor', cm.valor,
                        'is_principal', cm.is_principal
                    ) ORDER BY cm.is_principal DESC NULLS LAST, cm.created_at ASC), '[]'::jsonb)
                    FROM contato_meios cm
                    WHERE cm.contato_id = c.id AND cm.org_id = v_org_id
                )
            )
            ORDER BY c.nome ASC
        ), '[]'::jsonb
    ) INTO v_result
      FROM contatos c
     WHERE c.empresa_id = p_empresa_id
       AND c.org_id = v_org_id
       AND c.deleted_at IS NULL
       AND c.tipo_contato = 'pessoa';

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_pessoas_da_empresa(UUID) TO authenticated;

-- ============================================================================
-- 9. Smoke check
-- ============================================================================
DO $smoke$
DECLARE
    v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
      FROM information_schema.columns
     WHERE table_name = 'contatos'
       AND column_name IN ('tipo_contato', 'empresa_id', 'cargo');
    IF v_count <> 3 THEN
        RAISE EXCEPTION 'Colunas tipo_contato/empresa_id/cargo não foram criadas (encontrei %)', v_count;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'resolve_card_owner_contact') THEN
        RAISE EXCEPTION 'Função resolve_card_owner_contact não foi criada';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'vincular_contato_a_empresa') THEN
        RAISE EXCEPTION 'Função vincular_contato_a_empresa não foi criada';
    END IF;

    RAISE NOTICE '✅ Welcome Corporativo: empresa→pessoas instalado';
END $smoke$;

COMMIT;
