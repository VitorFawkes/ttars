-- Fix: analytics_saude_summary e analytics_saude_list comparavam
-- cards.briefing_inicial com '' (string), mas a coluna é JSONB.
-- '' não é JSON válido → invalid input syntax for type json.
-- Passa a considerar "briefing vazio" quando é NULL, JSONB null ou objeto vazio.

DROP FUNCTION IF EXISTS analytics_saude_summary(UUID[], UUID[]);

CREATE FUNCTION analytics_saude_summary(
    p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids   UUID[] DEFAULT NULL
)
RETURNS TABLE(
    sem_dono          BIGINT,
    sem_contato       BIGINT,
    sla_violado       BIGINT,
    sem_atividade_7d  BIGINT,
    sem_atividade_14d BIGINT,
    sem_atividade_30d BIGINT,
    tarefas_vencidas  BIGINT,
    sem_briefing      BIGINT,
    total_abertos     BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH cards_abertos AS (
        SELECT c.id, c.dono_atual_id, c.pessoa_principal_id, c.stage_entered_at,
               c.updated_at, c.pipeline_stage_id, c.briefing_inicial
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
    ),
    stages AS (
        SELECT s.id, s.sla_hours, pp.slug AS phase_slug
        FROM pipeline_stages s
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
    ),
    tarefas_abertas AS (
        SELECT COUNT(*) AS n
        FROM tarefas t
        JOIN cards c ON c.id = t.card_id
        WHERE t.org_id = v_org
          AND t.concluida = false
          AND t.deleted_at IS NULL
          AND t.data_vencimento IS NOT NULL
          AND t.data_vencimento < NOW()
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND _a_owner_ok(t.responsavel_id, NULL, p_owner_ids)
    )
    SELECT
        COUNT(*) FILTER (WHERE ca.dono_atual_id IS NULL)::BIGINT AS sem_dono,
        COUNT(*) FILTER (WHERE ca.pessoa_principal_id IS NULL)::BIGINT AS sem_contato,
        COUNT(*) FILTER (
            WHERE s.sla_hours IS NOT NULL
              AND ca.stage_entered_at IS NOT NULL
              AND ca.stage_entered_at < NOW() - (s.sla_hours || ' hours')::INTERVAL
        )::BIGINT AS sla_violado,
        COUNT(*) FILTER (WHERE ca.updated_at < NOW() - INTERVAL '7 days')::BIGINT  AS sem_atividade_7d,
        COUNT(*) FILTER (WHERE ca.updated_at < NOW() - INTERVAL '14 days')::BIGINT AS sem_atividade_14d,
        COUNT(*) FILTER (WHERE ca.updated_at < NOW() - INTERVAL '30 days')::BIGINT AS sem_atividade_30d,
        COALESCE((SELECT n FROM tarefas_abertas), 0)::BIGINT AS tarefas_vencidas,
        COUNT(*) FILTER (
            WHERE s.phase_slug = 'sdr'
              AND (
                  ca.briefing_inicial IS NULL
                  OR jsonb_typeof(ca.briefing_inicial) = 'null'
                  OR ca.briefing_inicial = '{}'::jsonb
              )
        )::BIGINT AS sem_briefing,
        COUNT(*)::BIGINT AS total_abertos
    FROM cards_abertos ca
    LEFT JOIN stages s ON s.id = ca.pipeline_stage_id;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_saude_summary TO authenticated;

-- ─────────────────────────────────────────────────

DROP FUNCTION IF EXISTS analytics_saude_list(TEXT, INT, INT, TEXT, UUID[], UUID[]);

CREATE FUNCTION analytics_saude_list(
    p_bucket    TEXT,
    p_limit     INT DEFAULT 50,
    p_offset    INT DEFAULT 0,
    p_sort_by   TEXT DEFAULT 'dias_parado',
    p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids   UUID[] DEFAULT NULL
)
RETURNS TABLE(
    card_id          UUID,
    titulo           TEXT,
    stage_id         UUID,
    stage_nome       TEXT,
    phase_slug       TEXT,
    dono_atual_id    UUID,
    dono_atual_nome  TEXT,
    pessoa_nome      TEXT,
    valor_display    NUMERIC,
    stage_entered_at TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ,
    dias_parado      INT,
    sla_hours        INT,
    horas_sla_excedidas INT,
    total_count      BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH filtered AS (
        SELECT
            c.id AS card_id,
            c.titulo,
            c.pipeline_stage_id AS stage_id,
            s.nome AS stage_nome,
            pp.slug AS phase_slug,
            c.dono_atual_id,
            dono.nome AS dono_atual_nome,
            pessoa.nome AS pessoa_nome,
            COALESCE(c.valor_final, c.valor_estimado, 0) AS valor_display,
            c.stage_entered_at,
            c.updated_at,
            GREATEST(
                EXTRACT(DAY FROM NOW() - c.updated_at)::INT,
                0
            ) AS dias_parado,
            s.sla_hours,
            CASE
                WHEN s.sla_hours IS NOT NULL AND c.stage_entered_at IS NOT NULL
                THEN GREATEST(
                    EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 3600 - s.sla_hours,
                    0
                )::INT
                ELSE NULL
            END AS horas_sla_excedidas,
            c.briefing_inicial
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        LEFT JOIN profiles dono ON dono.id = c.dono_atual_id
        LEFT JOIN contatos pessoa ON pessoa.id = c.pessoa_principal_id
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND CASE p_bucket
              WHEN 'sem_dono'           THEN c.dono_atual_id IS NULL
              WHEN 'sem_contato'        THEN c.pessoa_principal_id IS NULL
              WHEN 'sla_violado'        THEN s.sla_hours IS NOT NULL
                                           AND c.stage_entered_at IS NOT NULL
                                           AND c.stage_entered_at < NOW() - (s.sla_hours || ' hours')::INTERVAL
              WHEN 'sem_atividade_7d'   THEN c.updated_at < NOW() - INTERVAL '7 days'
              WHEN 'sem_atividade_14d'  THEN c.updated_at < NOW() - INTERVAL '14 days'
              WHEN 'sem_atividade_30d'  THEN c.updated_at < NOW() - INTERVAL '30 days'
              WHEN 'sem_briefing'       THEN pp.slug = 'sdr'
                                           AND (
                                               c.briefing_inicial IS NULL
                                               OR jsonb_typeof(c.briefing_inicial) = 'null'
                                               OR c.briefing_inicial = '{}'::jsonb
                                           )
              ELSE FALSE
          END
    ),
    counted AS (
        SELECT COUNT(*) AS total FROM filtered
    )
    SELECT
        f.card_id, f.titulo, f.stage_id, f.stage_nome, f.phase_slug,
        f.dono_atual_id, f.dono_atual_nome, f.pessoa_nome,
        f.valor_display, f.stage_entered_at, f.updated_at,
        f.dias_parado, f.sla_hours, f.horas_sla_excedidas,
        (SELECT total FROM counted)::BIGINT AS total_count
    FROM filtered f
    ORDER BY
        CASE WHEN p_sort_by = 'valor'        THEN f.valor_display END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'dono'         THEN f.dono_atual_nome END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'dias_parado'  THEN f.dias_parado END DESC NULLS LAST,
        f.updated_at ASC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_saude_list TO authenticated;
