-- ============================================================================
-- STAGING ONLY: Seed Luna agent record for Julia prompts parity testing
-- ============================================================================

-- Ensure Luna agent exists (for C1 prompt seeding later)
INSERT INTO ai_agents (
  id,
  org_id,
  nome,
  produto,
  tipo,
  system_prompt,
  descricao,
  ativa,
  created_at,
  updated_at
)
VALUES (
  '90b0b80b-77a1-48f5-9bf0-b65335044dbe'::UUID,
  (SELECT id FROM organizations WHERE id IS NOT NULL LIMIT 1),
  'Luna — Agente de Viagens (Julia Paridade)',
  'TRIPS'::app_product,
  'sales',
  'Você é Luna, assistente de viagens baseado em edge function. Paridade com Julia (n8n).',
  'Agente para testes de paridade Luna/Julia. Prompts extraídos em 2026-04-14 (docs/ai/julia-prompts.md).',
  false,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

-- REFERENCE: Julia prompts extracted to docs/ai/julia-prompts.md
-- Next step (C1): Import prompts into structured schema columns when ready
-- RPC alignment: See supabase/migrations/20260414t_align_agent_rpcs.sql
