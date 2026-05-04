-- ============================================================================
-- MIGRATION: enrich_activity_actor reconhece source='cron'
-- Date: 2026-05-04
--
-- A migration 20260504t (descricoes mais ricas) faz o trigger de tarefas
-- marcar metadata.source='cron' quando detecta atualizacao em massa de
-- data_vencimento sem usuario autenticado (e.g. cron de re-agendamento).
--
-- Esta migration estende enrich_activity_actor para reconhecer 'cron' e
-- classificar como actor_type='integration' com label 'Cron'. Sem isso,
-- 'cron' caia no fallback 'Sistema'.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.enrich_activity_actor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_source TEXT;
    v_agent_id UUID;
    v_agent_nome TEXT;
    v_user_nome TEXT;
BEGIN
    IF NEW.actor_type IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_source := COALESCE(NEW.metadata->>'source', '');

    -- 1. Humano
    IF NEW.created_by IS NOT NULL THEN
        SELECT nome INTO v_user_nome
        FROM public.profiles
        WHERE id = NEW.created_by;

        NEW.actor_type := 'user';
        NEW.actor_id := NEW.created_by;
        NEW.actor_label := COALESCE(v_user_nome, 'Usuário');
        RETURN NEW;
    END IF;

    -- 2. Agente IA
    IF v_source = 'ai_agent' THEN
        BEGIN
            v_agent_id := (NEW.metadata->>'agent_id')::UUID;
        EXCEPTION WHEN OTHERS THEN
            v_agent_id := NULL;
        END;

        IF v_agent_id IS NOT NULL THEN
            SELECT nome INTO v_agent_nome
            FROM public.ai_agents
            WHERE id = v_agent_id;
        END IF;

        NEW.actor_type := 'ai_agent';
        NEW.actor_id := v_agent_id;
        NEW.actor_label := COALESCE(v_agent_nome, 'IA');
        RETURN NEW;
    END IF;

    -- 3. Integração / sistema externo (cron incluído nesta classe)
    IF v_source IN (
        'integration', 'active_campaign', 'monde', 'n8n',
        'api', 'automacao', 'ai_agent_router', 'ai_outbound_trigger',
        'webhook', 'whatsapp_inbound', 'whatsapp_outbound', 'cron'
    ) THEN
        NEW.actor_type := 'integration';
        NEW.actor_id := NULL;
        NEW.actor_label := CASE v_source
            WHEN 'active_campaign' THEN 'ActiveCampaign'
            WHEN 'monde' THEN 'Monde'
            WHEN 'n8n' THEN 'n8n'
            WHEN 'integration' THEN 'Integração'
            WHEN 'api' THEN 'API'
            WHEN 'automacao' THEN 'Automação'
            WHEN 'ai_agent_router' THEN 'IA (router)'
            WHEN 'ai_outbound_trigger' THEN 'IA (outbound)'
            WHEN 'webhook' THEN 'Webhook'
            WHEN 'whatsapp_inbound' THEN 'WhatsApp'
            WHEN 'whatsapp_outbound' THEN 'WhatsApp'
            WHEN 'cron' THEN 'Automação agendada'
            ELSE v_source
        END;
        RETURN NEW;
    END IF;

    -- 4. Backfill do Analytics v2
    IF v_source = 'analytics_v2_fase0' THEN
        NEW.actor_type := 'system';
        NEW.actor_id := NULL;
        NEW.actor_label := 'Sistema (analytics)';
        RETURN NEW;
    END IF;

    -- 5. Fallback genérico
    NEW.actor_type := 'system';
    NEW.actor_id := NULL;
    NEW.actor_label := 'Sistema';
    RETURN NEW;
END;
$fn$;

COMMIT;
