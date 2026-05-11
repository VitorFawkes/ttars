-- ============================================================================
-- HOTFIX: find_possible_duplicate_cards — subtração de datas
-- Date: 2026-04-23
--
-- Problema: cards.data_viagem_inicio/fim são TIMESTAMPTZ, não DATE.
-- TIMESTAMPTZ - DATE retorna INTERVAL, que não compara com INTEGER.
-- Solução: castar para DATE antes de subtrair.
-- ============================================================================

CREATE OR REPLACE FUNCTION find_possible_duplicate_cards(
  p_pessoa_principal_id UUID,
  p_produto TEXT,
  p_data_inicio DATE DEFAULT NULL,
  p_data_fim DATE DEFAULT NULL,
  p_exclude_card_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  titulo TEXT,
  produto TEXT,
  status_comercial TEXT,
  data_viagem_inicio DATE,
  data_viagem_fim DATE,
  valor_final NUMERIC,
  valor_estimado NUMERIC,
  pipeline_stage_id UUID,
  stage_nome TEXT,
  phase_slug TEXT,
  financial_items_count INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  v_org_id := requesting_org_id();
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  IF p_pessoa_principal_id IS NULL OR p_produto IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.titulo,
    c.produto::TEXT,
    c.status_comercial::TEXT,
    c.data_viagem_inicio::DATE,
    c.data_viagem_fim::DATE,
    c.valor_final,
    c.valor_estimado,
    c.pipeline_stage_id,
    s.nome AS stage_nome,
    ph.slug::TEXT AS phase_slug,
    (SELECT COUNT(*)::INTEGER FROM card_financial_items fi WHERE fi.card_id = c.id) AS financial_items_count,
    c.created_at
  FROM cards c
  LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
  LEFT JOIN pipeline_phases ph ON ph.id = s.phase_id
  WHERE c.org_id = v_org_id
    AND c.pessoa_principal_id = p_pessoa_principal_id
    AND c.produto::TEXT = p_produto
    AND c.deleted_at IS NULL
    AND c.archived_at IS NULL
    AND c.status_comercial NOT IN ('ganho', 'perdido')
    AND (p_exclude_card_id IS NULL OR c.id <> p_exclude_card_id)
    AND (
      (p_data_inicio IS NULL AND p_data_fim IS NULL)
      OR
      (c.data_viagem_inicio IS NULL AND c.data_viagem_fim IS NULL)
      OR
      (
        COALESCE(c.data_viagem_inicio, c.data_viagem_fim) IS NOT NULL
        AND (
          (COALESCE(p_data_fim, p_data_inicio) IS NULL OR c.data_viagem_inicio IS NULL
            OR (c.data_viagem_inicio::DATE - COALESCE(p_data_fim, p_data_inicio)) <= 2)
          AND
          (COALESCE(p_data_inicio, p_data_fim) IS NULL OR c.data_viagem_fim IS NULL
            OR (COALESCE(p_data_inicio, p_data_fim) - c.data_viagem_fim::DATE) <= 2)
        )
      )
    )
  ORDER BY c.created_at DESC
  LIMIT 10;
END;
$$;

GRANT EXECUTE ON FUNCTION find_possible_duplicate_cards(UUID, TEXT, DATE, DATE, UUID) TO authenticated;
