-- =====================================================================
-- Drop do sistema legado de automações (Fase 1 da unificação de Automações)
-- =====================================================================
-- Remove dois subsistemas paralelos que eram testes e não estão em uso:
--
--   A) automacao_* (Automação de Mensagens legacy)
--      - 4 tabelas: automacao_regras, automacao_execucoes, automacao_optout,
--        automacao_regra_passos (todas com 0 linhas em prod)
--      - 3 triggers alimentavam automacao_execucoes em eventos de card/
--        documento/proposta — com automacao_regras vazia, todos os INSERTs
--        viravam no-op (nenhum match de regra), mas os triggers rodavam
--        em todo UPDATE de cards = desperdício
--      - 4 funções de suporte
--
--   B) automation_rules + task_queue (scheduler de tarefas legacy, em inglês)
--      - 2 tabelas: automation_rules (1 linha de teste inativa), task_queue
--        (1 linha órfã apontando pra regra inativa)
--      - 1 trigger em cards que lia automation_rules a cada stage change
--      - automation_log (0 linhas, dependência FK)
--      - 3 funções: execute_automation_rules, schedule_tasks_on_stage_change,
--        process_task_queue
--
-- Sistemas VIVOS preservados (nenhum toca nas tabelas/funções removidas):
--   - AC outbound:   log_outbound_card_event, handle_outbound_webhook,
--                    trg_card_outbound_*, trigger_outbound_webhook_cards
--   - Cadence:       process_cadence_entry_on_card_create/stage_change,
--                    auto_start_cadence_for_new_card, cadence_event_triggers
--                    (driver do pós-venda App & Conteúdo)
--   - Integrations:  integration_outbound_*, integration_events, RPCs
--                    check_outbound_trigger, get_outbound_*, should_sync_field
--
-- Contexto: https://github.com/VitorFawkes/ttars — Fase 1 da unificação
-- de Automações. CadenceListPage e o engine cadence_* continuam funcionando.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Pré-flight: validação do estado esperado (tolerante a drift staging/prod)
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Se alguma tabela não existe (staging já drenou), pula a checagem dela

    IF to_regclass('public.task_queue') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM public.task_queue WHERE processed = false' INTO v_count;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'ABORTADO: task_queue tem % tarefas pendentes não processadas.', v_count;
        END IF;
        RAISE NOTICE 'task_queue: 0 pendentes ✓';
    END IF;

    IF to_regclass('public.automacao_execucoes') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM public.automacao_execucoes' INTO v_count;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'ABORTADO: automacao_execucoes tem % linhas. Sistema pode estar em uso.', v_count;
        END IF;
        RAISE NOTICE 'automacao_execucoes: 0 linhas ✓';
    END IF;

    IF to_regclass('public.automation_rules') IS NOT NULL THEN
        EXECUTE 'SELECT COUNT(*) FROM public.automation_rules WHERE is_active = true' INTO v_count;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'ABORTADO: automation_rules tem % regras ativas. Sistema em uso.', v_count;
        END IF;
        RAISE NOTICE 'automation_rules: 0 ativas ✓';
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Drop triggers nas tabelas VIVAS (cards, card_document_requirements,
--    proposal_events) que usam as funções legacy.
--    Tolerante a drift: só dropa se a tabela-alvo existir.
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.cards') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trigger_automation_rules ON public.cards;
        DROP TRIGGER IF EXISTS trg_automacao_card_event ON public.cards;
    END IF;
    IF to_regclass('public.card_document_requirements') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_automacao_documento_event ON public.card_document_requirements;
    END IF;
    IF to_regclass('public.proposal_events') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_automacao_proposta_event ON public.proposal_events;
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Drop funções legacy (triggers já foram removidos acima)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.execute_automation_rules() CASCADE;
DROP FUNCTION IF EXISTS public.schedule_tasks_on_stage_change() CASCADE;
DROP FUNCTION IF EXISTS public.process_task_queue() CASCADE;
DROP FUNCTION IF EXISTS public.queue_automacao_event() CASCADE;
DROP FUNCTION IF EXISTS public.queue_automacao_documento_event() CASCADE;
DROP FUNCTION IF EXISTS public.queue_automacao_proposta_event() CASCADE;
DROP FUNCTION IF EXISTS public.count_automacao_metrics(uuid) CASCADE;

-- ---------------------------------------------------------------------
-- 4. Drop tabelas do scheduler legacy (ordem: filhas → pais)
-- ---------------------------------------------------------------------
-- task_queue depende de automation_rules (FK rule_id)
DROP TABLE IF EXISTS public.task_queue CASCADE;

-- automation_log depende de automation_rules (FK rule_id)
DROP TABLE IF EXISTS public.automation_log CASCADE;

-- automation_rules + seu audit trigger (audit_automation_rules_changes cai no CASCADE)
DROP TABLE IF EXISTS public.automation_rules CASCADE;

-- ---------------------------------------------------------------------
-- 5. Drop tabelas da Automação de Mensagens legacy (ordem: filhas → pais)
-- ---------------------------------------------------------------------
-- automacao_optout depende de automacao_regras
DROP TABLE IF EXISTS public.automacao_optout CASCADE;

-- automacao_execucoes depende de automacao_regras + automacao_regra_passos
DROP TABLE IF EXISTS public.automacao_execucoes CASCADE;

-- automacao_regra_passos depende de automacao_regras
DROP TABLE IF EXISTS public.automacao_regra_passos CASCADE;

-- automacao_regras (raiz)
DROP TABLE IF EXISTS public.automacao_regras CASCADE;

-- ---------------------------------------------------------------------
-- 6. Verificação pós-drop
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_remaining TEXT[];
BEGIN
    SELECT ARRAY_AGG(table_name ORDER BY table_name) INTO v_remaining
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN (
        'automacao_regras', 'automacao_execucoes', 'automacao_optout',
        'automacao_regra_passos', 'automation_log', 'automation_rules',
        'task_queue'
    );

    IF v_remaining IS NOT NULL AND array_length(v_remaining, 1) > 0 THEN
        RAISE EXCEPTION 'DROP incompleto: tabelas remanescentes = %', v_remaining;
    END IF;

    RAISE NOTICE 'OK: 7 tabelas legacy removidas (6 do plano + task_queue descoberta).';
END $$;

COMMIT;
