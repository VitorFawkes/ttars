-- Fix: analytics_top_destinations lia de contact_stats.top_destinations, que
-- praticamente nunca é preenchido (33/6917 contatos = 0,5%). O destino real da
-- viagem está em cards.produto_data->'destinos' (array JSONB) — preenchido em
-- 131 cards, e ainda existem 9 cards com 'destino' singular e 57 com
-- 'destino_roteiro' (formatos legacy).
--
-- Nova implementação: agrega direto dos cards ganhos, extrai de destinos[],
-- faz fallback pra destino/destino_roteiro singular. Assinatura preservada.

DROP FUNCTION IF EXISTS analytics_top_destinations(DATE, DATE, INT, TEXT, TEXT, UUID, UUID, UUID[], UUID[]);

CREATE FUNCTION analytics_top_destinations(
    p_date_start DATE DEFAULT NULL,
    p_date_end   DATE DEFAULT NULL,
    p_limit      INT  DEFAULT 10,
    p_mode       TEXT DEFAULT 'entries',
    p_product    TEXT DEFAULT NULL,
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL,
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    destino       TEXT,
    total_cards   BIGINT,
    receita_total NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_start TIMESTAMPTZ := COALESCE(p_date_start::TIMESTAMPTZ, '2020-01-01'::TIMESTAMPTZ);
    v_end   TIMESTAMPTZ := COALESCE((p_date_end + 1)::TIMESTAMPTZ, NOW() + INTERVAL '1 day');
BEGIN
    RETURN QUERY
    WITH won_cards AS (
        SELECT c.id,
               c.produto_data,
               COALESCE(c.receita, c.valor_final, c.valor_estimado, 0) AS valor
        FROM cards c
        WHERE c.org_id = v_org
          AND c.status_comercial = 'ganho'
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND CASE
              WHEN p_date_start IS NULL AND p_date_end IS NULL THEN TRUE
              ELSE COALESCE(c.data_fechamento, c.created_at) >= v_start
                   AND COALESCE(c.data_fechamento, c.created_at) < v_end
          END
    ),
    dest_expanded AS (
        -- Formato moderno: produto_data.destinos = ["Portugal", "Espanha"]
        SELECT TRIM(elem::TEXT, '"') AS destino_nome, wc.id AS card_id, wc.valor
        FROM won_cards wc
        CROSS JOIN LATERAL jsonb_array_elements(wc.produto_data->'destinos') AS elem
        WHERE jsonb_typeof(wc.produto_data->'destinos') = 'array'

        UNION ALL
        -- Legacy 1: produto_data.destino = "Portugal"
        SELECT (wc.produto_data->>'destino')::TEXT AS destino_nome, wc.id, wc.valor
        FROM won_cards wc
        WHERE jsonb_typeof(wc.produto_data->'destinos') IS DISTINCT FROM 'array'
          AND wc.produto_data->>'destino' IS NOT NULL
          AND wc.produto_data->>'destino' != ''

        UNION ALL
        -- Legacy 2: produto_data.destino_roteiro = "Portugal"
        SELECT (wc.produto_data->>'destino_roteiro')::TEXT AS destino_nome, wc.id, wc.valor
        FROM won_cards wc
        WHERE jsonb_typeof(wc.produto_data->'destinos') IS DISTINCT FROM 'array'
          AND wc.produto_data->>'destino' IS NULL
          AND wc.produto_data->>'destino_roteiro' IS NOT NULL
          AND wc.produto_data->>'destino_roteiro' != ''
    )
    SELECT
        TRIM(de.destino_nome) AS destino,
        COUNT(DISTINCT de.card_id)::BIGINT AS total_cards,
        COALESCE(SUM(de.valor), 0)::NUMERIC AS receita_total
    FROM dest_expanded de
    WHERE de.destino_nome IS NOT NULL
      AND TRIM(de.destino_nome) != ''
    GROUP BY TRIM(de.destino_nome)
    ORDER BY COUNT(DISTINCT de.card_id) DESC, receita_total DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_top_destinations TO authenticated;
