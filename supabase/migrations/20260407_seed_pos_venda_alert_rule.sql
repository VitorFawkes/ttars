-- ============================================================================
-- MIGRATION: Seed da regra inicial de alerta para Pós-Venda
-- Date: 2026-04-07
--
-- Cria (DESATIVADA) uma regra que alerta donos de cards em "App & Conteúdo
-- em Montagem" (1ª etapa de pós-venda do pipeline Welcome Trips) que ainda
-- não têm os requisitos cumpridos (numero_venda_monde + contato completo).
--
-- IMPORTANTE: nasce com is_active=false. Admin ativa via UI quando estiver
-- pronto pra receber a primeira leva de alertas. A primeira execução vai
-- criar ~105 notifications (cards sem numero_venda_monde) + ~49 (contato
-- incompleto) para os respectivos donos.
-- ============================================================================

-- Só insere em produção, staging não tem o stage b2b0679c
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pipeline_stages
        WHERE id = 'b2b0679c-ea06-4b46-9dd4-ee02abff1a36'
    ) THEN
        INSERT INTO card_alert_rules (
            org_id,
            name,
            description,
            severity,
            stage_id,
            condition,
            trigger_mode,
            daily_time,
            title_template,
            body_template,
            send_email,
            is_active
        )
        VALUES (
            'a0000000-0000-0000-0000-000000000001',
            'Pós-venda — requisitos pendentes',
            'Cards na 1ª etapa de pós-venda (App & Conteúdo em Montagem) sem todos os requisitos cumpridos: Número de Venda Monde e/ou contato principal completo.',
            'critical',
            'b2b0679c-ea06-4b46-9dd4-ee02abff1a36',
            '{"type":"stage_requirements"}'::jsonb,
            'daily_cron',
            '06:00'::time,
            'Card "{titulo}" precisa de ajuste',
            'O card está em "{stage_name}" e precisa dos seguintes campos: {missing_fields}',
            false,
            false  -- DESATIVADA — admin ativa via UI
        )
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
