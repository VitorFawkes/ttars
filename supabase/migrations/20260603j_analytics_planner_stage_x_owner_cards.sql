-- Cards EXATOS por trás de uma célula do heatmap "Tempo em cada etapa por Planner"
-- (analytics_planner_stage_x_owner). Espelha a CTE `transicoes` daquela RPC: cards que SAÍRAM
-- da etapa no período (activities stage_changed com old_stage_id = etapa), atribuídos ao
-- vendas_owner. Antes, clicar na célula abria o drill 'current_stage' (snapshot dos cards
-- AGORA na etapa) — população errada, mostrava pouquíssimos cards. Esta RPC devolve os cards
-- que o número representa (cards_passaram), pro drawer mostrar TODOS (paginado, sem cap).
--
-- DISTINCT por card (última saída no período) — "todos os cards que passaram", com o tempo que
-- ficaram na etapa. Isolamento: org_id + produto::TEXT + sub_card + deleted.

CREATE OR REPLACE FUNCTION public.analytics_planner_stage_x_owner_cards(
    p_stage_id   UUID,
    p_owner_id   UUID,
    p_date_start TIMESTAMPTZ,
    p_date_end   TIMESTAMPTZ,
    p_product    TEXT DEFAULT NULL
)
RETURNS TABLE(
    id               UUID,
    titulo           TEXT,
    produto          TEXT,
    status_comercial TEXT,
    etapa_nome       TEXT,
    fase             TEXT,
    dono_atual_nome  TEXT,
    valor_display    NUMERIC,
    receita          NUMERIC,
    created_at       TIMESTAMPTZ,
    data_fechamento  TIMESTAMPTZ,
    pessoa_nome      TEXT,
    pessoa_telefone  TEXT,
    stage_entered_at TIMESTAMPTZ,
    dias_na_etapa    NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH transicoes AS (
        SELECT DISTINCT ON (a.card_id)
            a.card_id,
            EXTRACT(EPOCH FROM (
                a.created_at - COALESCE(
                    (SELECT prev.created_at FROM activities prev
                     WHERE prev.card_id = a.card_id
                       AND prev.tipo = 'stage_changed'
                       AND prev.created_at < a.created_at
                     ORDER BY prev.created_at DESC LIMIT 1),
                    (SELECT c2.created_at FROM cards c2 WHERE c2.id = a.card_id)
                )
            )) / 86400.0 AS dias
        FROM activities a
        JOIN cards c ON c.id = a.card_id
        WHERE a.tipo = 'stage_changed'
          AND (a.metadata->>'old_stage_id')::UUID = p_stage_id
          AND a.created_at >= p_date_start
          AND a.created_at <  p_date_end
          AND c.org_id = v_org
          AND c.vendas_owner_id = p_owner_id
          AND c.deleted_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
        ORDER BY a.card_id, a.created_at DESC
    )
    SELECT
        c.id,
        c.titulo,
        c.produto::TEXT,
        c.status_comercial::TEXT,
        s.nome AS etapa_nome,
        pp.slug AS fase,
        prof.nome AS dono_atual_nome,
        COALESCE(c.valor_final, c.valor_estimado, 0)::NUMERIC AS valor_display,
        COALESCE(c.receita, 0)::NUMERIC AS receita,
        c.created_at,
        c.data_fechamento,
        pe.nome AS pessoa_nome,
        NULL::TEXT AS pessoa_telefone,
        c.stage_entered_at,
        ROUND(t.dias, 1) AS dias_na_etapa
    FROM transicoes t
    JOIN cards c ON c.id = t.card_id
    LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
    LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    LEFT JOIN profiles prof ON prof.id = c.vendas_owner_id
    LEFT JOIN contatos pe ON pe.id = c.pessoa_principal_id
    ORDER BY t.dias DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_planner_stage_x_owner_cards TO authenticated;
