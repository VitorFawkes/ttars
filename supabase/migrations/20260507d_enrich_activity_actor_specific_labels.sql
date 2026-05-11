-- ============================================================================
-- MIGRATION: actor_label específico para auto_calc (Auto-cálculo · <campo>)
-- Date: 2026-05-07
--
-- Histórico da função enrich_activity_actor (releitura obrigatória, CLAUDE.md §TOP 5 #5):
--   20260504p — criação. 5 ramos: humano, ai_agent, integração externa,
--               analytics_v2_fase0 (system), fallback (system).
--   20260504u — adicionou 'cron' à integração externa com label "Automação agendada".
--   20260506b — adicionou 'auto_calc' à integração externa com label "Automação"
--               + comentário no ramo humano.
--
-- Esta migration preserva 100% das correções acima e isola apenas 'auto_calc'
-- num ramo próprio (motivo abaixo).
--
-- Problema: na timeline de Atividades, mudanças de automação interna
-- (source='auto_calc', ex: hook useAutoCalcTripDate em src/hooks/) aparecem
-- com badge genérico "Automação" e actor_type='integration'. O usuário não
-- distingue QUAL automação fez a mudança, e 'integration' é semanticamente
-- errado (auto-cálculo é lógica interna do app, não integração externa).
--
-- Correção:
-- 1. enrich_activity_actor passa a classificar 'auto_calc' como
--    actor_type='system' (não 'integration') e gera label específico
--    a partir de field_key/field_label do metadata.
--    Ex: "Auto-cálculo · Data Viagem" para field_key=data_exata_da_viagem.
-- 2. Backfill das atividades existentes com label "Automação".
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) enrich_activity_actor — auto_calc vira system com label específico
--    Preserva: ramos humano, ai_agent, integração (com cron), analytics_v2,
--    fallback. Isola auto_calc num bloco próprio antes da integração.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enrich_activity_actor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_source TEXT;
    v_agent_id UUID;
    v_agent_nome TEXT;
    v_user_nome TEXT;
    v_field_key TEXT;
    v_field_label TEXT;
BEGIN
    IF NEW.actor_type IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_source := COALESCE(NEW.metadata->>'source', '');

    -- 1. Humano (só se source não é automação/integração)
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

    -- 3. Auto-cálculo (lógica interna do app, não integração externa)
    --    Gera label específico a partir do field_key para o usuário saber
    --    qual auto-cálculo disparou (Data Viagem, futuros, etc).
    IF v_source = 'auto_calc' THEN
        v_field_key := NEW.metadata->>'field_key';
        v_field_label := NEW.metadata->>'field_label';

        NEW.actor_type := 'system';
        NEW.actor_id := NULL;
        NEW.actor_label := CASE v_field_key
            WHEN 'data_exata_da_viagem' THEN 'Auto-cálculo · Data Viagem'
            ELSE 'Auto-cálculo · ' || COALESCE(NULLIF(v_field_label, ''), NULLIF(v_field_key, ''), 'campo')
        END;
        RETURN NEW;
    END IF;

    -- 4. Integração / sistema externo / automação
    --    PRESERVA todas as 13 entradas das migrations 504p, 504u, 506b.
    --    Removido apenas 'auto_calc' (que foi pro ramo 3 acima).
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

    -- 5. Backfill do Analytics v2
    IF v_source = 'analytics_v2_fase0' THEN
        NEW.actor_type := 'system';
        NEW.actor_id := NULL;
        NEW.actor_label := 'Sistema (analytics)';
        RETURN NEW;
    END IF;

    -- 6. Fallback genérico
    NEW.actor_type := 'system';
    NEW.actor_id := NULL;
    NEW.actor_label := 'Sistema';
    RETURN NEW;
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2) Backfill — reclassificar atividades existentes com source=auto_calc
-- ----------------------------------------------------------------------------
UPDATE public.activities
SET actor_type = 'system',
    actor_label = CASE metadata->>'field_key'
        WHEN 'data_exata_da_viagem' THEN 'Auto-cálculo · Data Viagem'
        ELSE 'Auto-cálculo · ' || COALESCE(
            NULLIF(metadata->>'field_label', ''),
            NULLIF(metadata->>'field_key', ''),
            'campo'
        )
    END
WHERE metadata->>'source' = 'auto_calc'
  AND actor_label = 'Automação';

COMMIT;
