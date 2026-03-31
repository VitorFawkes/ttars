-- ============================================================
-- Migration: Add Thumbnail to Library Search RPC
-- Data: 2026-02-03
-- Autor: Vitor (via Claude)
--
-- PROBLEMA: A função search_proposal_library não retorna
-- thumbnail para exibição nos resultados de busca.
--
-- CORREÇÃO: Atualizar a função para extrair o primeiro
-- elemento do array de imagens do content JSONB.
--
-- O content pode ter imagens em diferentes namespaces:
-- - content.hotel.images[]
-- - content.experience.images[]
-- - content.transfer.images[]
-- - content.insurance.images[]
-- - content.cruise.images[]
-- - content.images[] (formato legado)
-- - content.image_url (formato single image)
-- ============================================================

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS search_proposal_library(TEXT, TEXT, TEXT, INT);

-- Recreate the function with thumbnail extraction
CREATE OR REPLACE FUNCTION search_proposal_library(
    search_term TEXT,
    category_filter TEXT DEFAULT NULL,
    destination_filter TEXT DEFAULT NULL,
    limit_count INT DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    category TEXT,
    name TEXT,
    content JSONB,
    base_price DECIMAL,
    currency TEXT,
    tags TEXT[],
    supplier TEXT,
    destination TEXT,
    created_by UUID,
    is_shared BOOLEAN,
    usage_count INT,
    created_at TIMESTAMPTZ,
    similarity_score REAL,
    thumbnail_url TEXT  -- NEW: Extracted thumbnail
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        l.id,
        l.category,
        l.name,
        l.content,
        l.base_price,
        l.currency,
        l.tags,
        l.supplier,
        l.destination,
        l.created_by,
        l.is_shared,
        l.usage_count,
        l.created_at,
        GREATEST(
            similarity(l.name, search_term),
            similarity(l.name_search, lower(unaccent(search_term)))
        ) AS similarity_score,
        -- Extract thumbnail from content JSONB (check multiple namespaces)
        COALESCE(
            -- Try namespaced images arrays first
            (l.content->'hotel'->'images'->>0),
            (l.content->'experience'->'images'->>0),
            (l.content->'transfer'->'images'->>0),
            (l.content->'insurance'->'images'->>0),
            (l.content->'cruise'->'images'->>0),
            -- Try namespaced image_url
            (l.content->'hotel'->>'image_url'),
            (l.content->'experience'->>'image_url'),
            (l.content->'transfer'->>'image_url'),
            (l.content->'insurance'->>'image_url'),
            (l.content->'cruise'->>'image_url'),
            -- Try legacy flat structure
            (l.content->'images'->>0),
            (l.content->>'image_url')
        ) AS thumbnail_url
    FROM proposal_library l
    WHERE
        -- Must be shared OR owned by current user
        (l.is_shared = true OR l.created_by = auth.uid())
        -- Category filter
        AND (category_filter IS NULL OR l.category = category_filter)
        -- Destination filter
        AND (destination_filter IS NULL OR l.destination ILIKE '%' || destination_filter || '%')
        -- Search matching (fuzzy)
        AND (
            search_term IS NULL
            OR search_term = ''
            OR l.name ILIKE '%' || search_term || '%'
            OR l.name_search ILIKE '%' || lower(unaccent(search_term)) || '%'
            OR similarity(l.name, search_term) > 0.2
            OR similarity(l.name_search, lower(unaccent(search_term))) > 0.2
        )
    ORDER BY
        CASE WHEN search_term IS NOT NULL AND search_term != ''
             THEN GREATEST(
                similarity(l.name, search_term),
                similarity(l.name_search, lower(unaccent(search_term)))
             )
             ELSE 0
        END DESC,
        l.usage_count DESC,
        l.created_at DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- ============================================================
-- VERIFICATION QUERY
-- ============================================================
-- Run this to verify the function returns thumbnail_url:
--
-- SELECT id, name, category, thumbnail_url
-- FROM search_proposal_library('', NULL, NULL, 10);
--
