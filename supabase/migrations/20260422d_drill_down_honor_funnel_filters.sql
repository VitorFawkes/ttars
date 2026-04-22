-- Fix: drill-down de barra do Funil v3 não respeitava TODOS os filtros do funil.
-- Faltava: rootStageId ("Desde X"), status (Todos/Abertos/Ganhos/Perdidos) e
-- ganhoFase (SDR/Planner/Pós). Resultado: clicar em "Em Viagem" com "Desde Oportunidade"
-- mostrava 7 cards no drawer, mas o funil contava 4 — os 3 extras eram cards que
-- chegaram em "Em Viagem" sem passar por "Oportunidade".
--
-- Fix: adiciona 3 parâmetros na RPC para o drill espelhar 100% o filtro do funil v3.

DROP FUNCTION IF EXISTS public.analytics_drill_down_cards(
    timestamptz, timestamptz, text, text, uuid, uuid, uuid, uuid, text, text, text,
    timestamptz, timestamptz, text, text, text, integer, integer, text, boolean,
    uuid[], uuid[], text
);

CREATE FUNCTION public.analytics_drill_down_cards(
    p_date_start          timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end            timestamptz DEFAULT now(),
    p_product             text DEFAULT NULL,
    p_mode                text DEFAULT 'entries',
    p_global_stage_id     uuid DEFAULT NULL,
    p_global_owner_id     uuid DEFAULT NULL,
    p_drill_stage_id      uuid DEFAULT NULL,
    p_drill_owner_id      uuid DEFAULT NULL,
    p_drill_loss_reason   text DEFAULT NULL,
    p_drill_status        text DEFAULT NULL,
    p_drill_phase         text DEFAULT NULL,
    p_drill_period_start  timestamptz DEFAULT NULL,
    p_drill_period_end    timestamptz DEFAULT NULL,
    p_drill_source        text DEFAULT 'default',
    p_sort_by             text DEFAULT 'created_at',
    p_sort_dir            text DEFAULT 'desc',
    p_limit               integer DEFAULT 50,
    p_offset              integer DEFAULT 0,
    p_drill_destino       text DEFAULT NULL,
    p_exclude_terminal    boolean DEFAULT false,
    p_tag_ids             uuid[] DEFAULT NULL,
    p_owner_ids           uuid[] DEFAULT NULL,
    p_date_ref            text DEFAULT 'stage',
    -- Novos (Funil v3) — espelham o filtro da página
    p_drill_root_stage_id uuid    DEFAULT NULL,  -- "Desde X": só cards que passaram por essa etapa
    p_drill_status_array  text[]  DEFAULT NULL,  -- ['aberto'] | ['ganho'] | ['perdido'] | NULL (todos)
    p_drill_ganho_fase    text    DEFAULT NULL   -- 'sdr' | 'planner' | 'pos' | NULL
)
RETURNS TABLE(
    id uuid, titulo text, produto text, status_comercial text, etapa_nome text, fase text,
    dono_atual_nome text, valor_display numeric, receita numeric,
    created_at timestamptz, data_fechamento timestamptz,
    pessoa_nome text, pessoa_telefone text,
    total_count bigint, stage_entered_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_query TEXT;
    v_where TEXT := '';
    v_order TEXT;
    v_source TEXT := COALESCE(p_drill_source, 'default');
    v_period_start TIMESTAMPTZ;
    v_period_end   TIMESTAMPTZ;
    v_is_entries_mode BOOLEAN;
    v_is_cohort BOOLEAN := (p_date_ref = 'created');
    v_has_status_array BOOLEAN := p_drill_status_array IS NOT NULL
                                  AND array_length(p_drill_status_array, 1) > 0;
BEGIN
    v_is_entries_mode := (p_mode = 'entries' OR p_mode IS NULL
        OR (p_mode = 'stage_entry' AND p_global_stage_id IS NULL));

    -- 1. Filtros globais (produto, owner, tag, destino, sub_card, terminal)
    v_where := v_where || ' AND COALESCE(c.card_type, ''standard'') != ''sub_card''';

    IF p_product IS NOT NULL THEN
        v_where := v_where || format(' AND c.produto::TEXT = %L', p_product);
    END IF;

    IF p_owner_ids IS NOT NULL AND array_length(p_owner_ids, 1) > 0 THEN
        v_where := v_where || format(' AND c.dono_atual_id = ANY(%L::UUID[])', p_owner_ids);
    ELSIF p_global_owner_id IS NOT NULL THEN
        v_where := v_where || format(' AND c.dono_atual_id = %L', p_global_owner_id);
    END IF;

    IF p_drill_destino IS NOT NULL THEN
        v_where := v_where || format(
            ' AND EXISTS (
                SELECT 1 FROM contact_stats cs2
                CROSS JOIN LATERAL jsonb_array_elements(cs2.top_destinations) AS d(elem)
                WHERE cs2.contact_id = c.pessoa_principal_id
                  AND cs2.top_destinations IS NOT NULL
                  AND jsonb_typeof(cs2.top_destinations) = ''array''
                  AND jsonb_array_length(cs2.top_destinations) > 0
                  AND (d.elem #>> ''{}'' = %L OR d.elem->>''name'' = %L)
            )',
            p_drill_destino, p_drill_destino
        );
    END IF;

    IF p_exclude_terminal THEN
        v_where := v_where || ' AND ps.is_won IS NOT TRUE AND ps.is_lost IS NOT TRUE';
    END IF;

    IF p_tag_ids IS NOT NULL AND array_length(p_tag_ids, 1) > 0 THEN
        v_where := v_where || format(
            ' AND c.id IN (SELECT cta.card_id FROM card_tag_assignments cta WHERE cta.tag_id = ANY(%L::UUID[]))',
            p_tag_ids
        );
    END IF;

    -- 1.b — Filtros novos do Funil v3 (espelham o visual)
    IF v_has_status_array THEN
        v_where := v_where || format(
            ' AND c.status_comercial::TEXT = ANY(%L::TEXT[])',
            p_drill_status_array
        );
    END IF;

    IF p_drill_ganho_fase IS NOT NULL THEN
        IF p_drill_ganho_fase = 'sdr' THEN
            v_where := v_where || format(
                ' AND c.ganho_sdr = true AND c.ganho_sdr_at >= %L AND c.ganho_sdr_at < %L',
                p_date_start, p_date_end
            );
        ELSIF p_drill_ganho_fase = 'planner' THEN
            v_where := v_where || format(
                ' AND c.ganho_planner = true AND c.ganho_planner_at >= %L AND c.ganho_planner_at < %L',
                p_date_start, p_date_end
            );
        ELSIF p_drill_ganho_fase = 'pos' THEN
            v_where := v_where || format(
                ' AND c.ganho_pos = true AND c.ganho_pos_at >= %L AND c.ganho_pos_at < %L',
                p_date_start, p_date_end
            );
        END IF;
    END IF;

    -- 1.c — Filtro "Desde X" do funil: só cards que passaram pela rootStageId (qualquer tempo)
    IF p_drill_root_stage_id IS NOT NULL THEN
        v_where := v_where || format(
            ' AND c.id IN (
                SELECT DISTINCT a.card_id FROM activities a
                WHERE a.tipo = ''stage_changed''
                  AND (a.metadata->>''new_stage_id'')::UUID = %L
                UNION
                SELECT c4.id FROM cards c4
                WHERE c4.deleted_at IS NULL AND c4.archived_at IS NULL
                  AND COALESCE(
                      (SELECT (a2.metadata->>''old_stage_id'')::UUID FROM activities a2
                       WHERE a2.card_id = c4.id AND a2.tipo = ''stage_changed''
                       ORDER BY a2.created_at ASC LIMIT 1),
                      c4.pipeline_stage_id
                  ) = %L
            )',
            p_drill_root_stage_id, p_drill_root_stage_id
        );
    END IF;

    -- 2. Mode global (ganhos SDR/Planner/Total — usado por outras telas; Funil v3 usa os filtros 1.b)
    IF NOT v_is_entries_mode THEN
        IF p_mode = 'stage_entry' AND p_global_stage_id IS NOT NULL THEN
            v_where := v_where || format(
                ' AND c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(%L, %L, %L, %L))',
                p_global_stage_id, p_date_start, p_date_end, p_product
            );
        ELSIF p_mode = 'ganho_sdr' THEN
            v_where := v_where || format(' AND c.ganho_sdr = true AND c.ganho_sdr_at >= %L AND c.ganho_sdr_at < %L', p_date_start, p_date_end);
        ELSIF p_mode = 'ganho_planner' THEN
            v_where := v_where || format(' AND c.ganho_planner = true AND c.ganho_planner_at >= %L AND c.ganho_planner_at < %L', p_date_start, p_date_end);
        ELSIF p_mode = 'ganho_total' THEN
            v_where := v_where || format(' AND c.ganho_pos = true AND c.ganho_pos_at >= %L AND c.ganho_pos_at < %L', p_date_start, p_date_end);
        END IF;
    END IF;

    -- 3. Lógica por source
    IF v_source = 'stage_entries' THEN
        IF p_drill_stage_id IS NOT NULL AND v_is_entries_mode AND v_is_cohort THEN
            -- COORTE (date_ref='created'): cards criados no período que passaram pela etapa (qualquer tempo)
            v_where := v_where || format(
                ' AND c.created_at >= %L AND c.created_at < %L
                  AND c.id IN (
                    SELECT DISTINCT a.card_id FROM activities a
                    JOIN cards c2 ON c2.id = a.card_id
                    WHERE a.tipo = ''stage_changed''
                      AND (a.metadata->>''new_stage_id'')::UUID = %L
                      AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                    UNION
                    SELECT c3.id FROM cards c3
                    WHERE c3.deleted_at IS NULL AND c3.archived_at IS NULL
                      AND COALESCE(
                          (SELECT (a2.metadata->>''old_stage_id'')::UUID FROM activities a2
                           WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                           ORDER BY a2.created_at ASC LIMIT 1),
                          c3.pipeline_stage_id
                      ) = %L
                )',
                p_date_start, p_date_end,
                p_drill_stage_id, p_drill_stage_id
            );
        ELSIF p_drill_stage_id IS NOT NULL AND v_is_entries_mode THEN
            -- date_ref='stage': transições para a etapa no período + creation_entries no período
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT a.card_id FROM activities a
                    JOIN cards c2 ON c2.id = a.card_id
                    WHERE a.tipo = ''stage_changed''
                      AND (a.metadata->>''new_stage_id'')::UUID = %L
                      AND a.created_at >= %L AND a.created_at < %L
                      AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                    UNION
                    SELECT c3.id FROM cards c3
                    WHERE c3.created_at >= %L AND c3.created_at < %L
                      AND c3.deleted_at IS NULL AND c3.archived_at IS NULL
                      AND COALESCE(
                          (SELECT (a2.metadata->>''old_stage_id'')::UUID FROM activities a2
                           WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                           ORDER BY a2.created_at ASC LIMIT 1),
                          c3.pipeline_stage_id
                      ) = %L
                )',
                p_drill_stage_id,
                p_date_start, p_date_end,
                p_date_start, p_date_end,
                p_drill_stage_id
            );
        ELSIF p_drill_stage_id IS NOT NULL AND NOT v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT a.card_id FROM activities a
                    JOIN cards c2 ON c2.id = a.card_id
                    WHERE a.tipo = ''stage_changed''
                      AND (a.metadata->>''new_stage_id'')::UUID = %L
                      AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                    UNION
                    SELECT c3.id FROM cards c3
                    WHERE c3.deleted_at IS NULL AND c3.archived_at IS NULL
                      AND COALESCE(
                          (SELECT (a2.metadata->>''old_stage_id'')::UUID FROM activities a2
                           WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                           ORDER BY a2.created_at ASC LIMIT 1),
                          c3.pipeline_stage_id
                      ) = %L
                )',
                p_drill_stage_id, p_drill_stage_id
            );
        ELSIF v_is_entries_mode THEN
            v_where := v_where || format(' AND c.created_at >= %L AND c.created_at < %L', p_date_start, p_date_end);
        END IF;

        IF p_drill_owner_id IS NOT NULL THEN
            IF LOWER(COALESCE(p_drill_phase, '')) IN ('sdr') THEN
                v_where := v_where || format(' AND c.sdr_owner_id = %L', p_drill_owner_id);
            ELSIF LOWER(COALESCE(p_drill_phase, '')) IN ('vendas', 'planner') THEN
                v_where := v_where || format(' AND c.vendas_owner_id = %L', p_drill_owner_id);
            ELSE
                v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
            END IF;
        END IF;

    ELSIF v_source = 'closed_deals' THEN
        v_where := v_where || ' AND c.status_comercial = ''ganho''';
        v_where := v_where || ' AND c.data_fechamento IS NOT NULL';
        v_period_start := COALESCE(p_drill_period_start, p_date_start);
        v_period_end   := COALESCE(p_drill_period_end, p_date_end + interval '1 day');
        v_where := v_where || format(' AND c.data_fechamento >= %L AND c.data_fechamento < %L', v_period_start, v_period_end);
        IF p_drill_owner_id IS NOT NULL THEN
            v_where := v_where || format(' AND (c.vendas_owner_id = %L OR c.dono_atual_id = %L)', p_drill_owner_id, p_drill_owner_id);
        END IF;

    ELSIF v_source = 'current_stage' THEN
        v_where := v_where || ' AND c.status_comercial NOT IN (''ganho'', ''perdido'')';
        v_where := v_where || ' AND ps.ativo = true';
        IF p_drill_stage_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.pipeline_stage_id = %L', p_drill_stage_id);
        END IF;
        IF v_is_entries_mode THEN
            v_where := v_where || format(' AND c.created_at >= %L AND c.created_at < %L', p_date_start, p_date_end);
        END IF;
        IF p_drill_owner_id IS NOT NULL THEN
            IF LOWER(COALESCE(p_drill_phase, '')) IN ('sdr') THEN
                v_where := v_where || format(' AND c.sdr_owner_id = %L', p_drill_owner_id);
            ELSIF LOWER(COALESCE(p_drill_phase, '')) IN ('vendas', 'planner') THEN
                v_where := v_where || format(' AND c.vendas_owner_id = %L', p_drill_owner_id);
            ELSE
                v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
            END IF;
        END IF;

    ELSIF v_source = 'lost_deals' THEN
        -- Quando p_drill_status_array já contém 'perdido', o filtro status_comercial já foi aplicado (1.b).
        -- Caso contrário (compat), força aqui:
        IF NOT v_has_status_array THEN
            v_where := v_where || ' AND c.status_comercial = ''perdido''';
        END IF;
        IF p_drill_loss_reason IS NOT NULL THEN
            v_where := v_where || format(' AND COALESCE(mp.nome, ''Sem motivo informado'') = %L', p_drill_loss_reason);
        END IF;
        IF v_is_entries_mode THEN
            IF v_is_cohort THEN
                v_where := v_where || format(' AND c.created_at >= %L AND c.created_at < %L', p_date_start, p_date_end);
            ELSE
                v_where := v_where || format(
                    ' AND COALESCE(c.data_fechamento, c.updated_at) >= %L
                      AND COALESCE(c.data_fechamento, c.updated_at) < %L',
                    p_date_start, p_date_end
                );
            END IF;
        END IF;
        IF p_drill_stage_id IS NOT NULL THEN
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT a.card_id FROM activities a
                    WHERE a.tipo = ''stage_changed''
                      AND (a.metadata->>''new_stage_id'')::UUID = %L
                )',
                p_drill_stage_id
            );
        END IF;
        IF p_drill_owner_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
        END IF;

    ELSIF v_source = 'macro_funnel' THEN
        IF p_drill_phase IS NOT NULL AND v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT sub.cid FROM (
                        SELECT a.card_id AS cid FROM activities a
                        JOIN cards c2 ON c2.id = a.card_id
                        WHERE a.tipo = ''stage_changed''
                          AND (a.metadata->>''new_stage_id'')::UUID IN (
                              SELECT ps2.id FROM pipeline_stages ps2
                              JOIN pipeline_phases pp2 ON pp2.id = ps2.phase_id
                              WHERE pp2.slug = %L
                          )
                          AND a.created_at >= %L AND a.created_at < %L
                          AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                        UNION ALL
                        SELECT c3.id AS cid FROM cards c3
                        WHERE c3.created_at >= %L AND c3.created_at < %L
                          AND c3.deleted_at IS NULL AND c3.archived_at IS NULL
                          AND COALESCE(
                              (SELECT (a2.metadata->>''old_stage_id'')::UUID
                               FROM activities a2 WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                               ORDER BY a2.created_at ASC LIMIT 1),
                              c3.pipeline_stage_id
                          ) IN (
                              SELECT ps3.id FROM pipeline_stages ps3
                              JOIN pipeline_phases pp3 ON pp3.id = ps3.phase_id
                              WHERE pp3.slug = %L
                          )
                    ) sub
                )',
                p_drill_phase, p_date_start, p_date_end,
                p_date_start, p_date_end, p_drill_phase
            );
        ELSIF p_drill_phase IS NOT NULL AND NOT v_is_entries_mode THEN
            v_where := v_where || format(
                ' AND c.id IN (
                    SELECT DISTINCT sub.cid FROM (
                        SELECT a.card_id AS cid FROM activities a
                        JOIN cards c2 ON c2.id = a.card_id
                        WHERE a.tipo = ''stage_changed''
                          AND (a.metadata->>''new_stage_id'')::UUID IN (
                              SELECT ps2.id FROM pipeline_stages ps2
                              JOIN pipeline_phases pp2 ON pp2.id = ps2.phase_id
                              WHERE pp2.slug = %L
                          )
                          AND c2.deleted_at IS NULL AND c2.archived_at IS NULL
                        UNION ALL
                        SELECT c3.id AS cid FROM cards c3
                        WHERE c3.deleted_at IS NULL AND c3.archived_at IS NULL
                          AND COALESCE(
                              (SELECT (a2.metadata->>''old_stage_id'')::UUID
                               FROM activities a2 WHERE a2.card_id = c3.id AND a2.tipo = ''stage_changed''
                               ORDER BY a2.created_at ASC LIMIT 1),
                              c3.pipeline_stage_id
                          ) IN (
                              SELECT ps3.id FROM pipeline_stages ps3
                              JOIN pipeline_phases pp3 ON pp3.id = ps3.phase_id
                              WHERE pp3.slug = %L
                          )
                    ) sub
                )',
                p_drill_phase, p_drill_phase
            );
        ELSIF v_is_entries_mode THEN
            v_where := v_where || format(' AND c.created_at >= %L AND c.created_at < %L', p_date_start, p_date_end);
        END IF;
        IF p_drill_owner_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
        END IF;

    ELSE
        IF v_is_entries_mode THEN
            v_where := v_where || format(' AND c.created_at >= %L AND c.created_at < %L', p_date_start, p_date_end);
        END IF;
        IF p_drill_stage_id IS NOT NULL THEN
            v_where := v_where || format(' AND c.pipeline_stage_id = %L', p_drill_stage_id);
        END IF;
        IF p_drill_owner_id IS NOT NULL THEN
            IF LOWER(COALESCE(p_drill_phase, '')) IN ('sdr') THEN
                v_where := v_where || format(' AND c.sdr_owner_id = %L', p_drill_owner_id);
            ELSIF LOWER(COALESCE(p_drill_phase, '')) IN ('vendas', 'planner') THEN
                v_where := v_where || format(' AND c.vendas_owner_id = %L', p_drill_owner_id);
            ELSE
                v_where := v_where || format(' AND c.dono_atual_id = %L', p_drill_owner_id);
            END IF;
        END IF;
        IF p_drill_loss_reason IS NOT NULL THEN
            v_where := v_where || format(' AND mp.nome = %L', p_drill_loss_reason);
        END IF;
        IF p_drill_status IS NOT NULL THEN
            v_where := v_where || format(' AND c.status_comercial = %L', p_drill_status);
        END IF;
        IF p_drill_phase IS NOT NULL AND p_drill_owner_id IS NULL THEN
            v_where := v_where || format(' AND pp.slug = %L', p_drill_phase);
        END IF;
        IF p_drill_period_start IS NOT NULL AND p_drill_period_end IS NOT NULL THEN
            v_where := v_where || format(' AND c.data_fechamento >= %L AND c.data_fechamento < %L', p_drill_period_start, p_drill_period_end);
        END IF;
    END IF;

    -- Sort
    IF p_sort_by = 'created_at' AND p_sort_dir = 'desc' THEN
        IF v_source = 'current_stage' THEN
            p_sort_by := 'stage_entered_at';
            p_sort_dir := 'asc';
        ELSIF v_source = 'closed_deals' THEN
            p_sort_by := 'data_fechamento';
            p_sort_dir := 'desc';
        END IF;
    END IF;

    v_order := CASE p_sort_by
        WHEN 'titulo'           THEN 'c.titulo'
        WHEN 'valor_display'    THEN 'COALESCE(c.valor_final, c.valor_estimado)'
        WHEN 'etapa_nome'       THEN 'ps.nome'
        WHEN 'data_fechamento'  THEN 'c.data_fechamento'
        WHEN 'receita'          THEN 'c.receita'
        WHEN 'stage_entered_at' THEN 'COALESCE(c.stage_entered_at, c.updated_at, c.created_at)'
        ELSE 'c.created_at'
    END;
    v_order := v_order || CASE WHEN p_sort_dir = 'asc' THEN ' ASC NULLS LAST' ELSE ' DESC NULLS LAST' END;

    v_query := format(
        'SELECT
            c.id,
            c.titulo,
            c.produto::TEXT AS produto,
            c.status_comercial,
            ps.nome AS etapa_nome,
            pp.slug AS fase,
            pr.nome AS dono_atual_nome,
            COALESCE(c.valor_final, c.valor_estimado, 0)::NUMERIC AS valor_display,
            COALESCE(c.receita, 0)::NUMERIC AS receita,
            c.created_at,
            c.data_fechamento,
            ct.nome AS pessoa_nome,
            ct.telefone AS pessoa_telefone,
            COUNT(*) OVER() AS total_count,
            COALESCE(c.stage_entered_at, c.updated_at) AS stage_entered_at
        FROM cards c
        LEFT JOIN pipeline_stages ps ON ps.id = c.pipeline_stage_id
        LEFT JOIN pipeline_phases pp ON pp.id = ps.phase_id
        LEFT JOIN profiles pr ON pr.id = c.dono_atual_id
        LEFT JOIN contatos ct ON ct.id = c.pessoa_principal_id
        LEFT JOIN motivos_perda mp ON mp.id = c.motivo_perda_id
        WHERE c.org_id = requesting_org_id() AND c.deleted_at IS NULL AND c.archived_at IS NULL
        %s
        ORDER BY %s
        LIMIT %s OFFSET %s',
        v_where, v_order, p_limit, p_offset
    );

    RETURN QUERY EXECUTE v_query;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.analytics_drill_down_cards TO authenticated;
