-- ============================================================
-- Migration: Catalogo Unificado — Fundação (Fase 1)
-- Data: 2026-05-20
-- Autor: Vitor (via Claude)
--
-- OBJETIVO: Preparar `proposal_library` para virar o "Catálogo"
-- unificado de itens de proposta (hotel, voo, passeio, transfer,
-- etc), com:
--   1. Isolamento por org_id (workspace) — corrige vazamento atual
--   2. Colunas estruturadas para busca rica (região, sub-categoria,
--      tags de perfil de cliente, temporada, fornecedor de origem)
--   3. Trigger automático: ao adicionar item numa proposta, o item
--      entra/atualiza no Catálogo do mesmo workspace
--   4. RPC de busca atualizada com filtros multi-dimensionais e
--      ordenações (mais usados, recentes, A-Z, preço)
--
-- EFEITOS COLATERAIS CONSCIENTES:
-- - A biblioteca atual (16 linhas seed) ganha org_id = Welcome Trips
--   (única org com uso real de propostas hoje). Welcome Weddings
--   começa com catálogo vazio.
-- - RLS muda de "is_shared OR created_by" para "org_id = requesting_org_id()"
-- - Trigger só dispara em INSERT (não UPDATE) de proposal_items.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) ADICIONAR COLUNAS NOVAS
-- ============================================================

ALTER TABLE proposal_library
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS sub_category TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS region_country TEXT,
  ADD COLUMN IF NOT EXISTS client_profile_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS season_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_provider TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS external_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS region_search TEXT;

COMMENT ON COLUMN proposal_library.org_id IS 'Workspace dono do item. Catálogo é isolado por workspace.';
COMMENT ON COLUMN proposal_library.sub_category IS 'Refinamento dentro de category: hotel→resort/urban/boutique, experience→aventura/cultural/etc';
COMMENT ON COLUMN proposal_library.region IS 'Cidade ou região (texto livre, ex: "Bali, Ubud")';
COMMENT ON COLUMN proposal_library.client_profile_tags IS 'Perfis de cliente que costumam usar: lua_de_mel, familia, grupo, sozinho, casal';
COMMENT ON COLUMN proposal_library.season_tags IS 'Marcações temporais: alta_temporada, baixa_temporada, melhor_em_jun, etc';
COMMENT ON COLUMN proposal_library.source_provider IS 'De onde veio: manual, iterpec_cangooroo, serpapi, importado, ai_extraction';
COMMENT ON COLUMN proposal_library.external_provider_id IS 'ID do item na fonte externa (ex: iterpecHotelId), pra evitar duplicação';

-- ============================================================
-- 2) BACKFILL: dar org_id a todos os itens atuais
-- ============================================================
-- Os 16 itens hoje são seed/demo. Atribuir todos para Welcome Trips,
-- já que é a única org com uso real de proposals. Caso o Vitor queira
-- mover algum manualmente depois, é UPDATE simples.

UPDATE proposal_library
SET org_id = 'b0000000-0000-0000-0000-000000000001'
WHERE org_id IS NULL;

-- Backfill region_search a partir de destination/location_city
UPDATE proposal_library
SET region = COALESCE(NULLIF(destination, ''), NULLIF(location_city, ''))
WHERE region IS NULL;

UPDATE proposal_library
SET region_search = lower(unaccent(region))
WHERE region_search IS NULL AND region IS NOT NULL;

UPDATE proposal_library
SET region_country = location_country
WHERE region_country IS NULL AND location_country IS NOT NULL;

-- Backfill source_provider
UPDATE proposal_library
SET source_provider = 'manual'
WHERE source_provider IS NULL;

-- ============================================================
-- 3) TORNAR org_id OBRIGATÓRIO
-- ============================================================

ALTER TABLE proposal_library
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN org_id SET DEFAULT requesting_org_id();

-- ============================================================
-- 4) ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_proposal_library_org_id ON proposal_library(org_id);
CREATE INDEX IF NOT EXISTS idx_proposal_library_category ON proposal_library(category);
CREATE INDEX IF NOT EXISTS idx_proposal_library_sub_category ON proposal_library(sub_category);
CREATE INDEX IF NOT EXISTS idx_proposal_library_region_search ON proposal_library USING gin (region_search gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_proposal_library_tags ON proposal_library USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_proposal_library_profile_tags ON proposal_library USING gin (client_profile_tags);
CREATE INDEX IF NOT EXISTS idx_proposal_library_season_tags ON proposal_library USING gin (season_tags);
CREATE INDEX IF NOT EXISTS idx_proposal_library_external ON proposal_library(source_provider, external_provider_id) WHERE external_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proposal_library_usage ON proposal_library(org_id, usage_count DESC) WHERE is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_proposal_library_last_used ON proposal_library(org_id, last_used_at DESC NULLS LAST) WHERE is_archived = FALSE;

-- ============================================================
-- 5) RLS POLICIES — substituir is_shared por org_id
-- ============================================================

ALTER TABLE proposal_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proposal_library_org_select ON proposal_library;
DROP POLICY IF EXISTS proposal_library_org_all ON proposal_library;
DROP POLICY IF EXISTS proposal_library_service_all ON proposal_library;
DROP POLICY IF EXISTS "Users see shared library" ON proposal_library;
DROP POLICY IF EXISTS "Users manage own library" ON proposal_library;

CREATE POLICY proposal_library_org_all ON proposal_library
  FOR ALL TO authenticated
  USING (org_id = requesting_org_id())
  WITH CHECK (org_id = requesting_org_id());

CREATE POLICY proposal_library_service_all ON proposal_library
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================
-- 6) TRIGGER: manter region_search atualizado
-- ============================================================

CREATE OR REPLACE FUNCTION proposal_library_sync_search()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.region_search := CASE
    WHEN NEW.region IS NOT NULL THEN lower(unaccent(NEW.region))
    ELSE NULL
  END;
  NEW.name_search := CASE
    WHEN NEW.name IS NOT NULL THEN lower(unaccent(NEW.name))
    ELSE NULL
  END;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposal_library_sync_search ON proposal_library;
CREATE TRIGGER trg_proposal_library_sync_search
BEFORE INSERT OR UPDATE OF region, name ON proposal_library
FOR EACH ROW
EXECUTE FUNCTION proposal_library_sync_search();

-- ============================================================
-- 7) FUNÇÃO: derivar dados do proposal_item pra catálogo
-- ============================================================
-- Extrai nome, region, fotos, descrição, preço, amenities, etc do
-- rich_content específico do tipo (hotel/experience/transfer/etc).

CREATE OR REPLACE FUNCTION proposal_library_extract_from_item(p_item proposal_items)
RETURNS proposal_library
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result proposal_library;
  v_type_data JSONB;
  v_namespace TEXT;
BEGIN
  v_result.id := gen_random_uuid();
  v_result.org_id := p_item.org_id;
  v_result.category := p_item.item_type::TEXT;
  v_result.name := p_item.title;
  v_result.content := COALESCE(p_item.rich_content, '{}'::jsonb);
  v_result.base_price := COALESCE(p_item.base_price, 0);
  v_result.currency := 'BRL';
  v_result.supplier := p_item.supplier;
  v_result.created_by := NULL; -- backfill: sem autor conhecido
  v_result.is_shared := TRUE;
  v_result.usage_count := 1;
  v_result.last_used_at := COALESCE(p_item.created_at, NOW());
  v_result.thumbnail_url := p_item.image_url;
  v_result.source_provider := COALESCE(p_item.external_provider, 'manual');
  v_result.external_provider_id := p_item.external_id;
  v_result.is_archived := FALSE;
  v_result.tags := '{}';
  v_result.client_profile_tags := '{}';
  v_result.season_tags := '{}';

  -- Extrair namespace por tipo (hotel/experience/transfer/insurance/cruise/flight)
  v_namespace := p_item.item_type::TEXT;
  v_type_data := p_item.rich_content -> v_namespace;

  -- Fallbacks por categoria
  IF p_item.item_type = 'hotel' THEN
    v_result.region := COALESCE(v_type_data->>'location_city', v_type_data->>'city');
    v_result.region_country := COALESCE(v_type_data->>'location_country', v_type_data->>'country');
    v_result.star_rating := NULLIF(COALESCE(v_type_data->>'star_rating', v_type_data->>'stars'), '')::INT;
    v_result.amenities := CASE
      WHEN jsonb_typeof(v_type_data->'amenities') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_type_data->'amenities'))
      ELSE '{}'::TEXT[]
    END;
    v_result.cancellation_policy := v_type_data->>'cancellation_policy';
    v_result.check_in_time := v_type_data->>'check_in_time';
    v_result.check_out_time := v_type_data->>'check_out_time';
    v_result.gallery_urls := CASE
      WHEN jsonb_typeof(v_type_data->'images') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_type_data->'images'))
      ELSE '{}'::TEXT[]
    END;
    IF v_result.thumbnail_url IS NULL THEN
      v_result.thumbnail_url := COALESCE(
        v_type_data->>'image_url',
        v_type_data->'images'->>0
      );
    END IF;
  ELSIF p_item.item_type = 'experience' THEN
    v_result.region := v_type_data->>'location_city';
    v_result.cancellation_policy := v_type_data->>'cancellation_policy';
    v_result.gallery_urls := CASE
      WHEN jsonb_typeof(v_type_data->'images') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_type_data->'images'))
      ELSE '{}'::TEXT[]
    END;
    IF v_result.thumbnail_url IS NULL THEN
      v_result.thumbnail_url := v_type_data->>'image_url';
    END IF;
    IF v_result.supplier IS NULL THEN
      v_result.supplier := v_type_data->>'provider';
    END IF;
  ELSIF p_item.item_type = 'transfer' THEN
    v_result.region := v_type_data->>'location_city';
  ELSIF p_item.item_type = 'flight' THEN
    -- Voo é volátil. Marcar mas com base_price=0 e tag arquivado.
    v_result.region := NULL;
    v_result.is_archived := TRUE;
  END IF;

  v_result.destination := v_result.region; -- legado
  v_result.location_city := v_result.region;
  v_result.location_country := v_result.region_country;
  v_result.name_search := lower(unaccent(v_result.name));
  v_result.region_search := CASE
    WHEN v_result.region IS NOT NULL THEN lower(unaccent(v_result.region))
    ELSE NULL
  END;
  v_result.created_at := NOW();
  v_result.updated_at := NOW();
  v_result.ownership_type := 'workspace';

  RETURN v_result;
END;
$$;

-- ============================================================
-- 8) TRIGGER: ao inserir proposal_item, upsert no proposal_library
-- ============================================================
-- Estratégia de deduplicação por org:
--   1) Se item tem external_provider_id → match exato por (org_id, source_provider, external_provider_id)
--   2) Senão → match por (org_id, item_type, normalized name + region)
--
-- Se encontra: incrementa usage_count, atualiza last_used_at,
-- preserva tags do catálogo (mais atual), atualiza dados se mais novos.
-- Se não encontra: cria novo.

CREATE OR REPLACE FUNCTION proposal_items_auto_catalog()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_extracted public.proposal_library;
  v_existing_id UUID;
BEGIN
  -- Skip: tipos voláteis ou sem org_id
  IF NEW.org_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.item_type::TEXT IN ('flight') THEN
    -- Voo não entra no catálogo (preços/horários voláteis).
    RETURN NEW;
  END IF;
  IF NEW.title IS NULL OR LENGTH(TRIM(NEW.title)) = 0 THEN
    RETURN NEW;
  END IF;

  v_extracted := public.proposal_library_extract_from_item(NEW);

  -- Dedup 1: external_provider_id (mesma fonte, mesmo ID)
  IF v_extracted.external_provider_id IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM public.proposal_library
    WHERE org_id = v_extracted.org_id
      AND source_provider = v_extracted.source_provider
      AND external_provider_id = v_extracted.external_provider_id
    LIMIT 1;
  END IF;

  -- Dedup 2: nome + região (case-insensitive)
  IF v_existing_id IS NULL THEN
    SELECT id INTO v_existing_id
    FROM public.proposal_library
    WHERE org_id = v_extracted.org_id
      AND category = v_extracted.category
      AND name_search = v_extracted.name_search
      AND COALESCE(region_search, '') = COALESCE(v_extracted.region_search, '')
    LIMIT 1;
  END IF;

  IF v_existing_id IS NOT NULL THEN
    -- Atualizar uso (incrementa contador, refresca last_used_at)
    UPDATE public.proposal_library
    SET usage_count = usage_count + 1,
        last_used_at = NOW(),
        updated_at = NOW()
    WHERE id = v_existing_id;
  ELSE
    -- Inserir novo
    INSERT INTO public.proposal_library (
      org_id, category, name, name_search, content, base_price, currency,
      tags, supplier, destination, created_by, is_shared, usage_count,
      thumbnail_url, gallery_urls, location_city, location_country,
      amenities, check_in_time, check_out_time, cancellation_policy,
      star_rating, ownership_type, last_used_at,
      sub_category, region, region_country, region_search,
      client_profile_tags, season_tags, source_provider, external_provider_id,
      is_archived
    ) VALUES (
      v_extracted.org_id, v_extracted.category, v_extracted.name, v_extracted.name_search,
      v_extracted.content, v_extracted.base_price, v_extracted.currency,
      v_extracted.tags, v_extracted.supplier, v_extracted.destination,
      v_extracted.created_by, v_extracted.is_shared, v_extracted.usage_count,
      v_extracted.thumbnail_url, v_extracted.gallery_urls,
      v_extracted.location_city, v_extracted.location_country,
      v_extracted.amenities, v_extracted.check_in_time, v_extracted.check_out_time,
      v_extracted.cancellation_policy, v_extracted.star_rating,
      v_extracted.ownership_type, v_extracted.last_used_at,
      v_extracted.sub_category, v_extracted.region, v_extracted.region_country,
      v_extracted.region_search, v_extracted.client_profile_tags,
      v_extracted.season_tags, v_extracted.source_provider,
      v_extracted.external_provider_id, v_extracted.is_archived
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proposal_items_auto_catalog ON proposal_items;
CREATE TRIGGER trg_proposal_items_auto_catalog
AFTER INSERT ON proposal_items
FOR EACH ROW
EXECUTE FUNCTION proposal_items_auto_catalog();

-- ============================================================
-- 9) RPC: search_proposal_library v2 — multi-dimensional
-- ============================================================

DROP FUNCTION IF EXISTS search_proposal_library(TEXT, TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS search_proposal_library_v2(TEXT, TEXT[], TEXT[], TEXT, TEXT[], TEXT[], NUMERIC, NUMERIC, INT[], BOOLEAN, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION search_proposal_library_v2(
  p_search        TEXT      DEFAULT NULL,
  p_categories    TEXT[]    DEFAULT NULL,   -- ['hotel','experience'...]
  p_sub_categories TEXT[]   DEFAULT NULL,
  p_region        TEXT      DEFAULT NULL,   -- busca trigram em region_search
  p_tags          TEXT[]    DEFAULT NULL,   -- intersect com tags
  p_profile_tags  TEXT[]    DEFAULT NULL,   -- intersect com client_profile_tags
  p_price_min     NUMERIC   DEFAULT NULL,
  p_price_max     NUMERIC   DEFAULT NULL,
  p_stars         INT[]     DEFAULT NULL,   -- ex: [4,5] = filtro estrelas
  p_include_archived BOOLEAN DEFAULT FALSE,
  p_sort          TEXT      DEFAULT 'most_used', -- most_used|recent|az|za|price_asc|price_desc|relevance
  p_limit         INT       DEFAULT 30,
  p_offset        INT       DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  sub_category TEXT,
  name TEXT,
  region TEXT,
  region_country TEXT,
  supplier TEXT,
  source_provider TEXT,
  base_price NUMERIC,
  currency TEXT,
  star_rating INT,
  thumbnail_url TEXT,
  gallery_urls TEXT[],
  amenities TEXT[],
  tags TEXT[],
  client_profile_tags TEXT[],
  season_tags TEXT[],
  usage_count INT,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  content JSONB,
  similarity_score REAL,
  total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_search_norm TEXT;
BEGIN
  v_search_norm := CASE
    WHEN p_search IS NOT NULL AND length(trim(p_search)) > 0
    THEN lower(public.unaccent(p_search))
    ELSE NULL
  END;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      l.*,
      CASE
        WHEN v_search_norm IS NULL THEN 1.0
        ELSE GREATEST(
          public.similarity(l.name_search, v_search_norm),
          public.similarity(COALESCE(l.region_search, ''), v_search_norm) * 0.5
        )
      END AS score
    FROM public.proposal_library l
    WHERE l.org_id = public.requesting_org_id()
      AND (p_include_archived OR l.is_archived = FALSE)
      AND (p_categories IS NULL OR l.category = ANY(p_categories))
      AND (p_sub_categories IS NULL OR l.sub_category = ANY(p_sub_categories))
      AND (p_region IS NULL OR l.region_search ILIKE '%' || lower(public.unaccent(p_region)) || '%')
      AND (p_tags IS NULL OR l.tags && p_tags)
      AND (p_profile_tags IS NULL OR l.client_profile_tags && p_profile_tags)
      AND (p_price_min IS NULL OR l.base_price >= p_price_min)
      AND (p_price_max IS NULL OR l.base_price <= p_price_max)
      AND (p_stars IS NULL OR l.star_rating = ANY(p_stars))
      AND (
        v_search_norm IS NULL
        OR l.name_search ILIKE '%' || v_search_norm || '%'
        OR l.region_search ILIKE '%' || v_search_norm || '%'
        OR public.similarity(l.name_search, v_search_norm) > 0.15
      )
  ),
  counted AS (
    SELECT COUNT(*)::BIGINT AS n FROM filtered
  )
  SELECT
    f.id, f.category, f.sub_category, f.name, f.region, f.region_country,
    f.supplier, f.source_provider, f.base_price, f.currency, f.star_rating,
    f.thumbnail_url, f.gallery_urls, f.amenities, f.tags,
    f.client_profile_tags, f.season_tags,
    f.usage_count, f.last_used_at, f.created_at, f.content,
    f.score::REAL, c.n
  FROM filtered f, counted c
  ORDER BY
    CASE p_sort
      WHEN 'most_used'   THEN f.usage_count::DOUBLE PRECISION
      WHEN 'recent'      THEN EXTRACT(EPOCH FROM COALESCE(f.last_used_at, f.created_at))::DOUBLE PRECISION
      WHEN 'price_desc'  THEN f.base_price::DOUBLE PRECISION
      WHEN 'relevance'   THEN f.score::DOUBLE PRECISION
      ELSE NULL
    END DESC NULLS LAST,
    CASE p_sort
      WHEN 'az'          THEN f.name
      ELSE NULL
    END ASC,
    CASE p_sort
      WHEN 'za'          THEN f.name
      ELSE NULL
    END DESC,
    CASE p_sort
      WHEN 'price_asc'   THEN f.base_price
      ELSE NULL
    END ASC NULLS LAST,
    f.usage_count DESC, f.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_proposal_library_v2 TO authenticated;

-- Wrapper de retrocompatibilidade — chama v2 com defaults
CREATE OR REPLACE FUNCTION search_proposal_library(
  search_term TEXT,
  category_filter TEXT DEFAULT NULL,
  destination_filter TEXT DEFAULT NULL,
  limit_count INT DEFAULT 20
)
RETURNS TABLE (
  id UUID, category TEXT, name TEXT, content JSONB, base_price NUMERIC,
  currency TEXT, tags TEXT[], supplier TEXT, destination TEXT,
  created_by UUID, is_shared BOOLEAN, usage_count INT,
  created_at TIMESTAMPTZ, similarity_score REAL, thumbnail_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT v.id, v.category, v.name, v.content, v.base_price, v.currency,
         v.tags, v.supplier, v.region AS destination,
         NULL::UUID AS created_by, TRUE AS is_shared, v.usage_count,
         v.created_at, v.similarity_score, v.thumbnail_url
  FROM public.search_proposal_library_v2(
    p_search => search_term,
    p_categories => CASE WHEN category_filter IS NULL THEN NULL ELSE ARRAY[category_filter] END,
    p_region => destination_filter,
    p_limit => limit_count,
    p_sort => 'relevance'
  ) v;
END;
$$;

GRANT EXECUTE ON FUNCTION search_proposal_library TO authenticated;

-- ============================================================
-- 10) RPCs auxiliares para segmentos rápidos
-- ============================================================

CREATE OR REPLACE FUNCTION catalog_top_regions(p_limit INT DEFAULT 10)
RETURNS TABLE (region TEXT, item_count BIGINT, total_uses BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT l.region, COUNT(*)::BIGINT, SUM(l.usage_count)::BIGINT
  FROM public.proposal_library l
  WHERE l.org_id = public.requesting_org_id()
    AND l.is_archived = FALSE
    AND l.region IS NOT NULL
  GROUP BY l.region
  ORDER BY SUM(l.usage_count) DESC NULLS LAST, COUNT(*) DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION catalog_top_regions TO authenticated;

CREATE OR REPLACE FUNCTION catalog_top_tags(p_limit INT DEFAULT 10)
RETURNS TABLE (tag TEXT, item_count BIGINT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT t.tag, COUNT(*)::BIGINT
  FROM public.proposal_library l, LATERAL unnest(l.tags) AS t(tag)
  WHERE l.org_id = public.requesting_org_id()
    AND l.is_archived = FALSE
  GROUP BY t.tag
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION catalog_top_tags TO authenticated;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- Após aplicar, verificar:
--   SELECT COUNT(*) FROM proposal_library WHERE org_id IS NULL; -- deve ser 0
--   SELECT category, COUNT(*) FROM proposal_library GROUP BY category;
--   SELECT * FROM search_proposal_library_v2(p_search => 'hotel', p_limit => 5);
--   SELECT * FROM catalog_top_regions();
--   SELECT * FROM catalog_top_tags();

COMMIT;
