-- Fix: analytics_funnel_velocity mostrava mediana/p90 absurdos (776d, 1389d)
-- em etapas como "Pré-Embarque <<< 30 dias". Causa: cards paradíssimos há anos
-- puxavam a média. Solução: trunca o tempo máximo considerado para 365 dias
-- e considera só eventos dentro do período consultado (GREATEST com p_date_start).

DROP FUNCTION IF EXISTS analytics_funnel_velocity(TIMESTAMPTZ, TIMESTAMPTZ, UUID[], UUID[]);

CREATE FUNCTION analytics_funnel_velocity(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL
)
RETURNS TABLE(
    stage_id        UUID,
    stage_nome      TEXT,
    phase_slug      TEXT,
    ordem           INT,
    cards_passaram  BIGINT,
    cards_atuais    BIGINT,
    mediana_dias    NUMERIC,
    p90_dias        NUMERIC,
    media_dias      NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH stages AS (
        SELECT s.id, s.nome, s.ordem, pp.slug AS phase_slug, pp.order_index AS phase_order
        FROM pipeline_stages s
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE s.ativo = true
    ),
    transicoes AS (
        SELECT
            (a.metadata->>'old_stage_id')::UUID AS stage_id,
            a.card_id,
            -- Cap no tempo máximo: só considera dias DENTRO do período consultado.
            -- Se o card entrou na etapa ANTES do p_date_start, o ponto inicial é p_date_start.
            -- Se não houver transição anterior, usa card.created_at mas com o mesmo cap.
            LEAST(
                EXTRACT(EPOCH FROM (
                    a.created_at - GREATEST(
                        p_date_start,
                        COALESCE(
                            (SELECT prev.created_at FROM activities prev
                             WHERE prev.card_id = a.card_id
                               AND prev.tipo = 'stage_changed'
                               AND prev.created_at < a.created_at
                             ORDER BY prev.created_at DESC LIMIT 1),
                            (SELECT c.created_at FROM cards c WHERE c.id = a.card_id)
                        )
                    )
                )) / 86400.0,
                365
            ) AS dias_na_etapa
        FROM activities a
        JOIN cards c ON c.id = a.card_id
        WHERE a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start
          AND a.created_at < p_date_end
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
    ),
    atuais AS (
        SELECT
            c.pipeline_stage_id AS stage_id,
            c.id AS card_id,
            -- Mesmo cap de 365d pra cards atuais, pra evitar "20 cards com 3 anos parados" dominarem
            LEAST(EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400.0, 365) AS dias_na_etapa
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.stage_entered_at IS NOT NULL
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
    ),
    metricas AS (
        SELECT
            s.id AS stage_id,
            s.nome AS stage_nome,
            s.phase_slug,
            s.ordem::INT AS ordem,
            s.phase_order,
            (SELECT COUNT(*) FROM transicoes t WHERE t.stage_id = s.id)::BIGINT AS cards_passaram,
            (SELECT COUNT(*) FROM atuais a WHERE a.stage_id = s.id)::BIGINT AS cards_atuais,
            COALESCE(
                (SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS mediana_dias,
            COALESCE(
                (SELECT PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS p90_dias,
            COALESCE(
                (SELECT AVG(dias_na_etapa)
                 FROM transicoes t WHERE t.stage_id = s.id),
                0
            )::NUMERIC AS media_dias
        FROM stages s
    )
    SELECT m.stage_id, m.stage_nome, m.phase_slug, m.ordem,
           m.cards_passaram, m.cards_atuais,
           ROUND(m.mediana_dias, 1), ROUND(m.p90_dias, 1), ROUND(m.media_dias, 1)
    FROM metricas m
    ORDER BY m.phase_order NULLS LAST, m.ordem;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_funnel_velocity TO authenticated;
