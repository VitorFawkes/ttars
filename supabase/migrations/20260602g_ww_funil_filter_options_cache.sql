-- ============================================================================
-- ww_funil_filter_options — AGORA lê 100% do ww_ac_deal_funnel_cache (AC-only).
-- Mesmas expressões/normalizadores do funil (pra as opções casarem). Consultores
-- vêm do cache (consultor_id resolvido + owner_nome do AC). DROP+CREATE.
-- ============================================================================

DROP FUNCTION IF EXISTS public.ww_funil_filter_options(UUID);

CREATE FUNCTION public.ww_funil_filter_options(
    p_org_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_faixas JSON; v_convidados JSON; v_destinos JSON; v_origens JSON; v_consultores JSON;
BEGIN
    SELECT json_agg(faixa ORDER BY faixa) INTO v_faixas
    FROM (SELECT DISTINCT _ww2_norm_faixa_strict(faixa_raw) AS faixa FROM ww_ac_deal_funnel_cache
          WHERE pipeline_group_id IN (1,3,4) AND NOT COALESCE(is_duplicado,FALSE) AND NOT COALESCE(is_elopement_pipeline,FALSE)) x
    WHERE faixa IS NOT NULL;

    SELECT json_agg(convidados ORDER BY convidados) INTO v_convidados
    FROM (SELECT DISTINCT _ww2_norm_conv_strict(convidados_raw) AS convidados FROM ww_ac_deal_funnel_cache
          WHERE pipeline_group_id IN (1,3,4) AND NOT COALESCE(is_duplicado,FALSE) AND NOT COALESCE(is_elopement_pipeline,FALSE)) x
    WHERE convidados IS NOT NULL;

    SELECT json_agg(destino ORDER BY destino) INTO v_destinos
    FROM (SELECT DISTINCT _ww2_norm_dest_strict(destino_raw) AS destino FROM ww_ac_deal_funnel_cache
          WHERE pipeline_group_id IN (1,3,4) AND NOT COALESCE(is_duplicado,FALSE) AND NOT COALESCE(is_elopement_pipeline,FALSE)) x
    WHERE destino IS NOT NULL;

    SELECT json_agg(origem ORDER BY origem) INTO v_origens
    FROM (SELECT DISTINCT _ww_ac_norm_origem(COALESCE(utm_source,origem_conversao)) AS origem FROM ww_ac_deal_funnel_cache
          WHERE pipeline_group_id IN (1,3,4) AND NOT COALESCE(is_duplicado,FALSE) AND NOT COALESCE(is_elopement_pipeline,FALSE)) x
    WHERE origem IS NOT NULL AND origem != 'Desconhecida';

    SELECT json_agg(json_build_object('id', consultor_id, 'nome', owner_nome) ORDER BY owner_nome) INTO v_consultores
    FROM (SELECT DISTINCT consultor_id, owner_nome FROM ww_ac_deal_funnel_cache
          WHERE pipeline_group_id IN (1,3,4) AND consultor_id IS NOT NULL AND owner_nome IS NOT NULL) x;

    RETURN json_build_object(
        'faixas',      COALESCE(v_faixas, '[]'::JSON),
        'convidados',  COALESCE(v_convidados, '[]'::JSON),
        'destinos',    COALESCE(v_destinos, '[]'::JSON),
        'origens',     COALESCE(v_origens, '[]'::JSON),
        'consultores', COALESCE(v_consultores, '[]'::JSON)
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_funil_filter_options(UUID) TO authenticated;
