-- ============================================================================
-- MIGRATION: activities — colunas de autoria explícita
-- Date: 2026-05-04
--
-- Hoje a tabela activities mistura 3 sinais incompatíveis para identificar
-- quem fez a ação:
--   - created_by (NULL = automático, mas indistinto entre IA/integração/sistema)
--   - metadata.source ('ai_agent' | 'integration' | ausente)
--   - frontend hardcoda 'IA Julia' para qualquer source='ai_agent'
--
-- Esta migration adiciona 3 colunas explícitas que serão preenchidas via
-- trigger BEFORE INSERT (próxima migration) e backfill retroativo, deixando
-- o frontend ler diretamente actor_type + actor_label sem heurística.
--
-- actor_type: categoria do autor (user, ai_agent, integration, system)
-- actor_id:   UUID do autor (profiles.id, ai_agents.id, etc) — NULL para system
-- actor_label: snapshot do nome no momento (preserva info se profile/agente
--              for desativado depois)
-- ============================================================================

BEGIN;

ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS actor_type TEXT,
    ADD COLUMN IF NOT EXISTS actor_id UUID,
    ADD COLUMN IF NOT EXISTS actor_label TEXT;

-- CHECK constraint só após backfill (próxima migration). Por enquanto deixa
-- nullable para não quebrar inserts em vôo.

COMMENT ON COLUMN public.activities.actor_type IS
    'Categoria do autor da atividade: user (humano), ai_agent (agente IA), integration (sistema externo), system (automação interna). Preenchido automaticamente via trigger enrich_activity_actor.';

COMMENT ON COLUMN public.activities.actor_id IS
    'UUID do autor: profiles.id quando user, ai_agents.id quando ai_agent, NULL caso contrário.';

COMMENT ON COLUMN public.activities.actor_label IS
    'Snapshot do nome do autor no momento da gravação. Preserva atribuição mesmo se profile/agente for desativado depois.';

-- Índice para queries do feed (cardId + ordenação por data desc)
CREATE INDEX IF NOT EXISTS idx_activities_card_created_desc
    ON public.activities (card_id, created_at DESC);

-- Índice para filtro "só IA" / "só humanas" no frontend
CREATE INDEX IF NOT EXISTS idx_activities_actor_type
    ON public.activities (actor_type)
    WHERE actor_type IS NOT NULL;

COMMIT;
