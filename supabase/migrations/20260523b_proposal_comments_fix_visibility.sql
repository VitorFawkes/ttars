-- ============================================================
-- Fix: RPC add_proposal_comment_by_token usava visibility='public'
-- mas a constraint legacy proposal_comments_visibility_check só
-- aceita 'internal' e 'client'. Trocar pra 'client' (semântica:
-- visível pra ambos os lados — cliente e consultor).
-- ============================================================

BEGIN;

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
    'client', TRIM(p_author_name), TRIM(p_content), 'client', FALSE
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- get_proposal_comments_by_token também filtrava por visibility='public'
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
    AND (c.visibility IS NULL OR c.visibility IN ('client', 'public'))
  ORDER BY c.created_at ASC;
END;
$$;

COMMIT;
