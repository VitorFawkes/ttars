-- ============================================================================
-- MIGRATION: Flexibilizar funções "só Trips" (slug planner) para Weddings (closer)
-- Date: 2026-06-15
--
-- Mesmo padrão de 20260615b/c/e: a fase de fechamento é slug 'planner' no Trips e
-- 'closer' no Weddings. Estas 4 funções casavam só por 'planner' e ignoravam o
-- Weddings. Correções ADITIVAS (planner → IN ('planner','closer')), sempre
-- filtrando pela pipeline do card — Trips NÃO muda.
--
-- Recriadas a partir da definição VIVA (pg_get_functiondef) + edição mínima:
--   1. sync_phase_owner_from_legacy  — ramo vendas_owner_id (grava card_phase_owners)
--   2. criar_sub_card                — etapa-alvo do sub-card
--   3. criar_card_de_conversa_echo   — etapa inicial do card do Echo (WhatsApp)
--   4. analytics_pipeline_current    — balde 'planner' do by_phase passa a contar a
--      fase de fechamento (planner+closer); 'closer' sai do balde 'pos-venda'.
--      Chaves do JSON mantidas → sem mudança no frontend.
-- ============================================================================

BEGIN;

-- 1) sync_phase_owner_from_legacy ----------------------------------------
CREATE OR REPLACE FUNCTION public.sync_phase_owner_from_legacy()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_phase_id UUID;
    v_pipeline_id UUID;
BEGIN
    v_pipeline_id := NEW.pipeline_id;

    IF v_pipeline_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- sdr_owner_id changed
    IF NEW.sdr_owner_id IS DISTINCT FROM OLD.sdr_owner_id AND NEW.sdr_owner_id IS NOT NULL THEN
        SELECT ph.id INTO v_phase_id
        FROM pipeline_phases ph
        JOIN pipeline_stages s ON s.phase_id = ph.id
        WHERE ph.slug = 'sdr'
          AND s.pipeline_id = v_pipeline_id
        LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.sdr_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    -- vendas_owner_id changed (fase de fechamento: planner=Trips, closer=Weddings)
    IF NEW.vendas_owner_id IS DISTINCT FROM OLD.vendas_owner_id AND NEW.vendas_owner_id IS NOT NULL THEN
        SELECT ph.id INTO v_phase_id
        FROM pipeline_phases ph
        JOIN pipeline_stages s ON s.phase_id = ph.id
        WHERE ph.slug IN ('planner', 'closer')
          AND s.pipeline_id = v_pipeline_id
        LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.vendas_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    -- pos_owner_id changed
    IF NEW.pos_owner_id IS DISTINCT FROM OLD.pos_owner_id AND NEW.pos_owner_id IS NOT NULL THEN
        SELECT ph.id INTO v_phase_id
        FROM pipeline_phases ph
        JOIN pipeline_stages s ON s.phase_id = ph.id
        WHERE ph.slug = 'pos_venda'
          AND s.pipeline_id = v_pipeline_id
        LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.pos_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    -- concierge_owner_id changed
    IF NEW.concierge_owner_id IS DISTINCT FROM OLD.concierge_owner_id AND NEW.concierge_owner_id IS NOT NULL THEN
        SELECT ph.id INTO v_phase_id
        FROM pipeline_phases ph
        JOIN pipeline_stages s ON s.phase_id = ph.id
        WHERE ph.slug = 'concierge'
          AND s.pipeline_id = v_pipeline_id
        LIMIT 1;
        IF v_phase_id IS NOT NULL THEN
            INSERT INTO card_phase_owners (card_id, phase_id, owner_id, org_id)
            VALUES (NEW.id, v_phase_id, NEW.concierge_owner_id, NEW.org_id)
            ON CONFLICT (card_id, phase_id) DO UPDATE SET owner_id = EXCLUDED.owner_id, assigned_at = now();
        END IF;
    END IF;

    RETURN NEW;
END;
$function$
;

-- 2) criar_sub_card ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_sub_card(p_parent_id uuid, p_titulo text, p_descricao text, p_mode text DEFAULT 'incremental'::text, p_merge_config jsonb DEFAULT NULL::jsonb, p_category text DEFAULT 'addition'::text, p_valor_estimado numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_parent RECORD;
    v_target_stage_id UUID;
    v_new_card_id UUID;
    v_user_id UUID;
    v_sub_produto_data JSONB;
    v_category TEXT;
    v_valor NUMERIC;
    v_require_pos_venda BOOLEAN;
    v_parent_phase_slug TEXT;
    v_account_id UUID;
    v_setting_value TEXT;
BEGIN
    v_user_id := auth.uid();
    v_category := CASE WHEN p_category IN ('addition', 'change') THEN p_category ELSE 'addition' END;
    v_valor := COALESCE(p_valor_estimado, 0);

    -- 1. Validar card pai (carrega slug da fase do pai)
    SELECT c.*, s.fase, s.phase_id, c.pipeline_id, pp.slug AS parent_phase_slug
    INTO v_parent
    FROM cards c
    JOIN pipeline_stages s ON c.pipeline_stage_id = s.id
    LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    WHERE c.id = p_parent_id
      AND c.deleted_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Card principal nao encontrado');
    END IF;

    IF v_parent.card_type = 'sub_card' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nao e possivel criar sub-card de um sub-card');
    END IF;

    IF v_parent.is_group_parent THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nao e possivel criar item adicional em card agrupador');
    END IF;

    IF v_parent.card_type = 'future_opportunity' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nao e possivel criar sub-card de uma oportunidade futura');
    END IF;

    -- 1b. Regra configuravel via integration_settings (namespace card_rules.*)
    SELECT COALESCE(o.parent_org_id, o.id) INTO v_account_id
    FROM organizations o
    WHERE o.id = v_parent.org_id;

    SELECT value INTO v_setting_value
    FROM integration_settings
    WHERE key = 'card_rules.subcard_requires_pos_venda'
      AND org_id = v_account_id
      AND produto IS NULL
    LIMIT 1;

    v_require_pos_venda := (COALESCE(v_setting_value, 'true') = 'true');
    v_parent_phase_slug := v_parent.parent_phase_slug;

    IF v_require_pos_venda AND v_parent_phase_slug IS DISTINCT FROM 'pos_venda' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Sub-cards so podem ser criados quando o card principal esta em Pos-venda. Para afrouxar essa regra, ajuste em Gerenciador de Secoes -> Regras de Sub-Cards.'
        );
    END IF;

    -- 2. Determinar estagio inicial via cascata de fallbacks
    SELECT sub_card_default_stage_id INTO v_target_stage_id
    FROM pipelines WHERE id = v_parent.pipeline_id;

    IF v_target_stage_id IS NULL THEN
        SELECT s.id INTO v_target_stage_id
        FROM pipeline_stages s
        JOIN pipeline_phases ph ON ph.id = s.phase_id
        WHERE ph.slug IN ('planner', 'closer')
          AND s.pipeline_id = v_parent.pipeline_id
          AND s.ativo = true
          AND s.nome = 'Proposta em Construcao'
        LIMIT 1;

        IF v_target_stage_id IS NULL THEN
            SELECT s.id INTO v_target_stage_id
            FROM pipeline_stages s
            JOIN pipeline_phases ph ON ph.id = s.phase_id
            WHERE ph.slug IN ('planner', 'closer')
              AND s.pipeline_id = v_parent.pipeline_id
              AND s.ativo = true
            ORDER BY s.ordem ASC
            LIMIT 1;
        END IF;
    END IF;

    IF v_target_stage_id IS NULL THEN
        SELECT s.id INTO v_target_stage_id
        FROM pipeline_stages s
        JOIN pipeline_phases ph ON ph.id = s.phase_id
        WHERE ph.slug = 'pos_venda'
          AND s.pipeline_id = v_parent.pipeline_id
          AND s.ativo = true
        ORDER BY s.ordem ASC
        LIMIT 1;
    END IF;

    IF v_target_stage_id IS NULL THEN
        v_target_stage_id := v_parent.pipeline_stage_id;
    END IF;

    IF v_target_stage_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Nao foi possivel determinar a etapa inicial do sub-card');
    END IF;

    -- 3. Preparar produto_data
    v_sub_produto_data := COALESCE(v_parent.produto_data, '{}'::jsonb);
    v_sub_produto_data := v_sub_produto_data
        - 'numero_venda_monde'
        - 'numeros_venda_monde_historico'
        - 'taxa_planejamento'
        - 'orcamento'
        - 'data_prevista_fechamento';

    -- 4. Criar o sub-card
    INSERT INTO cards (
        titulo, card_type, sub_card_mode, sub_card_status, sub_card_category, parent_card_id,
        pipeline_id, pipeline_stage_id, stage_entered_at,
        pessoa_principal_id, produto, produto_data, moeda,
        data_viagem_inicio, data_viagem_fim, valor_estimado,
        dono_atual_id, sdr_owner_id, vendas_owner_id, pos_owner_id, concierge_owner_id,
        status_comercial, created_by, created_at, updated_at
    )
    VALUES (
        p_titulo, 'sub_card', 'incremental', 'active', v_category, p_parent_id,
        v_parent.pipeline_id, v_target_stage_id, now(),
        v_parent.pessoa_principal_id, v_parent.produto, v_sub_produto_data, v_parent.moeda,
        v_parent.data_viagem_inicio, v_parent.data_viagem_fim, v_valor,
        COALESCE(v_parent.vendas_owner_id, v_user_id), v_parent.sdr_owner_id,
        v_parent.vendas_owner_id, v_parent.pos_owner_id, v_parent.concierge_owner_id,
        'aberto', v_user_id, now(), now()
    )
    RETURNING id INTO v_new_card_id;

    -- 4b. Copiar acompanhantes do card pai para o sub-card
    INSERT INTO cards_contatos (card_id, contato_id, tipo_viajante, ordem, tipo_vinculo, org_id, created_at)
    SELECT v_new_card_id, contato_id, tipo_viajante, ordem, tipo_vinculo, org_id, now()
    FROM cards_contatos
    WHERE card_id = p_parent_id
      AND contato_id IS DISTINCT FROM v_parent.pessoa_principal_id;

    -- 5. Log
    INSERT INTO sub_card_sync_log (sub_card_id, parent_card_id, action, new_value, metadata, created_by)
    VALUES (
        v_new_card_id, p_parent_id, 'created',
        jsonb_build_object('titulo', p_titulo, 'mode', 'incremental', 'category', v_category, 'valor_estimado', v_valor),
        jsonb_build_object('target_stage_id', v_target_stage_id),
        v_user_id
    );

    -- 6. Activity no pai
    INSERT INTO activities (card_id, tipo, descricao, metadata, created_by, created_at)
    VALUES (
        p_parent_id, 'sub_card_created',
        CASE v_category
            WHEN 'change' THEN 'Mudanca na viagem: ' || p_titulo
            ELSE 'Item da viagem criado: ' || p_titulo
        END,
        jsonb_build_object('sub_card_id', v_new_card_id, 'sub_card_titulo', p_titulo, 'sub_card_category', v_category),
        v_user_id, now()
    );

    -- 7. Tarefa solicitacao_mudanca REMOVIDA (2026-05-18)
    --    Decisao de produto: Travel Planner cria tarefas manualmente, caso a caso.

    RETURN jsonb_build_object(
        'success', true,
        'sub_card_id', v_new_card_id,
        'mode', 'incremental',
        'category', v_category,
        'parent_id', p_parent_id
    );
END;
$function$
;

-- 3) criar_card_de_conversa_echo -----------------------------------------
CREATE OR REPLACE FUNCTION public.criar_card_de_conversa_echo(p_conversation_id text, p_name text, p_phone text, p_phone_number_id text DEFAULT NULL::text, p_phone_number_label text DEFAULT NULL::text, p_agent_email text DEFAULT NULL::text, p_force_create boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     WHERE s.pipeline_id = v_pipeline_id AND ph.slug IN ('planner', 'closer')
       AND s.nome ILIKE 'oportunidade'
     ORDER BY s.ordem ASC LIMIT 1;
    IF v_stage_id IS NULL THEN
        SELECT s.id INTO v_stage_id
          FROM pipeline_stages s
          JOIN pipeline_phases ph ON ph.id = s.phase_id
         WHERE s.pipeline_id = v_pipeline_id AND ph.slug IN ('planner', 'closer')
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
$function$
;

-- 4) analytics_pipeline_current ------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_pipeline_current(p_product text DEFAULT NULL::text, p_owner_ids uuid[] DEFAULT NULL::uuid[], p_tag_ids uuid[] DEFAULT NULL::uuid[], p_date_ref text DEFAULT 'stage'::text, p_value_min numeric DEFAULT NULL::numeric, p_value_max numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_result JSONB;
BEGIN
    WITH open_cards AS (
        SELECT
            c.id, c.titulo, c.pipeline_stage_id, c.dono_atual_id,
            COALESCE(c.valor_final, c.valor_estimado, 0) AS valor,
            COALESCE(c.receita, 0) AS receita_val,
            c.produto, c.created_at, c.stage_entered_at,
            CASE WHEN p_date_ref = 'created'
                 THEN EXTRACT(EPOCH FROM (NOW() - c.created_at)) / 86400.0
                 ELSE EXTRACT(EPOCH FROM (NOW() - COALESCE(c.stage_entered_at, c.updated_at, c.created_at))) / 86400.0
            END AS days_in_stage,
            s.nome AS stage_nome, s.ordem, s.sla_hours,
            pp.label AS fase, pp.slug AS fase_slug, pp.order_index AS fase_order,
            p.nome AS owner_nome, co.nome AS pessoa_nome
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        LEFT JOIN profiles p ON p.id = c.dono_atual_id
        LEFT JOIN contatos co ON co.id = c.pessoa_principal_id
        WHERE c.org_id = requesting_org_id()   -- ✨ FIX P0: isolamento de org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.data_fechamento IS NULL
          AND COALESCE(s.is_won, false) = false
          AND COALESCE(s.is_lost, false) = false
          AND s.ativo = true
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND (p_value_min IS NULL OR COALESCE(c.valor_final, c.valor_estimado, 0) >= p_value_min)
          AND (p_value_max IS NULL OR COALESCE(c.valor_final, c.valor_estimado, 0) <= p_value_max)
    ),
    kpis AS (
        SELECT jsonb_build_object(
            'total_open', COUNT(*),
            'total_value', COALESCE(SUM(valor), 0),
            'total_receita', COALESCE(SUM(receita_val), 0),
            'avg_ticket', CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(valor), 0) / COUNT(*)::NUMERIC, 0) ELSE 0 END,
            'avg_receita_ticket', CASE WHEN COUNT(*) > 0 THEN ROUND(COALESCE(SUM(receita_val), 0) / COUNT(*)::NUMERIC, 0) ELSE 0 END,
            'avg_age_days', ROUND(COALESCE(AVG(days_in_stage), 0)::NUMERIC, 1),
            'sla_breach_count', COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours),
            'sla_breach_pct', ROUND(
                CASE WHEN COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0) > 0
                THEN COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours)::NUMERIC
                     / COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0)::NUMERIC * 100
                ELSE 0 END, 1)
        ) AS val FROM open_cards
    ),
    stages AS (
        SELECT jsonb_agg(row_data ORDER BY fase_order, ordem) AS val FROM (
            SELECT jsonb_build_object(
                'stage_id', pipeline_stage_id, 'stage_nome', stage_nome, 'fase', fase, 'fase_slug', fase_slug,
                'produto', produto, 'ordem', ordem, 'card_count', COUNT(*),
                'valor_total', COALESCE(SUM(valor), 0), 'receita_total', COALESCE(SUM(receita_val), 0),
                'avg_days', ROUND(AVG(days_in_stage)::NUMERIC, 1),
                'sla_breach_count', COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours)
            ) AS row_data, MIN(fase_order) AS fase_order, MIN(ordem) AS ordem
            FROM open_cards
            GROUP BY pipeline_stage_id, stage_nome, fase, fase_slug, produto, open_cards.ordem
        ) sub
    ),
    aging AS (
        SELECT jsonb_agg(row_data ORDER BY fase_order, ordem) AS val FROM (
            SELECT jsonb_build_object(
                'stage_id', pipeline_stage_id, 'stage_nome', stage_nome, 'fase', fase, 'fase_slug', fase_slug,
                'bucket_0_3', COUNT(*) FILTER (WHERE days_in_stage <= 3),
                'bucket_3_7', COUNT(*) FILTER (WHERE days_in_stage > 3 AND days_in_stage <= 7),
                'bucket_7_14', COUNT(*) FILTER (WHERE days_in_stage > 7 AND days_in_stage <= 14),
                'bucket_14_plus', COUNT(*) FILTER (WHERE days_in_stage > 14)
            ) AS row_data, MIN(fase_order) AS fase_order, MIN(ordem) AS ordem
            FROM open_cards GROUP BY pipeline_stage_id, stage_nome, fase, fase_slug
        ) sub
    ),
    owners AS (
        SELECT jsonb_agg(row_data ORDER BY total_cards DESC) AS val FROM (
            SELECT jsonb_build_object(
                'owner_id', dono_atual_id, 'owner_nome', COALESCE(owner_nome, 'Não atribuído'),
                'total_cards', COUNT(*), 'total_value', COALESCE(SUM(valor), 0),
                'total_receita', COALESCE(SUM(receita_val), 0),
                'avg_age_days', ROUND(AVG(days_in_stage)::NUMERIC, 1),
                'sla_breach', COUNT(*) FILTER (WHERE sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours),
                'by_phase', jsonb_build_object(
                    'sdr', COUNT(*) FILTER (WHERE fase_slug = 'sdr'),
                    'planner', COUNT(*) FILTER (WHERE fase_slug IN ('planner', 'closer')),
                    'pos-venda', COUNT(*) FILTER (WHERE fase_slug NOT IN ('sdr', 'planner', 'closer', 'resolucao'))),
                'by_phase_value', jsonb_build_object(
                    'sdr', COALESCE(SUM(valor) FILTER (WHERE fase_slug = 'sdr'), 0),
                    'planner', COALESCE(SUM(valor) FILTER (WHERE fase_slug IN ('planner', 'closer')), 0),
                    'pos-venda', COALESCE(SUM(valor) FILTER (WHERE fase_slug NOT IN ('sdr', 'planner', 'closer', 'resolucao')), 0)),
                'by_phase_receita', jsonb_build_object(
                    'sdr', COALESCE(SUM(receita_val) FILTER (WHERE fase_slug = 'sdr'), 0),
                    'planner', COALESCE(SUM(receita_val) FILTER (WHERE fase_slug IN ('planner', 'closer')), 0),
                    'pos-venda', COALESCE(SUM(receita_val) FILTER (WHERE fase_slug NOT IN ('sdr', 'planner', 'closer', 'resolucao')), 0))
            ) AS row_data, COUNT(*) AS total_cards
            FROM open_cards GROUP BY dono_atual_id, owner_nome
        ) sub
    ),
    top_deals AS (
        SELECT jsonb_agg(row_data ORDER BY dis DESC) AS val FROM (
            SELECT jsonb_build_object(
                'card_id', id, 'titulo', titulo, 'stage_nome', stage_nome, 'fase', fase, 'fase_slug', fase_slug,
                'owner_nome', COALESCE(owner_nome, 'Não atribuído'), 'owner_id', dono_atual_id,
                'valor_total', valor, 'receita', receita_val,
                'days_in_stage', ROUND(days_in_stage::NUMERIC, 1), 'sla_hours', sla_hours,
                'is_sla_breach', (sla_hours IS NOT NULL AND sla_hours > 0 AND days_in_stage * 24 > sla_hours),
                'pessoa_nome', pessoa_nome
            ) AS row_data, days_in_stage AS dis
            FROM open_cards ORDER BY days_in_stage DESC LIMIT 15
        ) sub
    ),
    tasks AS (
        SELECT jsonb_build_object(
            'total_created', COUNT(t.id),
            'total_completed', COUNT(t.id) FILTER (WHERE t.concluida = true),
            'total_pending', COUNT(t.id) FILTER (WHERE t.concluida = false),
            'total_overdue', COUNT(t.id) FILTER (WHERE t.concluida = false AND t.data_vencimento < NOW()),
            'completion_rate', ROUND(CASE WHEN COUNT(t.id) > 0
                THEN COUNT(t.id) FILTER (WHERE t.concluida = true)::NUMERIC / COUNT(t.id)::NUMERIC * 100
                ELSE 0 END, 1),
            'by_type', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('tipo', sub.tipo, 'total', sub.type_total,
                    'completed', sub.type_completed, 'pending', sub.type_pending, 'overdue', sub.type_overdue
                ) ORDER BY sub.type_total DESC)
                FROM (SELECT t2.tipo, COUNT(*) AS type_total,
                    COUNT(*) FILTER (WHERE t2.concluida = true) AS type_completed,
                    COUNT(*) FILTER (WHERE t2.concluida = false) AS type_pending,
                    COUNT(*) FILTER (WHERE t2.concluida = false AND t2.data_vencimento < NOW()) AS type_overdue
                FROM tarefas t2 INNER JOIN open_cards oc2 ON oc2.id = t2.card_id
                WHERE t2.deleted_at IS NULL GROUP BY t2.tipo) sub), '[]'::jsonb),
            'by_stage', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('stage_id', sub.pipeline_stage_id,
                    'stage_nome', sub.stage_nome, 'fase', sub.fase, 'fase_slug', sub.fase_slug,
                    'card_count', sub.card_count, 'total', sub.stage_total,
                    'completed', sub.stage_completed, 'pending', sub.stage_pending, 'overdue', sub.stage_overdue
                ) ORDER BY sub.fase_order, sub.ordem)
                FROM (SELECT oc3.pipeline_stage_id, oc3.stage_nome, oc3.fase, oc3.fase_slug,
                    MIN(oc3.fase_order) AS fase_order, MIN(oc3.ordem) AS ordem,
                    COUNT(DISTINCT oc3.id) AS card_count, COUNT(t3.id) AS stage_total,
                    COUNT(t3.id) FILTER (WHERE t3.concluida = true) AS stage_completed,
                    COUNT(t3.id) FILTER (WHERE t3.concluida = false) AS stage_pending,
                    COUNT(t3.id) FILTER (WHERE t3.concluida = false AND t3.data_vencimento < NOW()) AS stage_overdue
                FROM open_cards oc3 LEFT JOIN tarefas t3 ON t3.card_id = oc3.id AND t3.deleted_at IS NULL
                GROUP BY oc3.pipeline_stage_id, oc3.stage_nome, oc3.fase, oc3.fase_slug) sub), '[]'::jsonb),
            'by_owner', COALESCE((
                SELECT jsonb_agg(jsonb_build_object('owner_id', sub.dono_atual_id,
                    'owner_nome', COALESCE(sub.owner_nome, 'Não atribuído'), 'card_count', sub.card_count,
                    'total', sub.owner_total, 'completed', sub.owner_completed,
                    'pending', sub.owner_pending, 'overdue', sub.owner_overdue
                ) ORDER BY sub.owner_total DESC)
                FROM (SELECT oc4.dono_atual_id, oc4.owner_nome,
                    COUNT(DISTINCT oc4.id) AS card_count, COUNT(t4.id) AS owner_total,
                    COUNT(t4.id) FILTER (WHERE t4.concluida = true) AS owner_completed,
                    COUNT(t4.id) FILTER (WHERE t4.concluida = false) AS owner_pending,
                    COUNT(t4.id) FILTER (WHERE t4.concluida = false AND t4.data_vencimento < NOW()) AS owner_overdue
                FROM open_cards oc4 LEFT JOIN tarefas t4 ON t4.card_id = oc4.id AND t4.deleted_at IS NULL
                GROUP BY oc4.dono_atual_id, oc4.owner_nome) sub), '[]'::jsonb)
        ) AS val FROM tarefas t INNER JOIN open_cards oc ON oc.id = t.card_id WHERE t.deleted_at IS NULL
    )
    SELECT jsonb_build_object(
        'kpis', (SELECT val FROM kpis),
        'stages', COALESCE((SELECT val FROM stages), '[]'::jsonb),
        'aging', COALESCE((SELECT val FROM aging), '[]'::jsonb),
        'owners', COALESCE((SELECT val FROM owners), '[]'::jsonb),
        'top_deals', COALESCE((SELECT val FROM top_deals), '[]'::jsonb),
        'tasks', COALESCE((SELECT val FROM tasks), '{}'::jsonb)
    ) INTO v_result;
    RETURN v_result;
END;
$function$
;

COMMIT;
