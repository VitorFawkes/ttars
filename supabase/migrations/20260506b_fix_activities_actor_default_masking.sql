-- ============================================================================
-- MIGRATION: Corrigir mascaramento do trigger enrich_activity_actor
-- Date: 2026-05-06
--
-- Bug: a migration 20260504q definiu DEFAULT 'system' para activities.actor_type
-- e DEFAULT 'Sistema' para activities.actor_label. Como o trigger BEFORE INSERT
-- enrich_activity_actor faz `IF NEW.actor_type IS NOT NULL THEN RETURN NEW;`,
-- o DEFAULT preenche actor_type='system' ANTES do trigger rodar e o trigger
-- interpreta isso como "override explícito" — devolvendo NEW sem enriquecer.
--
-- Resultado: TODA atividade nova insere com actor_type='system' / actor_label=
-- 'Sistema', mesmo quando created_by aponta para um humano. No feed do card
-- aparece "por Sistema" em vez do nome do usuário/agente IA/integração.
--
-- Fix:
--   1. Remover os DEFAULTs problemáticos (não há INSERT no código que dependa
--      desses defaults — todos delegam ao trigger).
--   2. Backfill retroativo: re-classificar linhas inseridas após 2026-05-04
--      (quando o bug entrou) que ficaram com actor_type='system' apesar de
--      created_by não-nulo, source='ai_agent', etc.
-- ============================================================================

BEGIN;

-- 1. Remover DEFAULTs que mascaram o trigger
ALTER TABLE public.activities
    ALTER COLUMN actor_type DROP DEFAULT,
    ALTER COLUMN actor_label DROP DEFAULT;

-- 2. Backfill retroativo das linhas afetadas
--    Limita a partir de 2026-05-04 (quando os DEFAULTs foram aplicados).
--    Antes disso o backfill original já classificou corretamente.

-- 2a. Humanos: created_by preenchido → user (label = profiles.nome)
UPDATE public.activities a
SET
    actor_type = 'user',
    actor_id = a.created_by,
    actor_label = COALESCE(p.nome, 'Usuário')
FROM public.profiles p
WHERE a.actor_type = 'system'
  AND a.actor_label = 'Sistema'
  AND a.created_by IS NOT NULL
  AND p.id = a.created_by
  AND a.created_at >= '2026-05-04'::timestamptz;

-- 2b. Humanos com profile não encontrado
UPDATE public.activities
SET
    actor_type = 'user',
    actor_id = created_by,
    actor_label = 'Usuário'
WHERE actor_type = 'system'
  AND actor_label = 'Sistema'
  AND created_by IS NOT NULL
  AND created_at >= '2026-05-04'::timestamptz;

-- 2c. Agentes IA com agent_id válido
UPDATE public.activities a
SET
    actor_type = 'ai_agent',
    actor_id = (a.metadata->>'agent_id')::UUID,
    actor_label = COALESCE(ag.nome, 'IA')
FROM public.ai_agents ag
WHERE a.actor_type = 'system'
  AND a.actor_label = 'Sistema'
  AND a.metadata->>'source' = 'ai_agent'
  AND a.metadata->>'agent_id' IS NOT NULL
  AND ag.id::TEXT = a.metadata->>'agent_id'
  AND a.created_at >= '2026-05-04'::timestamptz;

-- 2d. IA sem agent_id explícito
UPDATE public.activities
SET
    actor_type = 'ai_agent',
    actor_id = NULL,
    actor_label = 'IA'
WHERE actor_type = 'system'
  AND actor_label = 'Sistema'
  AND metadata->>'source' = 'ai_agent'
  AND created_at >= '2026-05-04'::timestamptz;

-- 2e. Integração / sistema externo
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
        WHEN 'cron' THEN 'Automação agendada'
        ELSE metadata->>'source'
    END
WHERE actor_type = 'system'
  AND actor_label = 'Sistema'
  AND metadata->>'source' IN (
      'integration', 'active_campaign', 'monde', 'n8n',
      'api', 'automacao', 'ai_agent_router', 'ai_outbound_trigger',
      'webhook', 'whatsapp_inbound', 'whatsapp_outbound', 'cron'
  )
  AND created_at >= '2026-05-04'::timestamptz;

COMMIT;
