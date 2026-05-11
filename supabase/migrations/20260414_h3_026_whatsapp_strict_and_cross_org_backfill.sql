-- H3-026: Hardening whatsapp_messages + backfill cross-org histórico
--
-- CONTEXTO
-- Após H3-025, auditoria identificou:
-- 1. whatsapp_messages ainda usa auto_set_org_id_from_card (com fallback
--    Welcome Group hardcoded). Hoje 33.345 mensagens sem card_id estão em
--    Welcome Group legítimo (contatos lá). Porém futuramente um contato de
--    org não-Welcome mandando WhatsApp antes do card existir cairia em
--    Welcome Group por fallback — leak cross-org latente.
-- 2. 8 rows históricos com cross-org leak (row.org_id != card.org_id):
--    - 2 historico_fases (Welcome Group mas card é TRIPS)
--    - 2 activities (idem)
--    - 2 integration_outbound_queue (criadas 2026-04-11 pré-fix)
-- 3. 4 cadence_steps com cross-org — não mexer (admin cross-editando
--    template legítimo pela UI, ou legado do Org Split).
--
-- DECISÕES
-- - whatsapp_messages: trocar trigger genérico por variante STRICT com
--   cascade JWT → card → contact_id → contatos.org_id. Sem fallback
--   Welcome Group. Abortar se cascade falhar.
-- - Backfill dos 6 rows legados (historico_fases + activities + outbound):
--   SET org_id = card.org_id. Operação segura (UPDATE simples, baixo volume).
-- - cadence_steps: NÃO backfill aqui. Cross-org é resultado de admin
--   gerenciando template de outra org via UI (trade-off de design).

-- =============================================================================
-- 1. Função strict para whatsapp_messages — cascade card → contact
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auto_set_whatsapp_messages_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.org_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    NEW.org_id := requesting_org_id();

    IF NEW.org_id IS NULL AND NEW.card_id IS NOT NULL THEN
        SELECT org_id INTO NEW.org_id FROM public.cards WHERE id = NEW.card_id;
    END IF;

    IF NEW.org_id IS NULL AND NEW.contact_id IS NOT NULL THEN
        SELECT org_id INTO NEW.org_id FROM public.contatos WHERE id = NEW.contact_id;
    END IF;

    -- Sem fallback hardcoded: NOT NULL constraint aborta com erro claro.
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_set_whatsapp_messages_org_id() IS
    'Preenche org_id em whatsapp_messages via cascade JWT→card→contact. '
    'Substitui auto_set_org_id_from_card (genérico, com fallback Welcome Group) '
    'para evitar cross-org leak quando mensagens chegam antes do card existir.';

-- Trocar trigger (drop antigo auto_set_org_id_trigger, criar novo específico)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='whatsapp_messages') THEN
        DROP TRIGGER IF EXISTS auto_set_org_id_trigger ON public.whatsapp_messages;
        DROP TRIGGER IF EXISTS auto_set_whatsapp_messages_org_id_trigger ON public.whatsapp_messages;
        CREATE TRIGGER auto_set_whatsapp_messages_org_id_trigger
            BEFORE INSERT ON public.whatsapp_messages
            FOR EACH ROW EXECUTE FUNCTION public.auto_set_whatsapp_messages_org_id();
        RAISE NOTICE 'H3-026: trigger strict criado em whatsapp_messages';
    END IF;
END $$;

-- =============================================================================
-- 2. Backfill cross-org histórico (6 rows)
-- =============================================================================
DO $$
DECLARE
    v_hist INT := 0; v_act INT := 0; v_out INT := 0;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='historico_fases' AND column_name='org_id') THEN
        WITH updated AS (
            UPDATE public.historico_fases h
            SET org_id = c.org_id
            FROM public.cards c
            WHERE h.card_id = c.id AND h.org_id != c.org_id
            RETURNING h.id
        ) SELECT COUNT(*) INTO v_hist FROM updated;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='activities' AND column_name='org_id') THEN
        WITH updated AS (
            UPDATE public.activities a
            SET org_id = c.org_id
            FROM public.cards c
            WHERE a.card_id = c.id AND a.org_id != c.org_id
            RETURNING a.id
        ) SELECT COUNT(*) INTO v_act FROM updated;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='integration_outbound_queue' AND column_name='org_id') THEN
        WITH updated AS (
            UPDATE public.integration_outbound_queue q
            SET org_id = c.org_id
            FROM public.cards c
            WHERE q.card_id = c.id AND q.org_id != c.org_id
            RETURNING q.id
        ) SELECT COUNT(*) INTO v_out FROM updated;
    END IF;

    RAISE NOTICE 'H3-026 backfill: historico_fases=%, activities=%, outbound_queue=%',
                 v_hist, v_act, v_out;
END $$;

-- =============================================================================
-- 3. Smoke tests
-- =============================================================================
DO $$
DECLARE
    v_hist_leak INT := 0; v_act_leak INT := 0; v_out_leak INT := 0;
    v_trigger_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.triggers
        WHERE trigger_name = 'auto_set_whatsapp_messages_org_id_trigger'
    ) INTO v_trigger_exists;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='historico_fases' AND column_name='org_id') THEN
        SELECT COUNT(*) INTO v_hist_leak
        FROM historico_fases h JOIN cards c ON c.id = h.card_id
        WHERE h.org_id != c.org_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='activities' AND column_name='org_id') THEN
        SELECT COUNT(*) INTO v_act_leak
        FROM activities a JOIN cards c ON c.id = a.card_id
        WHERE a.org_id != c.org_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='integration_outbound_queue' AND column_name='org_id') THEN
        SELECT COUNT(*) INTO v_out_leak
        FROM integration_outbound_queue q JOIN cards c ON c.id = q.card_id
        WHERE q.org_id != c.org_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='whatsapp_messages')
       AND NOT v_trigger_exists THEN
        RAISE EXCEPTION 'H3-026: trigger whatsapp_messages não criado';
    END IF;

    IF v_hist_leak > 0 OR v_act_leak > 0 OR v_out_leak > 0 THEN
        RAISE EXCEPTION 'H3-026 backfill incompleto: hist=%, act=%, out=%',
                        v_hist_leak, v_act_leak, v_out_leak;
    END IF;

    RAISE NOTICE 'H3-026: smoke test OK';
END $$;
