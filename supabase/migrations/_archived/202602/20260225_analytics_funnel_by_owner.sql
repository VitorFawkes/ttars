-- ============================================================
-- Analytics: Funil por Responsável (Stacked Kanban Operacional)
--
-- Nova RPC que retorna contagem de cards por etapa E por owner,
-- permitindo gráfico de barras empilhadas no frontend.
-- Mesma lógica de CTEs do analytics_funnel_live, com GROUP BY
-- adicionando dono_atual_id + nome do profile.
-- ============================================================

CREATE OR REPLACE FUNCTION analytics_funnel_by_owner(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01',
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product    TEXT DEFAULT NULL,
    p_mode       TEXT DEFAULT 'entries',
    p_stage_id   UUID DEFAULT NULL,
    p_owner_id   UUID DEFAULT NULL
)
RETURNS TABLE(
    stage_id      UUID,
    stage_nome    TEXT,
    fase          TEXT,
    ordem         INT,
    owner_id      UUID,
    owner_name    TEXT,
    card_count    BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_mode = 'entries' OR (p_mode = 'stage_entry' AND p_stage_id IS NULL) THEN
        -- ENTRADAS: quantos cards ENTRARAM em cada etapa no período, por owner
        RETURN QUERY
        WITH transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            JOIN cards c ON c.id = a.card_id
            WHERE a.tipo = 'stage_changed'
              AND a.created_at >= p_date_start AND a.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.created_at >= p_date_start AND c.created_at < p_date_end
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        )
        SELECT
            s.id                                        AS stage_id,
            s.nome                                      AS stage_nome,
            s.fase,
            s.ordem::INT,
            c.dono_atual_id                             AS owner_id,
            COALESCE(p.nome, 'Não atribuído')           AS owner_name,
            COUNT(ae.card_id)::BIGINT                   AS card_count
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN profiles p ON p.id = c.dono_atual_id
        WHERE s.ativo = true
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index, c.dono_atual_id, p.nome
        ORDER BY pp.order_index, s.ordem, p.nome NULLS LAST;

    ELSE
        -- POPULAÇÃO-BASED: primeiro define a população, depois conta entradas por owner
        RETURN QUERY
        WITH population AS (
            SELECT c.id AS card_id
            FROM cards c
            WHERE c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND (p_owner_id IS NULL OR c.dono_atual_id = p_owner_id)
              AND CASE
                  WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
                      c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
                  WHEN p_mode = 'ganho_sdr' THEN
                      c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
                  WHEN p_mode = 'ganho_planner' THEN
                      c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
                  WHEN p_mode = 'ganho_total' THEN
                      c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
                  ELSE
                      c.created_at >= p_date_start AND c.created_at < p_date_end
              END
        ),
        transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            WHERE a.tipo = 'stage_changed'
              AND a.card_id IN (SELECT pop.card_id FROM population pop)
        ),
        creation_entries AS (
            SELECT
                COALESCE(
                    (SELECT (a2.metadata->>'old_stage_id')::UUID
                     FROM activities a2
                     WHERE a2.card_id = c.id AND a2.tipo = 'stage_changed'
                     ORDER BY a2.created_at ASC LIMIT 1),
                    c.pipeline_stage_id
                ) AS entered_stage_id,
                c.id AS card_id
            FROM cards c
            WHERE c.id IN (SELECT pop.card_id FROM population pop)
        ),
        all_entries AS (
            SELECT te.entered_stage_id, te.card_id FROM transition_entries te
            UNION
            SELECT ce.entered_stage_id, ce.card_id FROM creation_entries ce
        )
        SELECT
            s.id                                        AS stage_id,
            s.nome                                      AS stage_nome,
            s.fase,
            s.ordem::INT,
            c.dono_atual_id                             AS owner_id,
            COALESCE(p.nome, 'Não atribuído')           AS owner_name,
            COUNT(ae.card_id)::BIGINT                   AS card_count
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN profiles p ON p.id = c.dono_atual_id
        WHERE s.ativo = true
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index, c.dono_atual_id, p.nome
        ORDER BY pp.order_index, s.ordem, p.nome NULLS LAST;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_funnel_by_owner TO authenticated;
