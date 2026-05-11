-- ============================================================================
-- MIGRATION: bulk_create_pos_venda_cards — não setar ganho_pos no INSERT
-- Date: 2026-04-27
--
-- A versão anterior (20260424d) inseria cards no Pós-venda já com
-- ganho_pos=true e ganho_pos_at=NOW(), tratando "chegou no Pós-venda" como
-- equivalente a "Pós-venda concluído". Pela nova regra, ganho_pos só deve
-- vir após viagem realizada + NPS.
--
-- A venda em si JÁ FOI fechada (cliente comprou, vendedor importou) — então
-- mantemos status_comercial='ganho' e setamos ganho_planner=true (correto).
-- O milestone ganho_pos será setado depois por gatilho dedicado (a definir).
--
-- Resto da função inalterado em relação à 20260424d.
-- ============================================================================

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
    v_errors INTEGER := 0;

    v_card_id UUID;
    v_existing_card_id UUID;
    v_contato_id UUID;
    v_item_id UUID;
    v_nome TEXT;
    v_sobrenome TEXT;
    v_sobrenome_last TEXT;
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

    v_card_org_id UUID;
    v_cadence_template_id UUID;
    v_has_app BOOLEAN;
    v_all_products_ready BOOLEAN;
    v_all_ready BOOLEAN;
    v_step RECORD;
    v_step_titulo TEXT;
    v_step_user UUID;
    v_step_priority_raw TEXT;
    v_step_priority TEXT;
    v_is_done BOOLEAN;
    v_new_titulo TEXT;
    v_error_msg TEXT;
    v_error_sqlstate TEXT;
BEGIN
    SET LOCAL statement_timeout = '300s';

    PERFORM set_config('app.bypass_stage_requirements', 'true', true);

    FOR v_trip IN SELECT * FROM jsonb_array_elements(p_trips)
    LOOP
        BEGIN
            v_existing_card_id := (v_trip->>'existing_card_id')::UUID;
            v_new_titulo := v_trip->>'titulo';

            v_has_app := COALESCE((v_trip->>'app_enviado_concluida')::BOOLEAN, false);
            v_all_products_ready := true;
            IF v_trip->'products' IS NOT NULL AND jsonb_array_length(v_trip->'products') > 0 THEN
                FOR v_product IN SELECT * FROM jsonb_array_elements(v_trip->'products')
                LOOP
                    IF NOT COALESCE((v_product->>'is_ready')::BOOLEAN, false) THEN
                        v_all_products_ready := false;
                        EXIT;
                    END IF;
                END LOOP;
            ELSE
                v_all_products_ready := false;
            END IF;
            v_all_ready := v_has_app AND v_all_products_ready;

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
                    titulo = COALESCE(v_new_titulo, titulo),
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

                IF v_has_app THEN
                    UPDATE tarefas SET concluida = true, concluida_em = COALESCE(concluida_em, NOW())
                    WHERE card_id = v_card_id AND titulo = 'App Enviado para o Cliente' AND concluida = false;

                    UPDATE tarefas SET concluida = true, concluida_em = COALESCE(concluida_em, NOW())
                    WHERE card_id = v_card_id AND titulo = 'Criar App' AND concluida = false;
                END IF;
                IF v_all_products_ready THEN
                    UPDATE tarefas SET concluida = true, concluida_em = COALESCE(concluida_em, NOW())
                    WHERE card_id = v_card_id
                      AND titulo IN ('Conferir Vouchers', 'Adicionar vouchers no App')
                      AND concluida = false;
                END IF;
                IF v_all_ready THEN
                    UPDATE tarefas SET concluida = true, concluida_em = COALESCE(concluida_em, NOW())
                    WHERE card_id = v_card_id AND titulo = 'Liberar App' AND concluida = false;
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
                    VALUES (COALESCE(v_nome, v_trip->>'pagante_nome'), v_sobrenome, v_trip->>'cpf_raw', p_created_by, 'monde')
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

                -- Card chega no Pós-venda com a venda já fechada (Planner ganhou).
                -- ganho_pos só vira true após viagem + NPS — não no INSERT.
                INSERT INTO cards (
                    titulo, produto, pipeline_id, pipeline_stage_id, pessoa_principal_id,
                    pos_owner_id, dono_atual_id, vendas_owner_id, status_comercial,
                    ganho_planner, ganho_planner_at, ganho_pos, ganho_pos_at,
                    data_viagem_inicio, data_viagem_fim,
                    valor_final, receita, receita_source, created_by, produto_data
                ) VALUES (
                    v_new_titulo, 'TRIPS', 'c8022522-4a1d-411c-9387-efe03ca725ee',
                    (v_trip->>'pipeline_stage_id')::UUID, v_contato_id,
                    (v_trip->>'pos_owner_id')::UUID,
                    COALESCE((v_trip->>'pos_owner_id')::UUID, p_created_by),
                    (v_trip->>'vendas_owner_id')::UUID, 'ganho',
                    true, NOW(), false, NULL,
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
                ) RETURNING id, org_id INTO v_card_id, v_card_org_id;

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

                SELECT id INTO v_cadence_template_id FROM cadence_templates
                WHERE name = 'Pós-venda: App & Conteúdo'
                  AND org_id = v_card_org_id
                  AND is_active = true
                LIMIT 1;

                IF v_cadence_template_id IS NOT NULL THEN
                    FOR v_step IN
                        SELECT task_config, step_order
                        FROM cadence_steps
                        WHERE template_id = v_cadence_template_id
                        ORDER BY step_order
                    LOOP
                        v_step_titulo := v_step.task_config->>'titulo';
                        IF v_step_titulo IS NULL OR v_step_titulo = '' THEN CONTINUE; END IF;

                        v_step_user := NULLIF(v_step.task_config->>'assign_to_user_id', '')::UUID;

                        v_step_priority_raw := LOWER(COALESCE(v_step.task_config->>'prioridade', ''));
                        v_step_priority := CASE v_step_priority_raw
                            WHEN 'high' THEN 'alta'
                            WHEN 'alta' THEN 'alta'
                            WHEN 'medium' THEN 'media'
                            WHEN 'media' THEN 'media'
                            WHEN 'média' THEN 'media'
                            WHEN 'low' THEN 'baixa'
                            WHEN 'baixa' THEN 'baixa'
                            ELSE 'media'
                        END;

                        IF v_step_titulo = 'Criar App' THEN
                            v_is_done := v_has_app;
                        ELSIF v_step_titulo IN ('Conferir Vouchers', 'Adicionar vouchers no App') THEN
                            v_is_done := v_all_products_ready;
                        ELSIF v_step_titulo = 'Liberar App' THEN
                            v_is_done := v_all_ready;
                        ELSE
                            v_is_done := false;
                        END IF;

                        INSERT INTO tarefas (
                            card_id, titulo, tipo, prioridade,
                            concluida, concluida_em,
                            responsavel_id, created_by
                        ) VALUES (
                            v_card_id, v_step_titulo, 'tarefa', v_step_priority,
                            v_is_done,
                            CASE WHEN v_is_done THEN NOW() ELSE NULL END,
                            v_step_user, p_created_by
                        );
                    END LOOP;
                END IF;

                v_acomp_idx := 0;
                IF v_trip->'acompanhantes' IS NOT NULL THEN
                    FOR v_acomp_name IN SELECT jsonb_array_elements_text(v_trip->'acompanhantes')
                    LOOP
                        v_acomp_contato_id := NULL;
                        v_nome_parts := string_to_array(TRIM(v_acomp_name), ' ');
                        v_nome := v_nome_parts[1];
                        v_sobrenome := CASE WHEN array_length(v_nome_parts, 1) > 1
                            THEN array_to_string(v_nome_parts[2:], ' ') ELSE NULL END;
                        v_sobrenome_last := CASE WHEN array_length(v_nome_parts, 1) > 1
                            THEN v_nome_parts[array_length(v_nome_parts, 1)] ELSE NULL END;

                        IF v_sobrenome IS NOT NULL THEN
                            SELECT id INTO v_acomp_contato_id FROM contatos
                            WHERE LOWER(nome) = LOWER(v_nome) AND LOWER(COALESCE(sobrenome, '')) = LOWER(v_sobrenome)
                              AND deleted_at IS NULL LIMIT 1;
                        END IF;
                        IF v_acomp_contato_id IS NULL AND v_sobrenome_last IS NOT NULL
                           AND v_sobrenome_last != COALESCE(v_sobrenome, '') THEN
                            SELECT id INTO v_acomp_contato_id FROM contatos
                            WHERE LOWER(nome) = LOWER(v_nome) AND LOWER(COALESCE(sobrenome, '')) = LOWER(v_sobrenome_last)
                              AND deleted_at IS NULL LIMIT 1;
                        END IF;

                        IF v_acomp_contato_id IS NULL THEN
                            INSERT INTO contatos (nome, sobrenome, created_by, origem)
                            VALUES (v_nome, v_sobrenome, p_created_by, 'monde')
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

        EXCEPTION WHEN OTHERS THEN
            GET STACKED DIAGNOSTICS v_error_msg = MESSAGE_TEXT, v_error_sqlstate = RETURNED_SQLSTATE;
            v_errors := v_errors + 1;
            v_results := v_results || jsonb_build_array(jsonb_build_object(
                'idx', v_trip_idx,
                'card_id', NULL,
                'action', 'error',
                'error', v_error_msg,
                'sqlstate', v_error_sqlstate,
                'previous_state', NULL
            ));
        END;

        v_trip_idx := v_trip_idx + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'cards_created', v_cards_created,
        'cards_updated', v_cards_updated,
        'contacts_created', v_contacts_created,
        'products_imported', v_products_imported,
        'errors', v_errors,
        'results', v_results
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
