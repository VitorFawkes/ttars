-- ============================================================================
-- MIGRATION: activities — backfill retroativo de actor_*
-- Date: 2026-05-04
--
-- Aplica a mesma lógica do trigger enrich_activity_actor nas linhas
-- existentes (criadas antes do trigger). Idempotente: só atualiza linhas
-- que ainda não têm actor_type preenchido.
-- ============================================================================

BEGIN;

-- 1. Humano (created_by preenchido) → resolve nome via profiles
UPDATE public.activities a
SET
    actor_type = 'user',
    actor_id = a.created_by,
    actor_label = COALESCE(p.nome, 'Usuário')
FROM public.profiles p
WHERE a.actor_type IS NULL
  AND a.created_by IS NOT NULL
  AND p.id = a.created_by;

-- Humanos com profile não encontrado (perfil deletado): mantém actor_id mas
-- label genérico
UPDATE public.activities
SET
    actor_type = 'user',
    actor_id = created_by,
    actor_label = 'Usuário'
WHERE actor_type IS NULL
  AND created_by IS NOT NULL;

-- 2. Agentes IA (source='ai_agent' + agent_id válido)
UPDATE public.activities a
SET
    actor_type = 'ai_agent',
    actor_id = (a.metadata->>'agent_id')::UUID,
    actor_label = COALESCE(ag.nome, 'IA')
FROM public.ai_agents ag
WHERE a.actor_type IS NULL
  AND a.metadata->>'source' = 'ai_agent'
  AND a.metadata->>'agent_id' IS NOT NULL
  AND ag.id::TEXT = a.metadata->>'agent_id';

-- IA sem agent_id explícito → fallback genérico 'IA'
UPDATE public.activities
SET
    actor_type = 'ai_agent',
    actor_id = NULL,
    actor_label = 'IA'
WHERE actor_type IS NULL
  AND metadata->>'source' = 'ai_agent';

-- 3. Integração / sistema externo
UPDATE public.activities
SET
    actor_type = 'integration',
    actor_id = NULL,
    actor_label = CASE metadata->>'source'
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
        ELSE metadata->>'source'
    END
WHERE actor_type IS NULL
  AND metadata->>'source' IN (
    'integration', 'active_campaign', 'monde', 'n8n',
    'api', 'automacao', 'ai_agent_router', 'ai_outbound_trigger',
    'webhook', 'whatsapp_inbound', 'whatsapp_outbound'
  );

-- 4. Backfill do Analytics v2 — marcado para UI esconder
UPDATE public.activities
SET
    actor_type = 'system',
    actor_id = NULL,
    actor_label = 'Sistema (analytics)'
WHERE actor_type IS NULL
  AND metadata->>'source' = 'analytics_v2_fase0';

-- 5. Fallback genérico
UPDATE public.activities
SET
    actor_type = 'system',
    actor_id = NULL,
    actor_label = 'Sistema'
WHERE actor_type IS NULL;

-- ============================================================================
-- Pós-backfill: garante que toda linha tem actor_type não-nulo daqui pra frente
-- ============================================================================
ALTER TABLE public.activities
    ALTER COLUMN actor_type SET DEFAULT 'system';

ALTER TABLE public.activities
    ALTER COLUMN actor_label SET DEFAULT 'Sistema';

-- CHECK constraint após backfill garantir consistência futura
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'activities_actor_type_check'
    ) THEN
        ALTER TABLE public.activities
            ADD CONSTRAINT activities_actor_type_check
            CHECK (actor_type IN ('user', 'ai_agent', 'integration', 'system'));
    END IF;
END $$;

COMMIT;
