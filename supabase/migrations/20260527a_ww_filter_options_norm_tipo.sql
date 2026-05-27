-- Atualiza ww2_filter_options para normalizar 'ww_tipo_casamento' usando _ww_norm_tipo
-- (DW / Elopment), evitando expor valores raw confusos como 'DW com convidados', 'praia'.

CREATE OR REPLACE FUNCTION public.ww2_filter_options(
    p_org_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_origens JSON; v_faixas JSON; v_destinos JSON; v_tipos JSON; v_consultores JSON;
BEGIN
    SELECT json_agg(DISTINCT origem) INTO v_origens
    FROM (SELECT _ww2_norm_origem(c.marketing_data) AS origem FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id AND c.archived_at IS NULL) x
    WHERE origem IS NOT NULL;

    SELECT json_agg(DISTINCT faixa) INTO v_faixas
    FROM (SELECT _ww2_norm_faixa(c.produto_data->>'ww_mkt_orcamento_form') AS faixa FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id AND c.archived_at IS NULL) x
    WHERE faixa IS NOT NULL;

    SELECT json_agg(DISTINCT destino) INTO v_destinos
    FROM (SELECT _ww2_norm_destino(c.produto_data->>'ww_mkt_destino_form') AS destino FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id AND c.archived_at IS NULL) x
    WHERE destino IS NOT NULL;

    -- Tipos: normaliza para 'DW' / 'Elopment' usando _ww_norm_tipo
    SELECT json_agg(DISTINCT tipo) INTO v_tipos
    FROM (SELECT _ww_norm_tipo(c.produto_data->>'ww_tipo_casamento') AS tipo FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id AND c.archived_at IS NULL) x
    WHERE tipo IS NOT NULL;

    SELECT json_agg(json_build_object('id', user_id, 'nome', nome) ORDER BY nome) INTO v_consultores
    FROM (SELECT DISTINCT om.user_id, pr.nome
          FROM org_members om
          JOIN profiles pr ON pr.id = om.user_id
          WHERE om.org_id = v_org_id AND COALESCE(pr.active, TRUE) != FALSE) x;

    RETURN json_build_object(
        'origens', COALESCE(v_origens, '[]'::JSON),
        'faixas', COALESCE(v_faixas, '[]'::JSON),
        'destinos', COALESCE(v_destinos, '[]'::JSON),
        'tipos', COALESCE(v_tipos, '[]'::JSON),
        'consultores', COALESCE(v_consultores, '[]'::JSON)
    );
END $func$;
