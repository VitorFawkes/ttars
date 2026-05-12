-- Busca tolerante de contatos: pg_trgm (similaridade) + unaccent (acento)
-- Resolve: digitar "Giuliana" achar Giulianna/Giuliane, "Joao" achar João, "Marcello" achar Marcelo.
-- Mantém comportamento atual: substring exato vence fuzzy no ranking.

-- Extensions já instaladas no projeto (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ──────────────────────────────────────────────────────────────────
-- Wrapper IMMUTABLE de unaccent + lower (necessário para índice GIN)
-- unaccent(text) sozinho é STABLE; com regdictionary explícita fica IMMUTABLE.
-- Em produção, unaccent vive em schema public (verificado em pg_proc).
-- ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.contatos_search_norm(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$
  SELECT lower(public.unaccent('public.unaccent'::regdictionary, COALESCE(t, '')))
$$;

-- ──────────────────────────────────────────────────────────────────
-- Índices trigram em nome e sobrenome
-- gin_trgm_ops em schema public (extensão pg_trgm instalada lá em prod).
-- ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contatos_nome_trgm
  ON public.contatos USING gin (public.contatos_search_norm(nome) public.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contatos_sobrenome_trgm
  ON public.contatos USING gin (public.contatos_search_norm(sobrenome) public.gin_trgm_ops);

-- ──────────────────────────────────────────────────────────────────
-- RPC principal: search_contatos
-- DROP antes de CREATE porque mudar return type não é permitido em REPLACE.
-- ──────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.search_contatos(text, int);

CREATE OR REPLACE FUNCTION public.search_contatos(
  p_term  text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id                    uuid,
  nome                  text,
  sobrenome             text,
  email                 text,
  telefone              text,
  telefone_normalizado  text,
  cpf_normalizado       text,
  empresa_id            uuid,
  monde_person_id       text,
  tipo_contato          text,
  match_score           real
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_norm  text;
  v_phone text;
BEGIN
  IF p_term IS NULL OR length(trim(p_term)) < 2 THEN
    RETURN;
  END IF;

  v_norm  := public.contatos_search_norm(trim(p_term));
  v_phone := regexp_replace(p_term, '\D', '', 'g');

  RETURN QUERY
  WITH base AS (
    SELECT
      c.id,
      c.nome,
      c.sobrenome,
      c.email,
      c.telefone,
      c.telefone_normalizado,
      c.cpf_normalizado,
      c.empresa_id,
      c.monde_person_id,
      c.tipo_contato,
      public.contatos_search_norm(c.nome)                                              AS nome_norm,
      public.contatos_search_norm(c.sobrenome)                                         AS sob_norm,
      public.contatos_search_norm(c.nome || ' ' || COALESCE(c.sobrenome, ''))          AS full_norm
    FROM public.contatos c
    WHERE c.deleted_at IS NULL
      AND (
            -- Substring exato (com unaccent) em nome/sobrenome
            public.contatos_search_norm(c.nome)      ILIKE '%' || v_norm || '%'
         OR public.contatos_search_norm(c.sobrenome) ILIKE '%' || v_norm || '%'
            -- Email (sem unaccent)
         OR lower(COALESCE(c.email, '')) ILIKE '%' || lower(p_term) || '%'
            -- Telefone normalizado (só se o termo parece telefone)
         OR (length(v_phone) >= 4 AND c.telefone_normalizado ILIKE '%' || v_phone || '%')
            -- CPF normalizado (placeholder da página Pessoas inclui CPF)
         OR (length(v_phone) >= 4 AND c.cpf_normalizado ILIKE '%' || v_phone || '%')
            -- Fuzzy trigram (resolve Giulianna ↔ Giuliana, Marcello ↔ Marcelo)
         OR (length(v_norm) >= 4 AND public.contatos_search_norm(c.nome)      % v_norm)
         OR (length(v_norm) >= 4 AND public.contatos_search_norm(c.sobrenome) % v_norm)
            -- Telefone secundário via contato_meios
         OR (length(v_phone) >= 4 AND EXISTS (
              SELECT 1
              FROM public.contato_meios cm
              WHERE cm.contato_id = c.id
                AND cm.valor_normalizado ILIKE '%' || v_phone || '%'
            ))
      )
    LIMIT 200  -- teto de candidatos antes do scoring
  )
  SELECT
    b.id,
    b.nome,
    b.sobrenome,
    b.email,
    b.telefone,
    b.telefone_normalizado,
    b.cpf_normalizado,
    b.empresa_id,
    b.monde_person_id,
    b.tipo_contato,
    (
        -- Bônus de match exato (vence fuzzy sempre)
        CASE
          WHEN b.full_norm LIKE v_norm || '%'        THEN 3.0
          WHEN b.full_norm LIKE '%' || v_norm || '%' THEN 2.0
          ELSE 0
        END
        -- Similaridade trigram (0..1) como tie-break e captura de fuzzy
      + GREATEST(
          similarity(b.nome_norm, v_norm),
          similarity(b.sob_norm,  v_norm),
          similarity(b.full_norm, v_norm)
        )
    )::real AS match_score
  FROM base b
  ORDER BY match_score DESC, b.nome NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_contatos(text, int) TO authenticated;

COMMENT ON FUNCTION public.search_contatos(text, int) IS
  'Busca tolerante a typos/acento em contatos. SECURITY INVOKER — RLS de contatos aplica. Substring exato vence fuzzy no ranking. Inclui contato_meios para telefones secundários.';
