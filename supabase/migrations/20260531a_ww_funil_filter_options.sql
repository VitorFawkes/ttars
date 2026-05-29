-- ============================================================================
-- ww_funil_filter_options — opções de filtro para a aba "Funil comparado"
--
-- POR QUE UM RPC DEDICADO (e não reusar ww2_filter_options):
--   O funil (ww_funil_conversao_v1) filtra faixa/convidados/destino usando os
--   normalizadores STRICT (_ww2_norm_faixa_strict, _ww2_norm_conv_strict,
--   _ww2_norm_dest_strict). O ww2_filter_options usa os NÃO-strict, cujos
--   rótulos DIVERGEM (ex: 'Mais de R$500 mil' vs '+R$500 mil'; destino INITCAP
--   cru vs conjunto fechado Caribe/Itália/...). Se a aba usasse as opções
--   globais, o filtro casaria com NADA e o funil voltaria zerado.
--   Trocar o ww2_filter_options para strict quebraria as 5 outras abas que o
--   consomem com RPCs não-strict. Logo: RPC novo, mesmas expressões do funil.
--
-- Universo idêntico ao pool do ww_funil_conversao_v1:
--   produto='WEDDING' AND org_id AND deleted_at IS NULL AND archived_at IS NULL.
-- Tipo (DW/Elopment) NÃO é exposto aqui: o funil filtra tipo por valor cru e a
-- aba v1 não oferece esse filtro.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ww_funil_filter_options(
    p_org_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $func$
DECLARE
    v_org_id UUID := COALESCE(p_org_id, requesting_org_id());
    v_faixas JSON; v_convidados JSON; v_destinos JSON; v_origens JSON; v_consultores JSON;
BEGIN
    SELECT json_agg(faixa ORDER BY faixa) INTO v_faixas
    FROM (SELECT DISTINCT _ww2_norm_faixa_strict(c.produto_data->>'ww_mkt_orcamento_form') AS faixa
          FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
            AND c.deleted_at IS NULL AND c.archived_at IS NULL) x
    WHERE faixa IS NOT NULL;

    SELECT json_agg(convidados ORDER BY convidados) INTO v_convidados
    FROM (SELECT DISTINCT _ww2_norm_conv_strict(c.produto_data->>'ww_mkt_convidados_form') AS convidados
          FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
            AND c.deleted_at IS NULL AND c.archived_at IS NULL) x
    WHERE convidados IS NOT NULL;

    SELECT json_agg(destino ORDER BY destino) INTO v_destinos
    FROM (SELECT DISTINCT _ww2_norm_dest_strict(c.produto_data->>'ww_mkt_destino_form') AS destino
          FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
            AND c.deleted_at IS NULL AND c.archived_at IS NULL) x
    WHERE destino IS NOT NULL;

    SELECT json_agg(origem ORDER BY origem) INTO v_origens
    FROM (SELECT DISTINCT _ww2_norm_origem(c.marketing_data) AS origem
          FROM cards c
          WHERE c.produto::TEXT='WEDDING' AND c.org_id=v_org_id
            AND c.deleted_at IS NULL AND c.archived_at IS NULL) x
    WHERE origem IS NOT NULL;

    -- consultores: mesmo padrão do ww2_filter_options (membros do workspace)
    SELECT json_agg(json_build_object('id', user_id, 'nome', nome) ORDER BY nome) INTO v_consultores
    FROM (SELECT DISTINCT om.user_id, pr.nome
          FROM org_members om
          JOIN profiles pr ON pr.id = om.user_id
          WHERE om.org_id = v_org_id AND COALESCE(pr.active, TRUE) != FALSE) x;

    RETURN json_build_object(
        'faixas',      COALESCE(v_faixas, '[]'::JSON),
        'convidados',  COALESCE(v_convidados, '[]'::JSON),
        'destinos',    COALESCE(v_destinos, '[]'::JSON),
        'origens',     COALESCE(v_origens, '[]'::JSON),
        'consultores', COALESCE(v_consultores, '[]'::JSON)
    );
END $func$;

GRANT EXECUTE ON FUNCTION public.ww_funil_filter_options(UUID) TO authenticated;
