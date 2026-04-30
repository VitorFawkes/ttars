-- ============================================================================
-- MIGRATION: Welcome Corporativo — mensagens fake nos cards demo
-- Date: 2026-04-30
--
-- Pra que o painel "Status do atendimento" tenha conteúdo realista,
-- popula mensagens fake variando direção e timing.
-- ============================================================================

BEGIN;

DO $msgs$
DECLARE
    v_org UUID := 'b0000000-0000-0000-0000-000000000003';

    v_c1 UUID := 'f2000000-0000-0000-0000-000000000001'; -- Magalu hotel
    v_c2 UUID := 'f2000000-0000-0000-0000-000000000002'; -- Magalu aéreo intl
    v_c3 UUID := 'f2000000-0000-0000-0000-000000000003'; -- Itaú aéreo nac (atrasado)
    v_c4 UUID := 'f2000000-0000-0000-0000-000000000004'; -- Suzano ganho
    v_c5 UUID := 'f2000000-0000-0000-0000-000000000005'; -- Stone perdido
    v_c6 UUID := 'f2000000-0000-0000-0000-000000000006'; -- Joana solta
    v_c7 UUID := 'f2000000-0000-0000-0000-000000000007'; -- Itaú carro

    v_p_beatriz   UUID := 'f1000000-0000-0000-0000-000000000001';
    v_p_frederico UUID := 'f1000000-0000-0000-0000-000000000002';
    v_p_marina    UUID := 'f1000000-0000-0000-0000-000000000003';
    v_p_carlos    UUID := 'f1000000-0000-0000-0000-000000000004';
    v_p_patricia  UUID := 'f1000000-0000-0000-0000-000000000005';
    v_p_rafael    UUID := 'f1000000-0000-0000-0000-000000000006';
    v_p_solto     UUID := 'f1000000-0000-0000-0000-000000000008';
BEGIN

    -- Limpa mensagens fake anteriores
    DELETE FROM whatsapp_messages
     WHERE org_id = v_org
       AND external_id LIKE 'demo-%';

    -- ========================================================================
    -- Card 1 (Magalu hotel, aberto há 30min): cliente acabou de perguntar
    --   → última = INBOUND há 5min → "Aguardando resposta nossa há 5min"
    -- ========================================================================
    INSERT INTO whatsapp_messages (org_id, card_id, contact_id, direction, body, message_type, conversation_id, sender_name, external_id, created_at)
    VALUES
        (v_org, v_c1, v_p_beatriz, 'inbound',
         'Boa tarde! Preciso reservar 3 noites em SP para o Frederico, do dia 12 ao 15 de maio. Algum hotel 5 estrelas perto da Faria Lima?',
         'text', 'demo-conv-magalu-hotel', 'Beatriz Silva', 'demo-msg-001',
         NOW() - INTERVAL '28 minutes'),
        (v_org, v_c1, v_p_beatriz, 'outbound',
         'Oi Beatriz! Tenho 3 opções: Fasano, Tivoli Mofarrej e Hotel Unique. Te mando a comparação em alguns minutos. 😊',
         'text', 'demo-conv-magalu-hotel', NULL, 'demo-msg-002',
         NOW() - INTERVAL '20 minutes'),
        (v_org, v_c1, v_p_beatriz, 'inbound',
         'Perfeito, fico no aguardo! Preferência por hotel com sala de reunião privada se possível.',
         'text', 'demo-conv-magalu-hotel', 'Beatriz Silva', 'demo-msg-003',
         NOW() - INTERVAL '5 minutes');

    -- ========================================================================
    -- Card 2 (Magalu aéreo intl, aberto há 5h): mandamos cotação há 1h
    --   → última = OUTBOUND há 1h → "Última msg foi nossa há 1h"
    -- ========================================================================
    INSERT INTO whatsapp_messages (org_id, card_id, contact_id, direction, body, message_type, conversation_id, sender_name, external_id, created_at)
    VALUES
        (v_org, v_c2, v_p_frederico, 'inbound',
         'Bom dia! Preciso de 3 passagens GRU-LIS-GRU em executiva. Saída dia 8 de maio, retorno dia 15.',
         'text', 'demo-conv-magalu-aero', 'Frederico Souza', 'demo-msg-010',
         NOW() - INTERVAL '5 hours'),
        (v_org, v_c2, v_p_frederico, 'outbound',
         'Bom dia Frederico! Já estou cotando com TAP, LATAM e Air France. Te retorno em até 2h com as 3 opções.',
         'text', 'demo-conv-magalu-aero', NULL, 'demo-msg-011',
         NOW() - INTERVAL '4 hours 50 minutes'),
        (v_org, v_c2, v_p_frederico, 'outbound',
         'Frederico, segue a comparação: TAP R$ 14.800 (melhor horário), LATAM R$ 13.200 (escala em GRU-CGH), Air France R$ 16.500 (via CDG). Aguardo sua escolha.',
         'text', 'demo-conv-magalu-aero', NULL, 'demo-msg-012',
         NOW() - INTERVAL '1 hour');

    -- ========================================================================
    -- Card 3 (Itaú aéreo nac, aberto há 2 dias): cotação enviada, cliente sumiu
    --   → última = OUTBOUND há 1.5 dias → "Última msg nossa · hora de retomar"
    -- ========================================================================
    INSERT INTO whatsapp_messages (org_id, card_id, contact_id, direction, body, message_type, conversation_id, sender_name, external_id, created_at)
    VALUES
        (v_org, v_c3, v_p_marina, 'inbound',
         'Oi! Preciso de 4 passagens GRU-CGH ida e volta para reunião de diretoria. Datas: 14/05 ida, 16/05 volta.',
         'text', 'demo-conv-itau-aero', 'Marina Costa', 'demo-msg-020',
         NOW() - INTERVAL '2 days'),
        (v_org, v_c3, v_p_marina, 'outbound',
         'Marina, cotei na LATAM e GOL. LATAM tá R$ 1.050 por trecho, GOL R$ 980. Quer reservar?',
         'text', 'demo-conv-itau-aero', NULL, 'demo-msg-021',
         NOW() - INTERVAL '1 day 18 hours');

    -- ========================================================================
    -- Card 4 (Suzano GANHO): voucher enviado ontem
    --   → última = OUTBOUND há 1 dia
    -- ========================================================================
    INSERT INTO whatsapp_messages (org_id, card_id, contact_id, direction, body, message_type, conversation_id, sender_name, external_id, created_at)
    VALUES
        (v_org, v_c4, v_p_patricia, 'inbound',
         'Quero reservar 2 noites em Punta del Este pro fim de semana. Hotel Fasano se possível.',
         'text', 'demo-conv-suzano', 'Patrícia Mendes', 'demo-msg-030',
         NOW() - INTERVAL '3 days'),
        (v_org, v_c4, v_p_patricia, 'outbound',
         'Patrícia, fechado no Fasano! R$ 9.800 total, 2 noites. Voucher já está chegando no seu e-mail.',
         'text', 'demo-conv-suzano', NULL, 'demo-msg-031',
         NOW() - INTERVAL '1 day');

    -- ========================================================================
    -- Card 5 (Stone PERDIDO): cliente disse que vai esperar Q3
    --   → última = INBOUND há 6h
    -- ========================================================================
    INSERT INTO whatsapp_messages (org_id, card_id, contact_id, direction, body, message_type, conversation_id, sender_name, external_id, created_at)
    VALUES
        (v_org, v_c5, v_p_rafael, 'inbound',
         'Preciso seguro viagem pro evento de Búzios. 80 pessoas, 3 dias.',
         'text', 'demo-conv-stone', 'Rafael Oliveira', 'demo-msg-040',
         NOW() - INTERVAL '4 days'),
        (v_org, v_c5, v_p_rafael, 'outbound',
         'Cotei seguro premium pra grupo: R$ 35.000 total, cobertura completa.',
         'text', 'demo-conv-stone', NULL, 'demo-msg-041',
         NOW() - INTERVAL '3 days'),
        (v_org, v_c5, v_p_rafael, 'inbound',
         'Travou no orçamento aqui. Vou ter que esperar Q3 2026 pra reavaliar. Mantém contato? 🙏',
         'text', 'demo-conv-stone', 'Rafael Oliveira', 'demo-msg-042',
         NOW() - INTERVAL '6 hours');

    -- ========================================================================
    -- Card 6 (Joana SOLTA, há 1h): mandou mensagem há 15min, ainda sem resposta
    --   → última = INBOUND há 15min → "Aguardando resposta nossa"
    -- ========================================================================
    INSERT INTO whatsapp_messages (org_id, card_id, contact_id, direction, body, message_type, conversation_id, sender_name, external_id, created_at)
    VALUES
        (v_org, v_c6, v_p_solto, 'inbound',
         'Oi, vocês podem cotar uma passagem pra Recife? Saída sexta.',
         'text', 'demo-conv-solto', 'Joana Pereira', 'demo-msg-050',
         NOW() - INTERVAL '55 minutes'),
        (v_org, v_c6, v_p_solto, 'inbound',
         'Ah, esqueci de falar — preciso disso pra hoje à tarde se possível.',
         'text', 'demo-conv-solto', 'Joana Pereira', 'demo-msg-051',
         NOW() - INTERVAL '15 minutes');

    -- ========================================================================
    -- Card 7 (Itaú carro, 90min): conversa ativa
    --   → última = INBOUND há 20min → "Aguardando resposta nossa"
    -- ========================================================================
    INSERT INTO whatsapp_messages (org_id, card_id, contact_id, direction, body, message_type, conversation_id, sender_name, external_id, created_at)
    VALUES
        (v_org, v_c7, v_p_carlos, 'inbound',
         'Olha, preciso de um carro premium pra 3 dias em SP. Audi A4 ou similar. Retirada GRU dia 14/05.',
         'text', 'demo-conv-itau-carro', 'Carlos Andrade', 'demo-msg-060',
         NOW() - INTERVAL '85 minutes'),
        (v_org, v_c7, v_p_carlos, 'outbound',
         'Carlos, vou cotar com Localiza e Movida. Te volto em 30min.',
         'text', 'demo-conv-itau-carro', NULL, 'demo-msg-061',
         NOW() - INTERVAL '70 minutes'),
        (v_org, v_c7, v_p_carlos, 'inbound',
         'Beleza, pode ser um automático preferencialmente.',
         'text', 'demo-conv-itau-carro', 'Carlos Andrade', 'demo-msg-062',
         NOW() - INTERVAL '20 minutes');

    RAISE NOTICE '✅ Mensagens fake populadas em todos os 7 cards demo';
END $msgs$;

COMMIT;
