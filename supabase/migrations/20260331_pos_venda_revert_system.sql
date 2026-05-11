-- ============================================================================
-- MIGRATION: Sistema de reversão para importação pós-venda
-- Date: 2026-03-31
--
-- 1. Adiciona campos de rastreamento nos log items (card_id, previous_state)
-- 2. Adiciona status de reversão nos logs
-- 3. Atualiza a RPC para retornar card_ids por trip
-- 4. Cria RPC de reversão (individual e em lote)
-- ============================================================================

-- ─── 1. Campos extras nos logs ──────────────────────────────

ALTER TABLE pos_venda_import_log_items
    ADD COLUMN IF NOT EXISTS reverted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reverted_by UUID REFERENCES profiles(id),
    ADD COLUMN IF NOT EXISTS previous_state JSONB;
    -- previous_state guarda: { pipeline_stage_id, data_viagem_inicio, data_viagem_fim, produto_data }
    -- para updates, permitindo restaurar o estado anterior

ALTER TABLE pos_venda_import_logs
    ADD COLUMN IF NOT EXISTS reverted_count INTEGER NOT NULL DEFAULT 0;

-- ─── 2. Atualizar RPC para retornar resultados por trip ─────

CREATE OR REPLACE FUNCTION bulk_create_pos_venda_cards(
    p_trips JSONB,
    p_created_by UUID
)
RETURNS JSONB AS $$
DECLARE
    v_trip JSONB;
    v_product JSONB;
    v_pax_name TEXT;
    v_pax_idx INTEGER;

    -- Counters
    v_cards_created INTEGER := 0;
    v_cards_updated INTEGER := 0;
    v_contacts_created INTEGER := 0;
    v_products_imported INTEGER := 0;

    -- Per-trip vars
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

    -- Acompanhante vars
    v_acomp_name TEXT;
    v_acomp_contato_id UUID;
    v_acomp_idx INTEGER;
    v_existing_acomp BOOLEAN;

    -- Venda nums
    v_venda_num TEXT;
    v_existing_pd JSONB;
    v_historico JSONB;

    -- Results per trip
    v_results JSONB := '[]'::JSONB;
    v_prev_state JSONB;
    v_prev_stage UUID;
    v_prev_inicio DATE;
    v_prev_fim DATE;
    v_trip_idx INTEGER := 0;
BEGIN
    FOR v_trip IN SELECT * FROM jsonb_array_elements(p_trips)
    LOOP
        v_existing_card_id := (v_trip->>'existing_card_id')::UUID;

        -- ═══════════════════════════════════════════════════════════
        -- PATH A: UPDATE existing card
        -- ═══════════════════════════════════════════════════════════
        IF v_existing_card_id IS NOT NULL THEN
            v_card_id := v_existing_card_id;

            -- Capture previous state for revert
            SELECT pipeline_stage_id, data_viagem_inicio, data_viagem_fim, COALESCE(produto_data, '{}'::JSONB)
            INTO v_prev_stage, v_prev_inicio, v_prev_fim, v_existing_pd
            FROM cards WHERE id = v_card_id;

            v_prev_state := jsonb_build_object(
                'pipeline_stage_id', v_prev_stage,
                'data_viagem_inicio', v_prev_inicio,
                'data_viagem_fim', v_prev_fim,
                'produto_data', v_existing_pd
            );

            -- 1. Move to correct stage
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

            -- 2. Update is_ready on existing financial items
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

            -- 3. Create task if not exists
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

            -- 4. Merge venda nums into produto_data
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

        -- ═══════════════════════════════════════════════════════════
        -- PATH B: CREATE new card
        -- ═══════════════════════════════════════════════════════════
        ELSE
            -- 1. Find or create contact by CPF
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

            -- 2. Build produto_data historico
            v_historico := '[]'::JSONB;
            FOR v_venda_num IN SELECT jsonb_array_elements_text(v_trip->'venda_nums')
            LOOP
                v_historico := v_historico || jsonb_build_array(jsonb_build_object(
                    'numero', v_venda_num,
                    'criado_em', to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                    'motivo', 'importacao_pos_venda'
                ));
            END LOOP;

            -- 3. Insert card
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

            -- 4. Insert financial items
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

            -- 6. Task
            INSERT INTO tarefas (card_id, titulo, tipo, concluida, concluida_em, created_by)
            VALUES (v_card_id, 'App Enviado para o Cliente', 'tarefa',
                COALESCE((v_trip->>'app_enviado_concluida')::BOOLEAN, false),
                CASE WHEN (v_trip->>'app_enviado_concluida')::BOOLEAN = true THEN NOW() ELSE NULL END,
                p_created_by);

            -- 7. Acompanhantes
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

            -- 8. Recalculate financials
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

-- ─── 3. RPC de reversão ─────────────────────────────────────

CREATE OR REPLACE FUNCTION revert_pos_venda_import_items(
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
    FOR v_item IN
        SELECT * FROM pos_venda_import_log_items
        WHERE id = ANY(p_item_ids)
          AND reverted_at IS NULL
          AND card_id IS NOT NULL
    LOOP
        BEGIN
            IF v_item.action = 'created' THEN
                -- Card was created by import → archive it (soft delete)
                UPDATE cards SET
                    archived_at = NOW(),
                    archived_by = p_reverted_by,
                    updated_at = NOW()
                WHERE id = v_item.card_id
                  AND archived_at IS NULL;

            ELSIF v_item.action = 'updated' THEN
                -- Card was updated → restore previous state
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

                    -- Revert is_ready on financial items back to false
                    UPDATE card_financial_items SET is_ready = false
                    WHERE card_id = v_item.card_id AND is_ready = true;

                    -- Remove task we may have created
                    DELETE FROM tarefas
                    WHERE card_id = v_item.card_id
                      AND titulo = 'App Enviado para o Cliente'
                      AND created_by = p_reverted_by;
                END IF;
            END IF;

            -- Mark log item as reverted
            UPDATE pos_venda_import_log_items SET
                reverted_at = NOW(),
                reverted_by = p_reverted_by
            WHERE id = v_item.id;

            -- Update parent log counter
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
