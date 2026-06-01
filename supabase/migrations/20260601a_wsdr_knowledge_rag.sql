-- Sofia (wsdr) — base de conhecimento por BUSCA (RAG), ISOLADA do módulo ai_agents.
-- Em vez de colar todas as FAQs no prompt (que inflava e fazia a Sofia "se perder"),
-- ela busca só os trechos relevantes a cada conversa. Reusa o padrão pgvector já provado
-- em produção (Patricia v1: search_agent_knowledge_bases), em versão própria wsdr_*.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.wsdr_knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  agent_slug TEXT NOT NULL DEFAULT 'sofia-weddings',
  pergunta TEXT NOT NULL,
  resposta TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wsdr_knowledge_org_agent
  ON public.wsdr_knowledge_items(org_id, agent_slug) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_wsdr_knowledge_embedding
  ON public.wsdr_knowledge_items USING hnsw (embedding vector_cosine_ops);

ALTER TABLE public.wsdr_knowledge_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wsdr_knowledge_org_all ON public.wsdr_knowledge_items;
CREATE POLICY wsdr_knowledge_org_all ON public.wsdr_knowledge_items TO authenticated
  USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());

DROP POLICY IF EXISTS wsdr_knowledge_service_all ON public.wsdr_knowledge_items;
CREATE POLICY wsdr_knowledge_service_all ON public.wsdr_knowledge_items TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wsdr_knowledge_items TO authenticated;
GRANT ALL ON public.wsdr_knowledge_items TO service_role;

-- Busca semântica isolada da Sofia. SECURITY DEFINER pra o n8n chamar sem JWT.
-- Usa só "vector" (sem dimensão) na assinatura p/ compat prod(public.vector)/staging(extensions.vector).
DROP FUNCTION IF EXISTS public.wsdr_search_knowledge(UUID, TEXT, vector, INT, NUMERIC);
CREATE OR REPLACE FUNCTION public.wsdr_search_knowledge(
  p_org_id UUID,
  p_agent_slug TEXT,
  p_query_embedding vector,
  p_match_count INT DEFAULT 4,
  p_match_threshold NUMERIC DEFAULT 0.3
) RETURNS TABLE ( pergunta TEXT, resposta TEXT, similarity NUMERIC )
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT k.pergunta, k.resposta, (1 - (k.embedding <=> p_query_embedding))::NUMERIC AS similarity
  FROM wsdr_knowledge_items k
  WHERE k.org_id = p_org_id
    AND k.agent_slug = p_agent_slug
    AND k.enabled = TRUE
    AND k.embedding IS NOT NULL
    AND (1 - (k.embedding <=> p_query_embedding)) > p_match_threshold
  ORDER BY k.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.wsdr_search_knowledge(UUID, TEXT, vector, INT, NUMERIC) TO authenticated, service_role;
