-- ============================================================================
-- MIGRATION: Welcome Corporativo — seed de demonstração
-- Date: 2026-04-30
--
-- 1. Atualiza check_contato_required_fields pra isentar contatos do tipo
--    'empresa' (não faz sentido empresa ter sobrenome/telefone próprios) e
--    adiciona 'manual_corp' à lista de origens isentas (cadastro manual via
--    /empresas e ações da página).
-- 2. Cria empresas/pessoas/cards fictícios pra demo visual.
--
-- IDEMPOTENTE: deleta tudo que cria e recria. UUIDs determinísticos.
--
-- Cobre todos os cenários visuais:
--   - Card aberto há 30min (badge VERDE)
--   - Card aberto há 5h (badge AMARELO)
--   - Card aberto há 2 dias (badge VERMELHO)
--   - Card ganho (status verde, na etapa Fechado)
--   - Card perdido com motivo "Oportunidade futura"
--   - Pessoa solta sem empresa (banner amarelo "vincular")
-- ============================================================================

BEGIN;

-- ============================================================================
-- 0. Ajusta check_contato_required_fields pra Welcome Corporativo
--    - Empresas (tipo_contato='empresa') são isentas
--    - Origem 'manual_corp' (usada pela UI nova) também é isenta
-- ============================================================================
CREATE OR REPLACE FUNCTION check_contato_required_fields()
RETURNS TRIGGER AS $check$
BEGIN
    -- Empresas não têm sobrenome/telefone — só nome
    IF NEW.tipo_contato = 'empresa' THEN
        IF NULLIF(TRIM(NEW.nome), '') IS NULL THEN
            RAISE EXCEPTION 'Nome é obrigatório para criação de contato';
        END IF;
        RETURN NEW;
    END IF;

    -- Origens automáticas são isentas
    IF NEW.origem IN ('echo', 'integracao', 'trigger', 'whatsapp', 'monde', 'manual_corp') THEN
        RETURN NEW;
    END IF;

    IF NULLIF(TRIM(NEW.nome), '') IS NULL THEN
        RAISE EXCEPTION 'Nome é obrigatório para criação de contato';
    END IF;

    IF NULLIF(TRIM(COALESCE(NEW.sobrenome, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Sobrenome é obrigatório para criação de contato';
    END IF;

    IF NULLIF(TRIM(COALESCE(NEW.telefone, '')), '') IS NULL THEN
        RAISE EXCEPTION 'Telefone é obrigatório para criação de contato';
    END IF;

    RETURN NEW;
END;
$check$ LANGUAGE plpgsql;

DO $seed$
DECLARE
    v_org UUID := 'b0000000-0000-0000-0000-000000000003';
    v_pipeline UUID := 'c0000000-0000-0000-0000-000000000003';
    v_stage_aberto UUID := 'e0000000-0000-0000-0000-000000000031';
    v_stage_fechado UUID := 'e0000000-0000-0000-0000-000000000032';

    -- Empresas
    v_e_magalu UUID := 'f0000000-0000-0000-0000-000000000001';
    v_e_itau   UUID := 'f0000000-0000-0000-0000-000000000002';
    v_e_suzano UUID := 'f0000000-0000-0000-0000-000000000003';
    v_e_stone  UUID := 'f0000000-0000-0000-0000-000000000004';

    -- Pessoas
    v_p_beatriz   UUID := 'f1000000-0000-0000-0000-000000000001';
    v_p_frederico UUID := 'f1000000-0000-0000-0000-000000000002';
    v_p_marina    UUID := 'f1000000-0000-0000-0000-000000000003';
    v_p_carlos    UUID := 'f1000000-0000-0000-0000-000000000004';
    v_p_patricia  UUID := 'f1000000-0000-0000-0000-000000000005';
    v_p_rafael    UUID := 'f1000000-0000-0000-0000-000000000006';
    v_p_blima     UUID := 'f1000000-0000-0000-0000-000000000007';
    v_p_solto     UUID := 'f1000000-0000-0000-0000-000000000008';

    -- Cards
    v_c1 UUID := 'f2000000-0000-0000-0000-000000000001'; -- Magalu hotel verde
    v_c2 UUID := 'f2000000-0000-0000-0000-000000000002'; -- Magalu aéreo intl amarelo
    v_c3 UUID := 'f2000000-0000-0000-0000-000000000003'; -- Itaú aéreo nac vermelho
    v_c4 UUID := 'f2000000-0000-0000-0000-000000000004'; -- Suzano ganho
    v_c5 UUID := 'f2000000-0000-0000-0000-000000000005'; -- Stone perdido (op futura)
    v_c6 UUID := 'f2000000-0000-0000-0000-000000000006'; -- visitante solto
    v_c7 UUID := 'f2000000-0000-0000-0000-000000000007'; -- Itaú carro verde

    v_motivo_op_futura UUID;
BEGIN

    -- ========================================================================
    -- 0. Limpeza idempotente (em ordem reversa de FK)
    -- ========================================================================
    DELETE FROM cards_contatos
     WHERE card_id IN (v_c1, v_c2, v_c3, v_c4, v_c5, v_c6, v_c7);
    DELETE FROM cards
     WHERE id IN (v_c1, v_c2, v_c3, v_c4, v_c5, v_c6, v_c7);
    DELETE FROM contato_meios
     WHERE contato_id IN (
        v_p_beatriz, v_p_frederico, v_p_marina, v_p_carlos,
        v_p_patricia, v_p_rafael, v_p_blima, v_p_solto,
        v_e_magalu, v_e_itau, v_e_suzano, v_e_stone
     );
    DELETE FROM contatos
     WHERE id IN (
        v_p_beatriz, v_p_frederico, v_p_marina, v_p_carlos,
        v_p_patricia, v_p_rafael, v_p_blima, v_p_solto
     );
    DELETE FROM contatos
     WHERE id IN (v_e_magalu, v_e_itau, v_e_suzano, v_e_stone);

    -- ========================================================================
    -- 1. Lookup motivo "Oportunidade futura"
    -- ========================================================================
    SELECT id INTO v_motivo_op_futura
      FROM motivos_perda
     WHERE org_id = v_org
       AND lower(nome) = 'oportunidade futura'
     LIMIT 1;

    -- ========================================================================
    -- 2. Empresas (4)
    -- ========================================================================
    -- Empresas: só nome obrigatório (constraint isenta tipo='empresa')
    INSERT INTO contatos (id, org_id, nome, tipo_contato, tipo_pessoa, observacoes, origem)
    VALUES
        (v_e_magalu, v_org, 'Magazine Luiza',   'empresa', 'adulto',
         'Cliente Welcome desde mar/2024. Atende viagens executivas e eventos corporativos.', 'manual_corp'),
        (v_e_itau,   v_org, 'Itaú Unibanco',    'empresa', 'adulto',
         'Conta corporativa com fluxo intenso. Time RH centraliza pedidos.', 'manual_corp'),
        (v_e_suzano, v_org, 'Suzano',           'empresa', 'adulto',
         'Volume baixo mas tickets altos. Foco em viagens internacionais da diretoria.', 'manual_corp'),
        (v_e_stone,  v_org, 'Stone Pagamentos', 'empresa', 'adulto',
         'Eventos de vendas trimestrais. Demanda concentrada em hotelaria.', 'manual_corp');

    -- ========================================================================
    -- 3. Pessoas vinculadas às empresas
    -- ========================================================================
    INSERT INTO contatos (id, org_id, nome, sobrenome, tipo_contato, tipo_pessoa, empresa_id, cargo, email, telefone, origem)
    VALUES
        (v_p_beatriz,   v_org, 'Beatriz',  'Silva',    'pessoa', 'adulto', v_e_magalu, 'Secretaria executiva', 'beatriz.silva@magalu.com',  '11987651001', 'manual_corp'),
        (v_p_frederico, v_org, 'Frederico','Souza',    'pessoa', 'adulto', v_e_magalu, 'CEO',                  'frederico@magalu.com',      '11987651002', 'manual_corp'),
        (v_p_marina,    v_org, 'Marina',   'Costa',    'pessoa', 'adulto', v_e_itau,   'RH Corporativo',       'marina.costa@itau.com.br',  '11987652001', 'manual_corp'),
        (v_p_carlos,    v_org, 'Carlos',   'Andrade',  'pessoa', 'adulto', v_e_itau,   'Diretor de Operações', 'carlos.andrade@itau.com.br','11987652002', 'manual_corp'),
        (v_p_patricia,  v_org, 'Patrícia', 'Mendes',   'pessoa', 'adulto', v_e_suzano, 'Eventos corporativos', 'patricia@suzano.com.br',    '11987653001', 'manual_corp'),
        (v_p_rafael,    v_org, 'Rafael',   'Oliveira', 'pessoa', 'adulto', v_e_stone,  'Financeiro',           'rafael@stone.com.br',       '11987654001', 'manual_corp'),
        (v_p_blima,     v_org, 'Beatriz',  'Lima',     'pessoa', 'adulto', v_e_stone,  'Procurement',          'beatriz.lima@stone.com.br', '11987654002', 'manual_corp');

    -- Pessoa SOLTA (sem empresa) — pra demonstrar o banner "vincular à empresa"
    INSERT INTO contatos (id, org_id, nome, sobrenome, tipo_contato, tipo_pessoa, telefone, origem, last_whatsapp_conversation_id)
    VALUES (v_p_solto, v_org, 'Joana',    'Pereira', 'pessoa', 'adulto', '11912345678', 'echo', 'demo-conv-solto');

    -- ========================================================================
    -- 4. Telefones (contato_meios) — múltiplos por pessoa
    -- ========================================================================
    INSERT INTO contato_meios (org_id, contato_id, tipo, valor, valor_normalizado, is_principal, origem)
    VALUES
        (v_org, v_p_beatriz,   'whatsapp', '11987651001', '11987651001', TRUE, 'manual_corp'),
        (v_org, v_p_frederico, 'whatsapp', '11987651002', '11987651002', TRUE, 'manual_corp'),
        (v_org, v_p_marina,    'whatsapp', '11987652001', '11987652001', TRUE, 'manual_corp'),
        (v_org, v_p_carlos,    'whatsapp', '11987652002', '11987652002', TRUE, 'manual_corp'),
        (v_org, v_p_patricia,  'whatsapp', '11987653001', '11987653001', TRUE, 'manual_corp'),
        (v_org, v_p_rafael,    'whatsapp', '11987654001', '11987654001', TRUE, 'manual_corp'),
        (v_org, v_p_blima,     'whatsapp', '11987654002', '11987654002', TRUE, 'manual_corp'),
        (v_org, v_p_solto,     'whatsapp', '11912345678', '11912345678', TRUE, 'echo');

    -- ========================================================================
    -- 5. Cards
    --    Atenção: a trigger trg_corp_auto_move_to_fechado age em UPDATE.
    --    Pra inserir cards já fechados, setamos pipeline_stage_id manualmente.
    -- ========================================================================

    -- Card 1: Magazine Luiza, hotel, aberto há 30 min — VERDE
    INSERT INTO cards (
        id, org_id, titulo, pessoa_principal_id, pipeline_id, pipeline_stage_id,
        produto, origem, status_comercial, moeda, valor_estimado,
        produto_data, created_at, updated_at, stage_entered_at
    ) VALUES (
        v_c1, v_org, 'Magazine Luiza',
        v_e_magalu, v_pipeline, v_stage_aberto,
        'CORP', 'whatsapp', 'aberto', 'BRL', 12500,
        '{"categoria_produto": "hotel", "categoria_produto_meta": {"confianca": "alta", "auto": true}}'::jsonb,
        NOW() - INTERVAL '30 minutes',
        NOW() - INTERVAL '5 minutes',
        NOW() - INTERVAL '30 minutes'
    );
    INSERT INTO cards_contatos (card_id, contato_id, tipo_vinculo, org_id)
    VALUES (v_c1, v_p_beatriz, 'solicitante', v_org);

    -- Card 2: Magazine Luiza, aéreo internacional, aberto há 5h — AMARELO
    INSERT INTO cards (
        id, org_id, titulo, pessoa_principal_id, pipeline_id, pipeline_stage_id,
        produto, origem, status_comercial, moeda, valor_estimado,
        produto_data, created_at, updated_at, stage_entered_at
    ) VALUES (
        v_c2, v_org, 'Magazine Luiza',
        v_e_magalu, v_pipeline, v_stage_aberto,
        'CORP', 'whatsapp', 'aberto', 'BRL', 48000,
        '{"categoria_produto": "aereo_internacional", "categoria_produto_meta": {"confianca": "alta", "auto": true}}'::jsonb,
        NOW() - INTERVAL '5 hours',
        NOW() - INTERVAL '1 hour',
        NOW() - INTERVAL '5 hours'
    );
    INSERT INTO cards_contatos (card_id, contato_id, tipo_vinculo, org_id)
    VALUES (v_c2, v_p_frederico, 'solicitante', v_org);

    -- Card 3: Itaú, aéreo nacional, aberto há 2 dias — VERMELHO
    INSERT INTO cards (
        id, org_id, titulo, pessoa_principal_id, pipeline_id, pipeline_stage_id,
        produto, origem, status_comercial, moeda, valor_estimado,
        produto_data, created_at, updated_at, stage_entered_at
    ) VALUES (
        v_c3, v_org, 'Itaú Unibanco',
        v_e_itau, v_pipeline, v_stage_aberto,
        'CORP', 'whatsapp', 'aberto', 'BRL', 4200,
        '{"categoria_produto": "aereo_nacional", "categoria_produto_meta": {"confianca": "alta", "auto": true}}'::jsonb,
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '2 days',
        NOW() - INTERVAL '2 days'
    );
    INSERT INTO cards_contatos (card_id, contato_id, tipo_vinculo, org_id)
    VALUES (v_c3, v_p_marina, 'solicitante', v_org);

    -- Card 4: Suzano, hotel, GANHO ontem
    INSERT INTO cards (
        id, org_id, titulo, pessoa_principal_id, pipeline_id, pipeline_stage_id,
        produto, origem, status_comercial, moeda, valor_estimado, valor_final,
        ganho_planner, ganho_planner_at, data_fechamento,
        produto_data, created_at, updated_at, stage_entered_at
    ) VALUES (
        v_c4, v_org, 'Suzano',
        v_e_suzano, v_pipeline, v_stage_fechado,
        'CORP', 'whatsapp', 'ganho', 'BRL', 9800, 9800,
        TRUE, NOW() - INTERVAL '1 day', (NOW() - INTERVAL '1 day')::date,
        '{"categoria_produto": "hotel", "categoria_produto_meta": {"confianca": "alta", "auto": true}}'::jsonb,
        NOW() - INTERVAL '3 days',
        NOW() - INTERVAL '1 day',
        NOW() - INTERVAL '1 day'
    );
    INSERT INTO cards_contatos (card_id, contato_id, tipo_vinculo, org_id)
    VALUES (v_c4, v_p_patricia, 'solicitante', v_org);

    -- Card 5: Stone, PERDIDO com motivo "Oportunidade futura"
    INSERT INTO cards (
        id, org_id, titulo, pessoa_principal_id, pipeline_id, pipeline_stage_id,
        produto, origem, status_comercial, moeda, valor_estimado,
        motivo_perda_id, motivo_perda_comentario, data_fechamento,
        produto_data, created_at, updated_at, stage_entered_at
    ) VALUES (
        v_c5, v_org, 'Stone Pagamentos',
        v_e_stone, v_pipeline, v_stage_fechado,
        'CORP', 'whatsapp', 'perdido', 'BRL', 35000,
        v_motivo_op_futura,
        'Cliente quer reavaliar com novo orçamento Q3 2026. Retomar em julho.',
        (NOW() - INTERVAL '6 hours')::date,
        '{"categoria_produto": "seguro_viagem", "categoria_produto_meta": {"confianca": "media", "auto": true}}'::jsonb,
        NOW() - INTERVAL '4 days',
        NOW() - INTERVAL '6 hours',
        NOW() - INTERVAL '6 hours'
    );
    INSERT INTO cards_contatos (card_id, contato_id, tipo_vinculo, org_id)
    VALUES (v_c5, v_p_rafael, 'solicitante', v_org);

    -- Card 6: VISITANTE SOLTO (sem empresa) — banner aparece
    INSERT INTO cards (
        id, org_id, titulo, pessoa_principal_id, pipeline_id, pipeline_stage_id,
        produto, origem, status_comercial, moeda,
        produto_data, created_at, updated_at, stage_entered_at
    ) VALUES (
        v_c6, v_org, 'Joana Pereira',
        v_p_solto, v_pipeline, v_stage_aberto,
        'CORP', 'whatsapp', 'aberto', 'BRL',
        '{}'::jsonb,
        NOW() - INTERVAL '1 hour',
        NOW() - INTERVAL '15 minutes',
        NOW() - INTERVAL '1 hour'
    );

    -- Card 7: Itaú, carro, aberto há 90 min — VERDE (segunda demanda da Itaú)
    INSERT INTO cards (
        id, org_id, titulo, pessoa_principal_id, pipeline_id, pipeline_stage_id,
        produto, origem, status_comercial, moeda, valor_estimado,
        produto_data, created_at, updated_at, stage_entered_at
    ) VALUES (
        v_c7, v_org, 'Itaú Unibanco',
        v_e_itau, v_pipeline, v_stage_aberto,
        'CORP', 'whatsapp', 'aberto', 'BRL', 1800,
        '{"categoria_produto": "carro", "categoria_produto_meta": {"confianca": "alta", "auto": true}}'::jsonb,
        NOW() - INTERVAL '90 minutes',
        NOW() - INTERVAL '20 minutes',
        NOW() - INTERVAL '90 minutes'
    );
    INSERT INTO cards_contatos (card_id, contato_id, tipo_vinculo, org_id)
    VALUES (v_c7, v_p_carlos, 'solicitante', v_org);

    RAISE NOTICE '✅ Seed Corp criado: 4 empresas, 8 pessoas, 7 cards (5 abertos, 1 ganho, 1 perdido)';
END $seed$;

COMMIT;
