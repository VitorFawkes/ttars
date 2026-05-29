-- Fix: _ww_ac_norm_origem agora agrupa "Insta" (utm_source comum) em "Instagram".
-- 162 leads estavam aparecendo como "Insta" separado de "Instagram" no painel.

CREATE OR REPLACE FUNCTION public._ww_ac_norm_origem(p_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_raw IS NULL OR p_raw = '' THEN RETURN 'Desconhecida'; END IF;
  RETURN CASE
    WHEN p_raw ILIKE '%instagram%' OR p_raw ILIKE '%insta%' OR p_raw = 'ig' OR p_raw ILIKE 'ig %' THEN 'Instagram'
    WHEN p_raw ILIKE '%leadster%' THEN 'Leadster'
    WHEN p_raw ILIKE '%facebook%' OR p_raw ILIKE '%fb%' OR p_raw ILIKE '%meta%' THEN 'Facebook/Meta'
    WHEN p_raw ILIKE '%google%' OR p_raw ILIKE '%adwords%' THEN 'Google'
    WHEN p_raw ILIKE '%site%' OR p_raw ILIKE '%formul%' OR p_raw ILIKE '%direct%' THEN 'Site direto'
    WHEN p_raw ILIKE '%indicac%' OR p_raw ILIKE '%referral%' OR p_raw ILIKE '%boca%' THEN 'Indicação'
    ELSE INITCAP(p_raw)
  END;
END $$;
