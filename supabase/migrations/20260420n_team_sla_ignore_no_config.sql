-- Fix: analytics_team_sla_compliance mostrava 100% de compliance para TODOS
-- quando nenhuma etapa tinha sla_hours configurado. Isso inflava o indicador.
-- Agora só conta transições em etapas COM SLA definido. Se a pessoa nunca
-- passou por uma etapa com SLA, compliance_rate = NULL (frontend mostra "—").

DROP FUNCTION IF EXISTS analytics_team_sla_compliance(TIMESTAMPTZ, TIMESTAMPTZ, UUID[]);

CREATE FUNCTION analytics_team_sla_compliance(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids  UUID[] DEFAULT NULL
)
RETURNS TABLE(
    user_id               UUID,
    user_nome             TEXT,
    total_transicoes      BIGINT,
    sla_cumpridas         BIGINT,
    sla_violadas          BIGINT,
    compliance_rate       NUMERIC,
    tempo_medio_horas     NUMERIC
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
        SELECT
            c.dono_atual_id AS user_id,
            a.card_id,
            s.sla_hours,
            EXTRACT(EPOCH FROM (
                a.created_at - COALESCE(
                    (SELECT prev.created_at FROM activities prev
                     WHERE prev.card_id = a.card_id
                       AND prev.tipo = 'stage_changed'
                       AND prev.created_at < a.created_at
                     ORDER BY prev.created_at DESC LIMIT 1),
                    c.created_at
                )
            )) / 3600.0 AS horas_gastas
        FROM activities a
        JOIN cards c ON c.id = a.card_id
        LEFT JOIN pipeline_stages s ON s.id = (a.metadata->>'old_stage_id')::UUID
        WHERE a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start
          AND a.created_at < p_date_end
          AND c.org_id = v_org
          AND c.deleted_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND c.dono_atual_id IS NOT NULL
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
    )
    SELECT
        t.user_id,
        p.nome AS user_nome,
        COUNT(*)::BIGINT AS total_transicoes,
        -- Só conta como "cumprida" quando HOUVE SLA definido e foi respeitado
        COUNT(*) FILTER (
            WHERE t.sla_hours IS NOT NULL AND t.sla_hours > 0 AND t.horas_gastas <= t.sla_hours
        )::BIGINT AS sla_cumpridas,
        COUNT(*) FILTER (
            WHERE t.sla_hours IS NOT NULL AND t.sla_hours > 0 AND t.horas_gastas > t.sla_hours
        )::BIGINT AS sla_violadas,
        -- Compliance só faz sentido para transições com SLA configurado.
        -- Se a pessoa só passou por etapas sem SLA, retorna NULL.
        CASE
            WHEN COUNT(*) FILTER (WHERE t.sla_hours IS NOT NULL AND t.sla_hours > 0) > 0
            THEN ROUND(
                COUNT(*) FILTER (WHERE t.sla_hours IS NOT NULL AND t.sla_hours > 0 AND t.horas_gastas <= t.sla_hours)::NUMERIC
                / COUNT(*) FILTER (WHERE t.sla_hours IS NOT NULL AND t.sla_hours > 0)::NUMERIC * 100,
                1
            )
            ELSE NULL
        END AS compliance_rate,
        ROUND(AVG(t.horas_gastas)::NUMERIC, 1) AS tempo_medio_horas
    FROM transicoes t
    JOIN profiles p ON p.id = t.user_id
    GROUP BY t.user_id, p.nome
    ORDER BY compliance_rate DESC NULLS LAST, total_transicoes DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_team_sla_compliance TO authenticated;
