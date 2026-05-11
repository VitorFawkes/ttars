-- ai_agent_knowledge_bases — Tabela associativa N:N entre agentes e bases de conhecimento
-- Motivação: até hoje o router buscava `ai_knowledge_bases.agent_id` (coluna inexistente),
-- então search_knowledge_base sempre caía no fallback JULIA_FAQ. Agente nunca consultava KB própria.

CREATE TABLE IF NOT EXISTS public.ai_agent_knowledge_bases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL DEFAULT requesting_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  kb_id UUID NOT NULL REFERENCES ai_knowledge_bases(id) ON DELETE CASCADE,
  priority INT NOT NULL DEFAULT 10,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(agent_id, kb_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_kb_agent ON ai_agent_knowledge_bases(agent_id) WHERE enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_ai_agent_kb_org ON ai_agent_knowledge_bases(org_id);

ALTER TABLE public.ai_agent_knowledge_bases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_read_ai_agent_kb" ON public.ai_agent_knowledge_bases;
CREATE POLICY "org_read_ai_agent_kb" ON public.ai_agent_knowledge_bases
  FOR SELECT USING (org_id = requesting_org_id());

DROP POLICY IF EXISTS "org_write_ai_agent_kb" ON public.ai_agent_knowledge_bases;
CREATE POLICY "org_write_ai_agent_kb" ON public.ai_agent_knowledge_bases
  FOR ALL USING (org_id = requesting_org_id()) WITH CHECK (org_id = requesting_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_agent_knowledge_bases TO authenticated;
GRANT ALL ON public.ai_agent_knowledge_bases TO service_role;

-- Função: buscar em todas as KBs vinculadas ao agente (fan-out).
-- Tipagem compatível com prod (public.vector) e staging (extensions.vector) — usa apenas "vector".
DROP FUNCTION IF EXISTS public.search_agent_knowledge_bases(UUID, vector, FLOAT, INT);
DROP FUNCTION IF EXISTS public.search_agent_knowledge_bases(UUID, vector, NUMERIC, INT);

CREATE OR REPLACE FUNCTION public.search_agent_knowledge_bases(
  p_agent_id UUID,
  p_query_embedding vector,
  p_match_threshold NUMERIC DEFAULT 0.7,
  p_match_count INT DEFAULT 3
) RETURNS TABLE (
  kb_id UUID,
  item_id UUID,
  titulo TEXT,
  conteudo TEXT,
  similarity NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.kb_id,
    i.id AS item_id,
    i.titulo,
    i.conteudo,
    (1 - (i.embedding <=> p_query_embedding))::NUMERIC AS similarity
  FROM ai_knowledge_base_items i
  WHERE i.kb_id IN (
    SELECT akb.kb_id
    FROM ai_agent_knowledge_bases akb
    WHERE akb.agent_id = p_agent_id AND akb.enabled = TRUE
  )
    AND i.ativa = TRUE
    AND i.embedding IS NOT NULL
    AND (1 - (i.embedding <=> p_query_embedding)) > p_match_threshold
  ORDER BY i.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_agent_knowledge_bases(UUID, vector, NUMERIC, INT) TO authenticated, service_role;

-- RPC: aplicar patch em card respeitando campos protegidos (usado pelo Data Agent LLM)
CREATE OR REPLACE FUNCTION public.agent_update_card_data(
  p_card_id UUID,
  p_patch JSONB,
  p_protected_fields TEXT[] DEFAULT ARRAY['pessoa_principal_id', 'produto_data', 'valor_estimado', 'created_at', 'created_by']
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card cards%ROWTYPE;
  v_safe_patch JSONB := '{}'::jsonb;
  v_key TEXT;
  v_value JSONB;
  v_updated_fields TEXT[] := ARRAY[]::TEXT[];
  v_allowed_top_level TEXT[] := ARRAY[
    'titulo','ai_resumo','ai_contexto','pipeline_stage_id'
  ];
BEGIN
  SELECT * INTO v_card FROM cards WHERE id = p_card_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'card_not_found');
  END IF;

  FOR v_key, v_value IN SELECT * FROM jsonb_each(p_patch)
  LOOP
    IF v_key = ANY(p_protected_fields) THEN CONTINUE; END IF;
    IF NOT (v_key = ANY(v_allowed_top_level)) THEN CONTINUE; END IF;
    v_safe_patch := v_safe_patch || jsonb_build_object(v_key, v_value);
    v_updated_fields := array_append(v_updated_fields, v_key);
  END LOOP;

  IF v_safe_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', true, 'updated', ARRAY[]::TEXT[], 'message', 'nothing_to_update');
  END IF;

  UPDATE cards SET
    titulo = COALESCE(v_safe_patch->>'titulo', titulo),
    ai_resumo = COALESCE(v_safe_patch->>'ai_resumo', ai_resumo),
    ai_contexto = COALESCE(v_safe_patch->>'ai_contexto', ai_contexto),
    pipeline_stage_id = COALESCE((v_safe_patch->>'pipeline_stage_id')::UUID, pipeline_stage_id),
    updated_at = now()
  WHERE id = p_card_id;

  RETURN jsonb_build_object(
    'ok', true,
    'updated', v_updated_fields,
    'patch', v_safe_patch
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_update_card_data TO service_role;
