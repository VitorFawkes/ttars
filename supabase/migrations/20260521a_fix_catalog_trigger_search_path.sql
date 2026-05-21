-- ============================================================
-- Migration: Fix trigger do Catálogo Unificado — search_path
-- Data: 2026-05-21
-- Autor: Vitor (via Claude)
--
-- BUG: Função `proposal_library_extract_from_item` declarava
-- `v_result proposal_library;` sem schema. Quando chamada de dentro
-- da trigger `proposal_items_auto_catalog` (que tem SET search_path = ''),
-- o tipo não era resolvido e falhava com:
--   ERROR: 42704: type "proposal_library" does not exist
--
-- SINTOMA EM PRODUÇÃO: builder V5 não conseguia salvar (autosave OU
-- save manual) sempre que tinha pelo menos 1 item de proposal (hotel,
-- experience, transfer) — bloqueava INSERT em proposal_items.
--
-- FIX: setar search_path explícito na função extract, qualificando
-- todos os tipos e funções com schema `public`.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION proposal_library_extract_from_item(p_item public.proposal_items)
RETURNS public.proposal_library
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result public.proposal_library;
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
  v_result.created_by := NULL;
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
  v_result.ownership_type := 'personal';

  v_namespace := p_item.item_type::TEXT;
  v_type_data := p_item.rich_content -> v_namespace;

  IF p_item.item_type = 'hotel' THEN
    v_result.region := COALESCE(v_type_data->>'location_city', v_type_data->>'city');
    v_result.region_country := COALESCE(v_type_data->>'location_country', v_type_data->>'country');
    v_result.star_rating := NULLIF(COALESCE(v_type_data->>'star_rating', v_type_data->>'stars'), '')::INT;
    v_result.amenities := CASE WHEN jsonb_typeof(v_type_data->'amenities') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_type_data->'amenities'))
      ELSE '{}'::TEXT[] END;
    v_result.cancellation_policy := v_type_data->>'cancellation_policy';
    v_result.check_in_time := v_type_data->>'check_in_time';
    v_result.check_out_time := v_type_data->>'check_out_time';
    v_result.gallery_urls := CASE WHEN jsonb_typeof(v_type_data->'images') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_type_data->'images'))
      ELSE '{}'::TEXT[] END;
    IF v_result.thumbnail_url IS NULL THEN
      v_result.thumbnail_url := COALESCE(v_type_data->>'image_url', v_type_data->'images'->>0);
    END IF;
  ELSIF p_item.item_type = 'experience' THEN
    v_result.region := v_type_data->>'location_city';
    v_result.cancellation_policy := v_type_data->>'cancellation_policy';
    v_result.gallery_urls := CASE WHEN jsonb_typeof(v_type_data->'images') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_type_data->'images'))
      ELSE '{}'::TEXT[] END;
    IF v_result.thumbnail_url IS NULL THEN
      v_result.thumbnail_url := v_type_data->>'image_url';
    END IF;
    IF v_result.supplier IS NULL THEN
      v_result.supplier := v_type_data->>'provider';
    END IF;
  ELSIF p_item.item_type = 'transfer' THEN
    v_result.region := v_type_data->>'location_city';
  ELSIF p_item.item_type = 'flight' THEN
    v_result.region := NULL;
    v_result.is_archived := TRUE;
  END IF;

  v_result.destination := v_result.region;
  v_result.location_city := v_result.region;
  v_result.location_country := v_result.region_country;
  v_result.region_search := CASE WHEN v_result.region IS NOT NULL THEN lower(unaccent(v_result.region)) ELSE NULL END;
  v_result.created_at := NOW();
  v_result.updated_at := NOW();

  RETURN v_result;
END;
$$;

COMMIT;
