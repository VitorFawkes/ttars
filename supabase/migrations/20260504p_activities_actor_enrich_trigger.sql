-- ============================================================================
-- MIGRATION: activities — trigger BEFORE INSERT que infere actor_*
-- Date: 2026-05-04
--
-- Estratégia: em vez de patchear cada um dos ~15 lugares que fazem INSERT em
-- activities (3 RPCs, 4+ triggers SQL, 7+ edge functions, hooks frontend),
-- centralizar a lógica de autoria num trigger BEFORE INSERT.
--
-- O trigger só preenche os campos quando estão NULL — quem quiser passar
-- explicitamente actor_type/actor_id/actor_label continua funcionando (override).
--
-- Regras de inferência (em ordem):
--   1. created_by IS NOT NULL → user (label = profiles.nome)
--   2. metadata.source = 'ai_agent' → ai_agent
--        - se metadata.agent_id existe → label = ai_agents.nome
--        - senão → label = 'IA' (fallback)
--   3. metadata.source IN ('integration','active_campaign','monde','n8n',
--      'api','automacao','ai_agent_router','ai_outbound_trigger','webhook')
--      → integration (label = nome amigável do source)
--   4. metadata.source = 'analytics_v2_fase0' → system com label especial
--      'Sistema (analytics)' — UI esconde por padrão
--   5. fallback → system (label = 'Sistema')
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
    -- Respeita override explícito: se quem fez o INSERT já preencheu
    -- actor_type, não sobrescreve nada.
    IF NEW.actor_type IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_source := COALESCE(NEW.metadata->>'source', '');

    -- 1. Humano (created_by preenchido)
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

    -- 3. Integração / sistema externo
    IF v_source IN (
        'integration', 'active_campaign', 'monde', 'n8n',
        'api', 'automacao', 'ai_agent_router', 'ai_outbound_trigger',
        'webhook', 'whatsapp_inbound', 'whatsapp_outbound'
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
            ELSE v_source
        END;
        RETURN NEW;
    END IF;

    -- 4. Backfill do Analytics v2 — marcar como system mas com label especial
    --    para a UI poder esconder por padrão
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

COMMENT ON FUNCTION public.enrich_activity_actor IS
    'Trigger BEFORE INSERT em activities que preenche actor_type/actor_id/actor_label automaticamente a partir de created_by e metadata.source. Override explícito é respeitado.';

DROP TRIGGER IF EXISTS trg_enrich_activity_actor ON public.activities;
CREATE TRIGGER trg_enrich_activity_actor
    BEFORE INSERT ON public.activities
    FOR EACH ROW
    EXECUTE FUNCTION public.enrich_activity_actor();

COMMIT;
