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
  v_norm    text;
  v_phone   text;
  v_words   text[];
BEGIN
  IF p_term IS NULL OR length(trim(p_term)) < 2 THEN
    RETURN;
  END IF;

  -- Normaliza: unaccent + lower + colapsa espaços múltiplos
  v_norm  := regexp_replace(public.contatos_search_norm(trim(p_term)), '\s+', ' ', 'g');
  v_phone := regexp_replace(p_term, '\D', '', 'g');
  -- Palavras individuais do termo (sem vazias). Permite "Silva Maria" achar "Maria Silva".
  v_words := array_remove(string_to_array(v_norm, ' '), '');

  RETURN QUERY
  -- candidates: tudo que passa nos filtros (substring ou trigram).
  -- O trigram filtra agressivo (default threshold 0.3) então o conjunto é tratável
  -- mesmo sem LIMIT intermediário. O ranking acontece direto no SELECT final.
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
            -- Substring (via position — imune a wildcards LIKE %/_)
            position(v_norm in public.contatos_search_norm(c.nome)) > 0
         OR position(v_norm in public.contatos_search_norm(c.sobrenome)) > 0
            -- Email (case-insensitive, sem unaccent)
         OR position(lower(p_term) in lower(COALESCE(c.email, ''))) > 0
            -- Telefone normalizado (v_phone só contém dígitos)
         OR (length(v_phone) >= 4 AND position(v_phone in COALESCE(c.telefone_normalizado, '')) > 0)
            -- CPF normalizado (placeholder da página Pessoas inclui CPF)
         OR (length(v_phone) >= 4 AND position(v_phone in COALESCE(c.cpf_normalizado, '')) > 0)
            -- Fuzzy trigram (tolera letra dobrada, troca, omissão)
         OR (length(v_norm) >= 4 AND public.contatos_search_norm(c.nome)      % v_norm)
         OR (length(v_norm) >= 4 AND public.contatos_search_norm(c.sobrenome) % v_norm)
            -- Multi-word: todas as palavras do termo aparecem no full_norm
            -- (cobre "Silva Maria" → "Maria Silva")
         OR (
              cardinality(v_words) >= 2
              AND NOT EXISTS (
                SELECT 1 FROM unnest(v_words) AS w
                WHERE position(w in public.contatos_search_norm(c.nome || ' ' || COALESCE(c.sobrenome, ''))) = 0
              )
            )
            -- Telefone secundário via contato_meios
         OR (length(v_phone) >= 4 AND EXISTS (
              SELECT 1
              FROM public.contato_meios cm
              WHERE cm.contato_id = c.id
                AND position(v_phone in COALESCE(cm.valor_normalizado, '')) > 0
            ))
      )
  ),
  scored AS (
    SELECT b.*,
      (
          -- Bônus de match exato (vence fuzzy sempre). starts_with/position são imunes a wildcards.
          CASE
            WHEN starts_with(b.full_norm, v_norm)        THEN 3.0
            WHEN position(v_norm in b.full_norm) > 0     THEN 2.0
            -- Multi-word match: todas as palavras estão presentes (cobre ordem invertida)
            WHEN cardinality(v_words) >= 2
                 AND NOT EXISTS (
                   SELECT 1 FROM unnest(v_words) AS w
                   WHERE position(w in b.full_norm) = 0
                 )                                       THEN 1.5
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
  )
  SELECT
    s.id,
    s.nome,
    s.sobrenome,
    s.email,
    s.telefone,
    s.telefone_normalizado,
    s.cpf_normalizado,
    s.empresa_id,
    s.monde_person_id,
    s.tipo_contato,
    s.match_score
  FROM scored s
  ORDER BY s.match_score DESC, s.nome NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_contatos(text, int) TO authenticated;

COMMENT ON FUNCTION public.search_contatos(text, int) IS
  'Busca tolerante a typos/acento em contatos. SECURITY INVOKER — RLS de contatos aplica. Substring exato vence fuzzy no ranking. Inclui contato_meios para telefones secundários.';
