-- ============================================================
-- Migration: Completar tabela proposal_comments
-- Data: 2026-05-23
-- Autor: Vitor (via Claude)
--
-- A tabela já existe (sessão anterior), mas falta:
--  - Coluna item_id pra comentários ancorados a um item específico
--  - Coluna org_id pra isolamento RLS por workspace (catálogo unificado)
--  - RLS permitindo anon (cliente via public_token) ler e inserir
--  - Trigger pra preservar author_name quando profile é apagado
--  - Índices pra contagem rápida (notificação no card/lista de propostas)
-- ============================================================

BEGIN;

-- 1) Colunas que faltam
ALTER TABLE proposal_comments
  ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES proposal_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id);

-- 2) Backfill org_id a partir da proposta
UPDATE proposal_comments c
SET org_id = p.org_id
FROM proposals p
WHERE c.proposal_id = p.id
  AND c.org_id IS NULL;

-- Tornar org_id NOT NULL (após backfill)
ALTER TABLE proposal_comments
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN org_id SET DEFAULT requesting_org_id();

-- 3) Índices
CREATE INDEX IF NOT EXISTS idx_proposal_comments_proposal ON proposal_comments(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_comments_item ON proposal_comments(item_id) WHERE item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposal_comments_section ON proposal_comments(section_id) WHERE section_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposal_comments_org ON proposal_comments(org_id);
CREATE INDEX IF NOT EXISTS idx_proposal_comments_unresolved_client
  ON proposal_comments(proposal_id, created_at DESC)
  WHERE is_resolved = FALSE AND author_type = 'client';

-- 4) RLS
ALTER TABLE proposal_comments ENABLE ROW LEVEL SECURITY;

-- Limpa policies antigas
DROP POLICY IF EXISTS proposal_comments_authenticated_all ON proposal_comments;
DROP POLICY IF EXISTS proposal_comments_anon_select ON proposal_comments;
DROP POLICY IF EXISTS proposal_comments_anon_insert ON proposal_comments;
DROP POLICY IF EXISTS proposal_comments_service ON proposal_comments;

-- Authenticated (consultor): vê e gerencia tudo da org
CREATE POLICY proposal_comments_authenticated_all ON proposal_comments
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

-- Anon (cliente via public_token): vê comentários da proposta acessada via token público
CREATE POLICY proposal_comments_anon_select ON proposal_comments
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM proposals p
    WHERE p.id = proposal_comments.proposal_id
      AND p.public_token IS NOT NULL
  ));

-- Anon (cliente via public_token): pode inserir como 'client' apenas
CREATE POLICY proposal_comments_anon_insert ON proposal_comments
  FOR INSERT TO anon
  WITH CHECK (
    author_type = 'client'
    AND EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_id
        AND p.public_token IS NOT NULL
        AND p.org_id = proposal_comments.org_id
    )
  );

-- Service role: bypass
CREATE POLICY proposal_comments_service ON proposal_comments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 5) RPC: contar comentários não-resolvidos (do cliente) por proposta
-- Usado pra badge no card de pipeline e na lista de propostas
CREATE OR REPLACE FUNCTION proposal_unread_comments_count(p_proposal_ids UUID[])
RETURNS TABLE (proposal_id UUID, unread_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.proposal_id,
    COUNT(*)::BIGINT AS unread_count
  FROM proposal_comments c
  WHERE c.proposal_id = ANY(p_proposal_ids)
    AND c.org_id = requesting_org_id()
    AND c.is_resolved = FALSE
    AND c.author_type = 'client'
  GROUP BY c.proposal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION proposal_unread_comments_count(UUID[]) TO authenticated;

-- 6) RPC: público — lê comentários de uma proposta via public_token
-- Cliente usa essa RPC ao invés de SELECT direto (mais seguro/explícito)
CREATE OR REPLACE FUNCTION get_proposal_comments_by_token(p_token TEXT)
RETURNS TABLE (
  id UUID,
  proposal_id UUID,
  section_id UUID,
  item_id UUID,
  parent_id UUID,
  author_type TEXT,
  author_name TEXT,
  content TEXT,
  is_resolved BOOLEAN,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal_id UUID;
BEGIN
  SELECT p.id INTO v_proposal_id
  FROM proposals p
  WHERE p.public_token = p_token
  LIMIT 1;

  IF v_proposal_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id, c.proposal_id, c.section_id, c.item_id, c.parent_id,
    c.author_type, c.author_name, c.content,
    c.is_resolved, c.resolved_at, c.created_at
  FROM proposal_comments c
  WHERE c.proposal_id = v_proposal_id
    AND (c.visibility IS NULL OR c.visibility = 'public')
  ORDER BY c.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_proposal_comments_by_token(TEXT) TO anon, authenticated;

-- 7) RPC: público — insere comentário via public_token
CREATE OR REPLACE FUNCTION add_proposal_comment_by_token(
  p_token TEXT,
  p_content TEXT,
  p_author_name TEXT,
  p_section_id UUID DEFAULT NULL,
  p_item_id UUID DEFAULT NULL,
  p_parent_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal RECORD;
  v_id UUID;
BEGIN
  IF p_content IS NULL OR LENGTH(TRIM(p_content)) = 0 THEN
    RAISE EXCEPTION 'content é obrigatório';
  END IF;
  IF p_author_name IS NULL OR LENGTH(TRIM(p_author_name)) = 0 THEN
    RAISE EXCEPTION 'author_name é obrigatório';
  END IF;

  SELECT p.id, p.org_id INTO v_proposal
  FROM proposals p
  WHERE p.public_token = p_token AND p.public_token IS NOT NULL
  LIMIT 1;

  IF v_proposal.id IS NULL THEN
    RAISE EXCEPTION 'Proposta não encontrada';
  END IF;

  INSERT INTO proposal_comments (
    proposal_id, org_id, section_id, item_id, parent_id,
    author_type, author_name, content, visibility, is_resolved
  ) VALUES (
    v_proposal.id, v_proposal.org_id, p_section_id, p_item_id, p_parent_id,
    'client', TRIM(p_author_name), TRIM(p_content), 'public', FALSE
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION add_proposal_comment_by_token(TEXT, TEXT, TEXT, UUID, UUID, UUID) TO anon, authenticated;

COMMIT;
