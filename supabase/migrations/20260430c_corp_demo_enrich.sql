-- ============================================================================
-- MIGRATION: Welcome Corporativo — enriquecer seed com tarefas, prioridade, dono
-- Date: 2026-04-30
-- ============================================================================

BEGIN;

DO $enrich$
DECLARE
    v_org UUID := 'b0000000-0000-0000-0000-000000000003';
    v_vitor UUID := 'dfdc4512-d842-4487-be80-11df91f24057';

    v_c1 UUID := 'f2000000-0000-0000-0000-000000000001'; -- Magalu hotel verde
    v_c2 UUID := 'f2000000-0000-0000-0000-000000000002'; -- Magalu aéreo intl amarelo
    v_c3 UUID := 'f2000000-0000-0000-0000-000000000003'; -- Itaú aéreo nac vermelho
    v_c4 UUID := 'f2000000-0000-0000-0000-000000000004'; -- Suzano ganho
    v_c5 UUID := 'f2000000-0000-0000-0000-000000000005'; -- Stone perdido
    v_c6 UUID := 'f2000000-0000-0000-0000-000000000006'; -- Joana solta
    v_c7 UUID := 'f2000000-0000-0000-0000-000000000007'; -- Itaú carro
BEGIN

    -- Limpa tarefas existentes desses cards (idempotente)
    DELETE FROM tarefas WHERE card_id IN (v_c1, v_c2, v_c3, v_c4, v_c5, v_c6, v_c7);

    -- ========================================================================
    -- Atualiza prioridade, dono e observações dos cards
    -- ========================================================================

    -- Card 1: Magalu hotel — prioridade média, dono Vitor
    UPDATE cards SET
        prioridade = 'media',
        dono_atual_id = v_vitor,
        sdr_owner_id = v_vitor,
        produto_data = produto_data || jsonb_build_object(
            'observacoes_internas', 'CEO viaja com 1 acompanhante. Prefere hotel próximo à Faria Lima. Check-in dia 12/05 antecipado se possível.'
        )
    WHERE id = v_c1;

    -- Card 2: Magalu aéreo intl — prioridade ALTA (CEO, valor alto)
    UPDATE cards SET
        prioridade = 'alta',
        dono_atual_id = v_vitor,
        sdr_owner_id = v_vitor,
        produto_data = produto_data || jsonb_build_object(
            'observacoes_internas', 'CFO + 2 diretores. GRU-LIS-GRU classe executiva preferencialmente TAP ou LATAM. Cliente quer cotação até amanhã 9h.'
        )
    WHERE id = v_c2;

    -- Card 3: Itaú aéreo nac — prioridade ALTA (atrasado 2 dias!)
    UPDATE cards SET
        prioridade = 'alta',
        dono_atual_id = v_vitor,
        sdr_owner_id = v_vitor,
        produto_data = produto_data || jsonb_build_object(
            'observacoes_internas', 'AGUARDANDO RETORNO da Marina há 2 dias. Já mandei 2 follow-ups. Pedido era GRU-CGH para reunião de diretoria.'
        )
    WHERE id = v_c3;

    -- Card 4: Suzano ganho
    UPDATE cards SET
        prioridade = 'baixa',
        dono_atual_id = v_vitor,
        sdr_owner_id = v_vitor,
        ganho_planner = TRUE,
        ganho_planner_at = NOW() - INTERVAL '1 day',
        valor_final = 9800,
        produto_data = produto_data || jsonb_build_object(
            'observacoes_internas', 'Hotel Fasano Punta del Este 2 noites. Patrícia confirmou pagamento via empresa. Voucher já enviado.'
        )
    WHERE id = v_c4;

    -- Card 5: Stone perdido
    UPDATE cards SET
        prioridade = 'media',
        dono_atual_id = v_vitor,
        sdr_owner_id = v_vitor,
        produto_data = produto_data || jsonb_build_object(
            'observacoes_internas', 'Cliente cotou seguro pra evento corporativo de 80 pessoas em Búzios. Travou no orçamento. Retomar em julho/2026.'
        )
    WHERE id = v_c5;

    -- Card 6: Joana solta
    UPDATE cards SET
        prioridade = 'baixa',
        dono_atual_id = v_vitor,
        sdr_owner_id = v_vitor
    WHERE id = v_c6;

    -- Card 7: Itaú carro
    UPDATE cards SET
        prioridade = 'baixa',
        dono_atual_id = v_vitor,
        sdr_owner_id = v_vitor,
        produto_data = produto_data || jsonb_build_object(
            'observacoes_internas', 'Carlos pediu carro premium pra 3 dias em SP. Audi A4 ou similar. Retirada GRU dia 14/05.'
        )
    WHERE id = v_c7;

    -- ========================================================================
    -- Tarefas (próxima_tarefa aparece no Kanban via view view_cards_acoes)
    -- ========================================================================

    INSERT INTO tarefas (card_id, org_id, titulo, descricao, tipo, prioridade, data_vencimento, concluida, created_by, responsavel_id)
    VALUES
        -- Card 1: Magalu hotel — tarefa pra hoje
        (v_c1, v_org, 'Enviar comparativo Fasano vs Tivoli', 'Mandar até as 17h pro WhatsApp da Beatriz', 'tarefa', 'media',
         NOW() + INTERVAL '3 hours', false, v_vitor, v_vitor),

        -- Card 2: Magalu aéreo intl — tarefa pra hoje, alta
        (v_c2, v_org, 'Cotar GRU-LIS executiva (3 pax)', 'Cotação TAP + LATAM + Air France. Cliente espera até amanhã 9h.', 'tarefa', 'alta',
         NOW() + INTERVAL '6 hours', false, v_vitor, v_vitor),

        -- Card 3: Itaú aéreo nac — ATRASADA (2 dias atrás)
        (v_c3, v_org, 'Follow-up com Marina', 'Já mandei 2 mensagens. Tentar telefone interno.', 'tarefa', 'alta',
         NOW() - INTERVAL '1 day', false, v_vitor, v_vitor),

        -- Card 4: Suzano — tarefa concluída
        (v_c4, v_org, 'Enviar voucher Fasano Punta', NULL, 'tarefa', 'media',
         NOW() - INTERVAL '1 day', true, v_vitor, v_vitor),

        -- Card 6: Joana — tarefa de vincular
        (v_c6, v_org, 'Identificar empresa da Joana', 'Pessoa caiu no WhatsApp sem cadastro. Perguntar de qual empresa é.', 'tarefa', 'baixa',
         NOW() + INTERVAL '1 day', false, v_vitor, v_vitor),

        -- Card 7: Itaú carro
        (v_c7, v_org, 'Reservar carro premium 14-16/05', 'Carlos pediu Audi A4 ou similar. Retirada GRU.', 'tarefa', 'media',
         NOW() + INTERVAL '1 day', false, v_vitor, v_vitor);

    -- Marca tarefa do Suzano como concluída
    UPDATE tarefas SET concluida_em = NOW() - INTERVAL '1 day', concluido_por = v_vitor
     WHERE card_id = v_c4 AND concluida = true;

    RAISE NOTICE '✅ Cards Corp enriquecidos: prioridade + dono + observações + 6 tarefas (1 atrasada, 1 concluída, 4 ativas)';
END $enrich$;

COMMIT;
