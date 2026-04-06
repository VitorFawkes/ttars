-- ============================================================================
-- MIGRATION: Enforcement de stage_field_config no banco
-- Date: 2026-04-06
--
-- CONTEXTO
-- Quality gate hoje vive 100% no frontend. Existem ~20 caminhos no código
-- (mobile, integrações, edge functions, scripts, REST direto) que dão
-- UPDATE em cards.pipeline_stage_id sem passar pelo useQualityGate. Esta
-- migration adiciona uma defesa em profundidade no banco: trigger BEFORE
-- UPDATE que valida requisitos de stage antes de qualquer move, vindo de
-- onde for.
--
-- ESCOPO
-- - Tipos validados: 'field' (waterfall card → produto_data → briefing_inicial)
--   e 'rule' (lost_reason_required, contato_principal_required,
--   contato_principal_completo).
-- - Tipos NÃO validados (deferido para PR futuro): 'task', 'proposal',
--   'document'. Esses exigem joins em outras tabelas e são menos comuns.
--
-- BYPASS — 2 mecanismos
-- 1. GUC `app.bypass_stage_requirements='true'` (transação-local via
--    set_config(_,_,true)). Usado pelas funções SQL legítimas:
--    bulk_create_pos_venda_cards, revert_pos_venda_import_items,
--    handle_card_auto_advance (recriadas aqui com a linha no início).
-- 2. JWT role = 'service_role' (detectado via request.jwt.claims). Cobre
--    automaticamente edge functions, integrações inbound (AC webhook,
--    cadence-engine, monde sync, public-api) e qualquer caller usando
--    a chave service_role. UI autenticada usa role='authenticated' e
--    continua sendo validada.
--
-- Caminhos efetivamente bloqueados pela trigger:
-- - REST/SQL direto via curl com user JWT (não é nosso caso, mas plausível)
-- - Frontend que esquece de chamar useQualityGate antes do UPDATE
-- - Qualquer caller futuro que não esteja em service_role e não setou GUC
--
-- MENSAGEM DE ERRO
-- O trigger lança exception com message='STAGE_REQUIREMENTS_VIOLATION' e
-- DETAIL=JSON com a lista de campos faltando. Frontend pode parsear o
-- erro do supabase-js (.message + .details) e mostrar o QualityGateModal
-- traduzido. Mensagem human-readable também vai no HINT como fallback.
-- ============================================================================

-- ─── 1. validate_stage_requirements ─────────────────────────────────────────
-- Espelha a lógica de src/hooks/useQualityGate.ts (validateMove + checkRule).
-- Retorna jsonb { valid, missing[] }. Idempotente, sem efeitos colaterais.

-- Staging tem uma versão antiga (legado de _archived/) com return type
-- TABLE(valid boolean, missing_requirements jsonb). Precisamos DROP antes
-- porque CREATE OR REPLACE não pode mudar return type. Ninguém chama essa
-- versão antiga (verificado via grep no monorepo).
DROP FUNCTION IF EXISTS public.validate_stage_requirements(uuid, uuid);

CREATE OR REPLACE FUNCTION public.validate_stage_requirements(
    p_card_id uuid,
    p_target_stage_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_card RECORD;
    v_rule RECORD;
    v_value TEXT;
    v_missing TEXT[] := ARRAY[]::TEXT[];
    v_label TEXT;
    v_contato RECORD;
BEGIN
    SELECT
        c.id,
        c.produto_data,
        c.briefing_inicial,
        c.pessoa_principal_id,
        c.motivo_perda_id,
        c.motivo_perda_comentario
    INTO v_card
    FROM cards c
    WHERE c.id = p_card_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', true, 'missing', '[]'::jsonb);
    END IF;

    -- Itera sobre as regras blocantes do stage destino
    FOR v_rule IN
        SELECT
            field_key,
            requirement_type,
            requirement_label,
            proposal_min_status,
            task_tipo,
            task_require_completed
        FROM stage_field_config
        WHERE stage_id = p_target_stage_id
          AND is_required = true
          AND COALESCE(is_blocking, true) = true
          AND requirement_type IN ('field', 'rule')
    LOOP
        v_label := COALESCE(v_rule.requirement_label, v_rule.field_key, 'Requisito');

        IF v_rule.requirement_type = 'field' AND v_rule.field_key IS NOT NULL THEN
            -- Waterfall: produto_data → briefing_inicial
            -- (cards não tem colunas dinâmicas pra field_keys customizados)
            v_value := COALESCE(
                v_card.produto_data ->> v_rule.field_key,
                v_card.briefing_inicial ->> v_rule.field_key
            );

            -- Trata jsonb nested: se for objeto/array vazio, considera vazio
            IF v_value IS NOT NULL THEN
                IF v_value = '' OR v_value = '{}' OR v_value = '[]' OR v_value = 'null' THEN
                    v_value := NULL;
                END IF;
            END IF;

            IF v_value IS NULL THEN
                v_missing := array_append(v_missing, v_label);
            END IF;

        ELSIF v_rule.requirement_type = 'rule' AND v_rule.field_key IS NOT NULL THEN
            -- Regras especiais (espelham useQualityGate.checkRequirement case 'rule')
            IF v_rule.field_key = 'lost_reason_required' THEN
                IF v_card.motivo_perda_id IS NULL
                   AND (v_card.motivo_perda_comentario IS NULL
                        OR btrim(v_card.motivo_perda_comentario) = '') THEN
                    v_missing := array_append(v_missing, v_label);
                END IF;

            ELSIF v_rule.field_key = 'contato_principal_required' THEN
                IF v_card.pessoa_principal_id IS NULL THEN
                    v_missing := array_append(v_missing, v_label);
                END IF;

            ELSIF v_rule.field_key = 'contato_principal_completo' THEN
                IF v_card.pessoa_principal_id IS NULL THEN
                    v_missing := array_append(v_missing, v_label);
                ELSE
                    SELECT nome, sobrenome, telefone, email, cpf
                    INTO v_contato
                    FROM contatos
                    WHERE id = v_card.pessoa_principal_id;

                    IF NOT FOUND
                       OR v_contato.nome IS NULL OR v_contato.nome = ''
                       OR v_contato.sobrenome IS NULL OR v_contato.sobrenome = ''
                       OR v_contato.telefone IS NULL OR v_contato.telefone = ''
                       OR v_contato.email IS NULL OR v_contato.email = ''
                       OR v_contato.cpf IS NULL OR v_contato.cpf = '' THEN
                        v_missing := array_append(v_missing, v_label);
                    END IF;
                END IF;
            END IF;
            -- Outras regras desconhecidas: passam (não bloqueia o que não entende)
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'valid', array_length(v_missing, 1) IS NULL,
        'missing', to_jsonb(v_missing)
    );
END;
$fn$;

COMMENT ON FUNCTION public.validate_stage_requirements(uuid, uuid) IS
'Valida se um card tem os campos/regras obrigatórios para entrar num stage. '
'Espelha a lógica de useQualityGate.ts (frontend). Retorna {valid, missing[]}.';

-- ─── 2. Trigger function ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_stage_requirements_on_card_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_result jsonb;
    v_missing_text text;
    v_jwt_role text;
BEGIN
    -- BYPASS 1: GUC transaction-local. Funções SQL legítimas (revert, import,
    -- auto_advance) setam isso no início via set_config(_,_,true).
    IF current_setting('app.bypass_stage_requirements', true) = 'true' THEN
        RETURN NEW;
    END IF;

    -- BYPASS 2: Service role (edge functions, integrações, scripts admin).
    -- AC webhook (integration-process), cadence-engine, monde sync, public-api
    -- e qualquer outro caller com chave service_role passa direto. UI
    -- autenticada usa role='authenticated' e continua sendo validada.
    BEGIN
        v_jwt_role := current_setting('request.jwt.claims', true)::jsonb->>'role';
        IF v_jwt_role = 'service_role' THEN
            RETURN NEW;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- JWT claims não disponíveis (chamada direta de psql, dblink, etc) —
        -- continua para validação. Caller pode usar GUC se precisar pular.
        NULL;
    END;

    -- Só atua se o stage realmente mudou
    IF NEW.pipeline_stage_id IS NOT DISTINCT FROM OLD.pipeline_stage_id THEN
        RETURN NEW;
    END IF;

    -- Pula se NEW.pipeline_stage_id for null (limpando stage)
    IF NEW.pipeline_stage_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_result := public.validate_stage_requirements(NEW.id, NEW.pipeline_stage_id);

    IF (v_result->>'valid')::boolean IS FALSE THEN
        v_missing_text := array_to_string(
            ARRAY(SELECT jsonb_array_elements_text(v_result->'missing')),
            ', '
        );

        RAISE EXCEPTION 'STAGE_REQUIREMENTS_VIOLATION'
            USING DETAIL = v_result::text,
                  HINT = 'Campos pendentes para mover este card: ' || v_missing_text,
                  ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.enforce_stage_requirements_on_card_move() IS
'Trigger BEFORE UPDATE em cards.pipeline_stage_id que valida requisitos do '
'stage destino. Bloqueia se inválido, exceto quando GUC '
'app.bypass_stage_requirements=true (set_config local à transação).';

-- ─── 3. Trigger ─────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_enforce_stage_requirements ON public.cards;

CREATE TRIGGER trg_enforce_stage_requirements
BEFORE UPDATE OF pipeline_stage_id ON public.cards
FOR EACH ROW
EXECUTE FUNCTION public.enforce_stage_requirements_on_card_move();

-- ─── 4. Recriar funções legítimas com bypass ────────────────────────────────
-- A única alteração nessas funções é o `PERFORM set_config(...)` no início.
-- O resto do corpo é idêntico ao que está em produção em 2026-04-06.

-- 4.1 handle_card_auto_advance
-- Original: 20260319_auto_advance_stages.sql
-- Justificativa do bypass: é uma automação interna (AFTER trigger) que
-- avança cards em stages-marker (Ganho SDR/Planner). O UPDATE original
-- (chamado pelo usuário/RPC) já passou pela validação do trigger, então
-- a re-validação no auto-advance é redundante e quebraria fluxos legítimos.

CREATE OR REPLACE FUNCTION public.handle_card_auto_advance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_stage RECORD;
    v_current_phase_order INT;
    v_next_stage_id UUID;
BEGIN
    -- Bypass: o UPDATE original já foi validado, não duplicar
    PERFORM set_config('app.bypass_stage_requirements', 'true', true);

    -- Guarda de recursão
    IF pg_trigger_depth() > 1 THEN
        RETURN NULL;
    END IF;

    IF OLD.pipeline_stage_id IS NOT DISTINCT FROM NEW.pipeline_stage_id THEN
        RETURN NULL;
    END IF;

    SELECT s.auto_advance, s.pipeline_id, s.ordem, s.phase_id
    INTO v_stage
    FROM pipeline_stages s
    WHERE s.id = NEW.pipeline_stage_id;

    IF v_stage IS NULL OR v_stage.auto_advance IS NOT TRUE THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(ph.order_index, 999)
    INTO v_current_phase_order
    FROM pipeline_phases ph
    WHERE ph.id = v_stage.phase_id;

    IF v_current_phase_order IS NULL THEN
        v_current_phase_order := 999;
    END IF;

    SELECT s.id INTO v_next_stage_id
    FROM pipeline_stages s
    LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
    WHERE s.pipeline_id = v_stage.pipeline_id
      AND s.ativo = true
      AND s.id != NEW.pipeline_stage_id
      AND (
          COALESCE(ph.order_index, 999) > v_current_phase_order
          OR (
              COALESCE(ph.order_index, 999) = v_current_phase_order
              AND s.ordem > v_stage.ordem
          )
      )
    ORDER BY COALESCE(ph.order_index, 999), s.ordem
    LIMIT 1;

    IF v_next_stage_id IS NULL THEN
        RETURN NULL;
    END IF;

    UPDATE cards
    SET pipeline_stage_id = v_next_stage_id,
        updated_at = NOW()
    WHERE id = NEW.id;

    RETURN NULL;
END;
$fn$;

-- 4.2 bulk_create_pos_venda_cards
-- Original: 20260331_pos_venda_revert_system.sql
-- Justificativa: import em massa de cards legados da Monde para Pós-Venda.
-- Os cards são criados/atualizados em bulk e o usuário (admin) está
-- conscientemente importando dados que podem não ter todos os campos.

CREATE OR REPLACE FUNCTION public.bulk_create_pos_venda_cards(
    p_trips JSONB,
    p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_trip JSONB;
    v_product JSONB;
    v_pax_name TEXT;
    v_pax_idx INTEGER;

    v_cards_created INTEGER := 0;
    v_cards_updated INTEGER := 0;
    v_contacts_created INTEGER := 0;
    v_products_imported INTEGER := 0;

    v_card_id UUID;
    v_existing_card_id UUID;
    v_contato_id UUID;
    v_item_id UUID;
    v_nome TEXT;
    v_sobrenome TEXT;
    v_nome_parts TEXT[];
    v_total_venda NUMERIC(12,2);
    v_total_custo NUMERIC(12,2);
    v_receita NUMERIC(12,2);

    v_acomp_name TEXT;
    v_acomp_contato_id UUID;
    v_acomp_idx INTEGER;
    v_existing_acomp BOOLEAN;

    v_venda_num TEXT;
    v_existing_pd JSONB;
    v_historico JSONB;

    v_results JSONB := '[]'::JSONB;
    v_prev_state JSONB;
    v_prev_stage UUID;
    v_prev_inicio DATE;
    v_prev_fim DATE;
    v_trip_idx INTEGER := 0;
BEGIN
    -- Bypass: import legado, dados podem estar incompletos por design
    PERFORM set_config('app.bypass_stage_requirements', 'true', true);

    FOR v_trip IN SELECT * FROM jsonb_array_elements(p_trips)
    LOOP
        v_existing_card_id := (v_trip->>'existing_card_id')::UUID;

        IF v_existing_card_id IS NOT NULL THEN
            v_card_id := v_existing_card_id;

            SELECT pipeline_stage_id, data_viagem_inicio, data_viagem_fim, COALESCE(produto_data, '{}'::JSONB)
            INTO v_prev_stage, v_prev_inicio, v_prev_fim, v_existing_pd
            FROM cards WHERE id = v_card_id;

            v_prev_state := jsonb_build_object(
                'pipeline_stage_id', v_prev_stage,
                'data_viagem_inicio', v_prev_inicio,
                'data_viagem_fim', v_prev_fim,
                'produto_data', v_existing_pd
            );

            UPDATE cards SET
                pipeline_stage_id = CASE
                    WHEN (v_trip->>'pipeline_stage_id')::UUID IS NOT NULL
                    THEN (v_trip->>'pipeline_stage_id')::UUID
                    ELSE pipeline_stage_id
                END,
                data_viagem_inicio = COALESCE(data_viagem_inicio, (v_trip->>'data_viagem_inicio')::DATE),
                data_viagem_fim = COALESCE(data_viagem_fim, (v_trip->>'data_viagem_fim')::DATE),
                updated_at = NOW(),
                updated_by = p_created_by
            WHERE id = v_card_id;

            IF v_trip->'products_to_mark_ready' IS NOT NULL THEN
                FOR v_product IN SELECT * FROM jsonb_array_elements(v_trip->'products_to_mark_ready')
                LOOP
                    UPDATE card_financial_items SET is_ready = true
                    WHERE card_id = v_card_id
                      AND LOWER(COALESCE(description, '')) = LOWER(COALESCE(v_product->>'description', ''))
                      AND LOWER(COALESCE(fornecedor, '')) = LOWER(COALESCE(v_product->>'fornecedor', ''))
                      AND is_ready = false;
                END LOOP;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM tarefas
                WHERE card_id = v_card_id AND titulo = 'App Enviado para o Cliente'
            ) THEN
                INSERT INTO tarefas (card_id, titulo, tipo, concluida, concluida_em, created_by)
                VALUES (
                    v_card_id, 'App Enviado para o Cliente', 'tarefa',
                    COALESCE((v_trip->>'app_enviado_concluida')::BOOLEAN, false),
                    CASE WHEN (v_trip->>'app_enviado_concluida')::BOOLEAN = true THEN NOW() ELSE NULL END,
                    p_created_by
                );
            ELSE
                IF (v_trip->>'app_enviado_concluida')::BOOLEAN = true THEN
                    UPDATE tarefas SET concluida = true, concluida_em = COALESCE(concluida_em, NOW())
                    WHERE card_id = v_card_id AND titulo = 'App Enviado para o Cliente' AND concluida = false;
                END IF;
            END IF;

            v_historico := COALESCE(v_existing_pd->'numeros_venda_monde_historico', '[]'::JSONB);
            FOR v_venda_num IN SELECT jsonb_array_elements_text(v_trip->'venda_nums')
            LOOP
                IF NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(v_historico) elem WHERE elem->>'numero' = v_venda_num
                ) THEN
                    v_historico := v_historico || jsonb_build_array(jsonb_build_object(
                        'numero', v_venda_num,
                        'criado_em', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                        'motivo', 'importacao_pos_venda'
                    ));
                END IF;
            END LOOP;

            UPDATE cards SET
                produto_data = v_existing_pd
                    || jsonb_build_object('numeros_venda_monde_historico', v_historico)
                    || CASE
                        WHEN v_existing_pd->>'numero_venda_monde' IS NULL
                            AND jsonb_array_length(v_trip->'venda_nums') > 0
                        THEN jsonb_build_object('numero_venda_monde', v_trip->'venda_nums'->>0)
                        ELSE '{}'::JSONB
                    END
            WHERE id = v_card_id;

            v_cards_updated := v_cards_updated + 1;
            v_results := v_results || jsonb_build_array(jsonb_build_object(
                'idx', v_trip_idx, 'card_id', v_card_id, 'action', 'updated', 'previous_state', v_prev_state
            ));

        ELSE
            v_contato_id := NULL;
            IF v_trip->>'cpf_norm' IS NOT NULL AND v_trip->>'cpf_norm' != '' THEN
                SELECT id INTO v_contato_id FROM contatos
                WHERE cpf_normalizado = (v_trip->>'cpf_norm') AND deleted_at IS NULL LIMIT 1;
            END IF;

            IF v_contato_id IS NULL THEN
                v_nome_parts := string_to_array(TRIM(COALESCE(v_trip->>'pagante_nome', '')), ' ');
                v_nome := v_nome_parts[1];
                v_sobrenome := CASE WHEN array_length(v_nome_parts, 1) > 1
                    THEN array_to_string(v_nome_parts[2:], ' ') ELSE NULL END;

                INSERT INTO contatos (nome, sobrenome, cpf, created_by, origem)
                VALUES (COALESCE(v_nome, v_trip->>'pagante_nome'), v_sobrenome, v_trip->>'cpf_raw', p_created_by, 'importacao')
                RETURNING id INTO v_contato_id;
                v_contacts_created := v_contacts_created + 1;
            END IF;

            v_historico := '[]'::JSONB;
            FOR v_venda_num IN SELECT jsonb_array_elements_text(v_trip->'venda_nums')
            LOOP
                v_historico := v_historico || jsonb_build_array(jsonb_build_object(
                    'numero', v_venda_num,
                    'criado_em', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                    'motivo', 'importacao_pos_venda'
                ));
            END LOOP;

            INSERT INTO cards (
                titulo, produto, pipeline_id, pipeline_stage_id, pessoa_principal_id,
                pos_owner_id, dono_atual_id, vendas_owner_id, status_comercial,
                ganho_pos, ganho_pos_at, data_viagem_inicio, data_viagem_fim,
                valor_final, receita, receita_source, created_by, produto_data
            ) VALUES (
                v_trip->>'titulo', 'TRIPS', 'c8022522-4a1d-411c-9387-efe03ca725ee',
                (v_trip->>'pipeline_stage_id')::UUID, v_contato_id,
                (v_trip->>'pos_owner_id')::UUID,
                COALESCE((v_trip->>'pos_owner_id')::UUID, p_created_by),
                (v_trip->>'vendas_owner_id')::UUID, 'ganho', true, NOW(),
                (v_trip->>'data_viagem_inicio')::DATE, (v_trip->>'data_viagem_fim')::DATE,
                COALESCE((v_trip->>'valor_total')::NUMERIC, 0),
                COALESCE((v_trip->>'receita_total')::NUMERIC, 0),
                'monde_import', p_created_by,
                jsonb_build_object(
                    'numero_venda_monde', CASE WHEN jsonb_array_length(v_trip->'venda_nums') > 0 THEN v_trip->'venda_nums'->>0 ELSE NULL END,
                    'numeros_venda_monde_historico', v_historico,
                    'imported_from', 'pos_venda_monde',
                    'epoca_viagem', jsonb_build_object('tipo', 'data_exata', 'data_inicio', v_trip->>'data_viagem_inicio', 'data_fim', v_trip->>'data_viagem_fim')
                )
            ) RETURNING id INTO v_card_id;

            FOR v_product IN SELECT * FROM jsonb_array_elements(v_trip->'products')
            LOOP
                INSERT INTO card_financial_items (
                    card_id, product_type, description, sale_value, supplier_cost,
                    fornecedor, is_ready, data_inicio, data_fim
                ) VALUES (
                    v_card_id, 'custom', v_product->>'description',
                    COALESCE((v_product->>'sale_value')::NUMERIC, 0),
                    COALESCE((v_product->>'supplier_cost')::NUMERIC, 0),
                    v_product->>'fornecedor',
                    COALESCE((v_product->>'is_ready')::BOOLEAN, false),
                    (v_product->>'data_inicio')::DATE, (v_product->>'data_fim')::DATE
                ) RETURNING id INTO v_item_id;

                v_pax_idx := 0;
                IF v_product->'passageiros' IS NOT NULL AND jsonb_array_length(v_product->'passageiros') > 0 THEN
                    FOR v_pax_name IN SELECT jsonb_array_elements_text(v_product->'passageiros')
                    LOOP
                        INSERT INTO financial_item_passengers (financial_item_id, card_id, nome, ordem)
                        VALUES (v_item_id, v_card_id, v_pax_name, v_pax_idx);
                        v_pax_idx := v_pax_idx + 1;
                    END LOOP;
                END IF;
                v_products_imported := v_products_imported + 1;
            END LOOP;

            INSERT INTO tarefas (card_id, titulo, tipo, concluida, concluida_em, created_by)
            VALUES (v_card_id, 'App Enviado para o Cliente', 'tarefa',
                COALESCE((v_trip->>'app_enviado_concluida')::BOOLEAN, false),
                CASE WHEN (v_trip->>'app_enviado_concluida')::BOOLEAN = true THEN NOW() ELSE NULL END,
                p_created_by);

            v_acomp_idx := 0;
            IF v_trip->'acompanhantes' IS NOT NULL THEN
                FOR v_acomp_name IN SELECT jsonb_array_elements_text(v_trip->'acompanhantes')
                LOOP
                    v_acomp_contato_id := NULL;
                    v_nome_parts := string_to_array(TRIM(v_acomp_name), ' ');
                    v_nome := v_nome_parts[1];
                    v_sobrenome := CASE WHEN array_length(v_nome_parts, 1) > 1
                        THEN array_to_string(v_nome_parts[2:], ' ') ELSE NULL END;
                    IF v_sobrenome IS NOT NULL THEN
                        SELECT id INTO v_acomp_contato_id FROM contatos
                        WHERE LOWER(nome) = LOWER(v_nome) AND LOWER(COALESCE(sobrenome, '')) = LOWER(v_sobrenome)
                          AND deleted_at IS NULL LIMIT 1;
                    END IF;
                    IF v_acomp_contato_id IS NULL THEN
                        INSERT INTO contatos (nome, sobrenome, created_by, origem)
                        VALUES (v_nome, v_sobrenome, p_created_by, 'importacao')
                        RETURNING id INTO v_acomp_contato_id;
                        v_contacts_created := v_contacts_created + 1;
                    END IF;
                    IF v_acomp_contato_id != v_contato_id THEN
                        SELECT EXISTS(SELECT 1 FROM cards_contatos WHERE card_id = v_card_id AND contato_id = v_acomp_contato_id) INTO v_existing_acomp;
                        IF NOT v_existing_acomp THEN
                            INSERT INTO cards_contatos (card_id, contato_id, tipo_viajante, ordem)
                            VALUES (v_card_id, v_acomp_contato_id, 'acompanhante', v_acomp_idx);
                            v_acomp_idx := v_acomp_idx + 1;
                        END IF;
                    END IF;
                END LOOP;
            END IF;

            SELECT COALESCE(SUM(sale_value), 0), COALESCE(SUM(supplier_cost), 0)
            INTO v_total_venda, v_total_custo FROM card_financial_items WHERE card_id = v_card_id;
            v_receita := v_total_venda - v_total_custo;
            UPDATE cards SET valor_final = v_total_venda, receita = v_receita, receita_source = 'monde_import', updated_at = NOW()
            WHERE id = v_card_id;

            v_cards_created := v_cards_created + 1;
            v_results := v_results || jsonb_build_array(jsonb_build_object(
                'idx', v_trip_idx, 'card_id', v_card_id, 'action', 'created', 'previous_state', NULL
            ));
        END IF;

        v_trip_idx := v_trip_idx + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'cards_created', v_cards_created,
        'cards_updated', v_cards_updated,
        'contacts_created', v_contacts_created,
        'products_imported', v_products_imported,
        'results', v_results
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4.3 revert_pos_venda_import_items
-- Original: 20260331_pos_venda_revert_system.sql
-- Justificativa: admin desfazendo um import. Restaura estado anterior do
-- card que pode incluir voltar para um stage de planner sem todos os campos
-- que pos-venda exige.

CREATE OR REPLACE FUNCTION public.revert_pos_venda_import_items(
    p_item_ids UUID[],
    p_reverted_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_item RECORD;
    v_reverted INTEGER := 0;
    v_errors TEXT[] := '{}';
    v_prev JSONB;
BEGIN
    -- Bypass: revert restaura estado anterior, pode mover para stages sem
    -- todos os requisitos do destino atual
    PERFORM set_config('app.bypass_stage_requirements', 'true', true);

    FOR v_item IN
        SELECT * FROM pos_venda_import_log_items
        WHERE id = ANY(p_item_ids)
          AND reverted_at IS NULL
          AND card_id IS NOT NULL
    LOOP
        BEGIN
            IF v_item.action = 'created' THEN
                UPDATE cards SET
                    archived_at = NOW(),
                    archived_by = p_reverted_by,
                    updated_at = NOW()
                WHERE id = v_item.card_id
                  AND archived_at IS NULL;

            ELSIF v_item.action = 'updated' THEN
                v_prev := v_item.previous_state;
                IF v_prev IS NOT NULL THEN
                    UPDATE cards SET
                        pipeline_stage_id = COALESCE((v_prev->>'pipeline_stage_id')::UUID, pipeline_stage_id),
                        data_viagem_inicio = (v_prev->>'data_viagem_inicio')::DATE,
                        data_viagem_fim = (v_prev->>'data_viagem_fim')::DATE,
                        produto_data = CASE WHEN v_prev->'produto_data' IS NOT NULL THEN v_prev->'produto_data' ELSE produto_data END,
                        updated_at = NOW(),
                        updated_by = p_reverted_by
                    WHERE id = v_item.card_id;

                    UPDATE card_financial_items SET is_ready = false
                    WHERE card_id = v_item.card_id AND is_ready = true;

                    DELETE FROM tarefas
                    WHERE card_id = v_item.card_id
                      AND titulo = 'App Enviado para o Cliente'
                      AND created_by = p_reverted_by;
                END IF;
            END IF;

            UPDATE pos_venda_import_log_items SET
                reverted_at = NOW(),
                reverted_by = p_reverted_by
            WHERE id = v_item.id;

            UPDATE pos_venda_import_logs SET
                reverted_count = reverted_count + 1
            WHERE id = v_item.import_log_id;

            v_reverted := v_reverted + 1;

        EXCEPTION WHEN OTHERS THEN
            v_errors := array_append(v_errors, v_item.id::TEXT || ': ' || SQLERRM);
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'reverted', v_reverted,
        'errors', to_jsonb(v_errors)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
