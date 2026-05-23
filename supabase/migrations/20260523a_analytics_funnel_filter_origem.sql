-- Adiciona filtro de origem (cards.origem) nas 4 RPCs principais do Funil.
-- Permite responder no analytics: "qual origem está mais lucrativa?"
-- (manual = Planner direto, active_campaign = AC, whatsapp = Julia, indicacao, mkt, carteira_*, sorrento, weddings).
--
-- AUDITORIA (memory/feedback_function_rebase_cuidado.md):
-- Antes de recriar, confirmei que copiei a versão MAIS RECENTE de cada função
-- e preservei todas as correções incrementais anteriores:
--
-- analytics_funnel_conversion → 20260420k (org isolation v_org + pip.org_id = v_org)
--   preserva: 20260305 (product isolation), 20260306 (cast enum), 20260313 (sub_card filter)
--
-- analytics_funnel_by_owner → 20260420k (org isolation)
--   preserva: 20260303 (valor_total/receita_total/p_tag_ids), 20260305, 20260306, 20260313
--
-- analytics_funnel_velocity → 20260420m (cap 365d em transicoes + atuais)
--   preserva: 20260420f (foundation)
--
-- analytics_loss_reasons → 20260422a (v3 com motivo_perda_comentario + modes ganho_*)
--   versão mais recente, sem patches incrementais posteriores
--
-- Mudança nesta migration: param novo p_origens TEXT[] DEFAULT NULL em cada uma + filtro
-- AND (p_origens IS NULL OR c.origem::TEXT = ANY(p_origens))
-- aplicado em cada FROM cards (preserva backward compat: omitir = sem filtro).

-- ═══ 0. Drop TODAS overloads antigas (mudança de assinatura adiciona p_origens) ═══
DO $cleanup$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT n.nspname AS schema, p.proname AS name,
               pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'analytics_funnel_conversion',
              'analytics_funnel_by_owner',
              'analytics_funnel_velocity',
              'analytics_loss_reasons'
          )
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.schema) || '.' || quote_ident(r.name) || '(' || r.args || ') CASCADE';
    END LOOP;
END $cleanup$;

-- ═══ 1. analytics_funnel_conversion ═════════════════════════

CREATE OR REPLACE FUNCTION public.analytics_funnel_conversion(
    p_date_start timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end timestamptz DEFAULT now(),
    p_product text DEFAULT NULL,
    p_mode text DEFAULT 'entries',
    p_stage_id uuid DEFAULT NULL,
    p_owner_id uuid DEFAULT NULL,
    p_owner_ids uuid[] DEFAULT NULL,
    p_tag_ids uuid[] DEFAULT NULL,
    p_origens text[] DEFAULT NULL
)
RETURNS TABLE(stage_id uuid, stage_nome text, phase_slug text, ordem integer,
              current_count bigint, total_valor numeric, receita_total numeric,
              avg_days_in_stage numeric, p75_days_in_stage numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_has_origens BOOLEAN := p_origens IS NOT NULL AND array_length(p_origens, 1) > 0;
BEGIN
    RETURN QUERY
    SELECT
        s.id AS stage_id,
        s.nome AS stage_nome,
        pp.slug AS phase_slug,
        s.ordem,
        COUNT(c.id) AS current_count,
        COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado, 0)), 0) AS total_valor,
        COALESCE(SUM(c.receita), 0) AS receita_total,
        COALESCE(AVG(EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400.0)::NUMERIC, 0) AS avg_days_in_stage,
        COALESCE(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (NOW() - c.stage_entered_at)) / 86400.0)::NUMERIC, 0) AS p75_days_in_stage
    FROM pipeline_stages s
    JOIN pipeline_phases pp ON pp.id = s.phase_id
    JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
    LEFT JOIN cards c ON c.pipeline_stage_id = s.id
        AND c.org_id = v_org
        AND c.status_comercial = 'aberto'
        AND c.deleted_at IS NULL
        AND c.archived_at IS NULL
        AND COALESCE(c.card_type, 'standard') != 'sub_card'
        AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
        AND _a_tag_ok(c.id, p_tag_ids)
        AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
    WHERE (p_product IS NULL OR pip.produto::TEXT = p_product)
    GROUP BY s.id, s.nome, pp.slug, s.ordem, pp.order_index
    ORDER BY pp.order_index, s.ordem;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_funnel_conversion TO authenticated;

-- ═══ 2. analytics_funnel_by_owner ═══════════════════════════

CREATE OR REPLACE FUNCTION public.analytics_funnel_by_owner(
    p_date_start timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end timestamptz DEFAULT now(),
    p_product text DEFAULT NULL,
    p_mode text DEFAULT 'entries',
    p_stage_id uuid DEFAULT NULL,
    p_owner_id uuid DEFAULT NULL,
    p_owner_ids uuid[] DEFAULT NULL,
    p_tag_ids uuid[] DEFAULT NULL,
    p_origens text[] DEFAULT NULL
)
RETURNS TABLE(stage_id uuid, stage_nome text, fase text, ordem integer,
              owner_id uuid, owner_name text, card_count bigint,
              valor_total numeric, receita_total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_org UUID := requesting_org_id();
    v_has_origens BOOLEAN := p_origens IS NOT NULL AND array_length(p_origens, 1) > 0;
BEGIN
    IF p_mode = 'entries' OR (p_mode = 'stage_entry' AND p_stage_id IS NULL) THEN
        RETURN QUERY
        WITH transition_entries AS (
            SELECT
                (a.metadata->>'new_stage_id')::UUID AS entered_stage_id,
                a.card_id
            FROM activities a
            JOIN cards c ON c.id = a.card_id
            WHERE a.tipo = 'stage_changed'
              AND a.created_at >= p_date_start AND a.created_at < p_date_end
              AND c.org_id = v_org
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
              AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
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
              AND c.org_id = v_org
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
              AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
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
            COUNT(ae.card_id)::BIGINT                   AS card_count,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS valor_total,
            COALESCE(SUM(c.receita), 0)::NUMERIC        AS receita_total
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN profiles p ON p.id = c.dono_atual_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index, c.dono_atual_id, p.nome
        ORDER BY pp.order_index, s.ordem, p.nome NULLS LAST;

    ELSE
        RETURN QUERY
        WITH population AS (
            SELECT c.id AS card_id
            FROM cards c
            WHERE c.org_id = v_org
              AND c.deleted_at IS NULL AND c.archived_at IS NULL
              AND (p_product IS NULL OR c.produto::TEXT = p_product)
              AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
              AND _a_tag_ok(c.id, p_tag_ids)
              AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
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
            COUNT(ae.card_id)::BIGINT                   AS card_count,
            COALESCE(SUM(COALESCE(c.valor_final, c.valor_estimado)), 0)::NUMERIC AS valor_total,
            COALESCE(SUM(c.receita), 0)::NUMERIC        AS receita_total
        FROM pipeline_stages s
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id AND pip.org_id = v_org
        LEFT JOIN all_entries ae ON ae.entered_stage_id = s.id
        LEFT JOIN cards c ON c.id = ae.card_id
        LEFT JOIN profiles p ON p.id = c.dono_atual_id
        WHERE s.ativo = true
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
        GROUP BY s.id, s.nome, s.fase, s.ordem, pp.order_index, c.dono_atual_id, p.nome
        ORDER BY pp.order_index, s.ordem, p.nome NULLS LAST;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_funnel_by_owner TO authenticated;

-- ═══ 3. analytics_funnel_velocity ═══════════════════════════

CREATE FUNCTION analytics_funnel_velocity(
    p_date_start TIMESTAMPTZ DEFAULT (NOW() - INTERVAL '90 days'),
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_owner_ids  UUID[] DEFAULT NULL,
    p_tag_ids    UUID[] DEFAULT NULL,
    p_origens    TEXT[] DEFAULT NULL
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
    v_has_origens BOOLEAN := p_origens IS NOT NULL AND array_length(p_origens, 1) > 0;
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
          AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
    ),
    atuais AS (
        SELECT
            c.pipeline_stage_id AS stage_id,
            c.id AS card_id,
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
          AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
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

-- ═══ 4. analytics_loss_reasons ══════════════════════════════

CREATE FUNCTION public.analytics_loss_reasons(
    p_date_start timestamptz DEFAULT '2020-01-01 00:00:00+00',
    p_date_end   timestamptz DEFAULT now(),
    p_product    text   DEFAULT NULL,
    p_mode       text   DEFAULT 'entries',
    p_stage_id   uuid   DEFAULT NULL,
    p_owner_id   uuid   DEFAULT NULL,
    p_owner_ids  uuid[] DEFAULT NULL,
    p_tag_ids    uuid[] DEFAULT NULL,
    p_origens    text[] DEFAULT NULL
)
RETURNS TABLE(motivo text, count bigint, percentage numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org      UUID   := requesting_org_id();
    v_has_origens BOOLEAN := p_origens IS NOT NULL AND array_length(p_origens, 1) > 0;
    total_lost BIGINT;
BEGIN
    SELECT COUNT(*) INTO total_lost
    FROM cards c
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial = 'perdido'
      AND COALESCE(c.card_type, 'standard') != 'sub_card'
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
      AND _a_tag_ok(c.id, p_tag_ids)
      AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
      AND CASE
          WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (
                  SELECT card_id FROM activities a
                  WHERE a.tipo = 'stage_changed'
                    AND (a.metadata->>'new_stage_id')::UUID = p_stage_id
                    AND a.created_at >= p_date_start AND a.created_at < p_date_end
              )
          WHEN p_mode = 'ganho_sdr' THEN
              c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
          WHEN p_mode = 'ganho_planner' THEN
              c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
          WHEN p_mode = 'ganho_total' THEN
              c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
          ELSE
              COALESCE(c.data_fechamento, c.updated_at) >= p_date_start
              AND COALESCE(c.data_fechamento, c.updated_at) < p_date_end
      END;

    RETURN QUERY
    SELECT
        COALESCE(NULLIF(TRIM(c.motivo_perda_comentario), ''), mp.nome, 'Sem motivo informado')::TEXT AS motivo,
        COUNT(*)::BIGINT AS count,
        CASE WHEN total_lost > 0
             THEN ROUND((COUNT(*)::NUMERIC / total_lost) * 100, 1)
             ELSE 0 END AS percentage
    FROM cards c
    LEFT JOIN motivos_perda mp ON mp.id = c.motivo_perda_id
    WHERE c.org_id = v_org
      AND c.deleted_at IS NULL AND c.archived_at IS NULL
      AND c.status_comercial = 'perdido'
      AND COALESCE(c.card_type, 'standard') != 'sub_card'
      AND (p_product IS NULL OR c.produto::TEXT = p_product)
      AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
      AND _a_tag_ok(c.id, p_tag_ids)
      AND (NOT v_has_origens OR c.origem::TEXT = ANY(p_origens))
      AND CASE
          WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (
                  SELECT card_id FROM activities a
                  WHERE a.tipo = 'stage_changed'
                    AND (a.metadata->>'new_stage_id')::UUID = p_stage_id
                    AND a.created_at >= p_date_start AND a.created_at < p_date_end
              )
          WHEN p_mode = 'ganho_sdr' THEN
              c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
          WHEN p_mode = 'ganho_planner' THEN
              c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
          WHEN p_mode = 'ganho_total' THEN
              c.ganho_pos = true AND c.ganho_pos_at >= p_date_start AND c.ganho_pos_at < p_date_end
          ELSE
              COALESCE(c.data_fechamento, c.updated_at) >= p_date_start
              AND COALESCE(c.data_fechamento, c.updated_at) < p_date_end
      END
    GROUP BY 1
    ORDER BY count DESC
    LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_loss_reasons TO authenticated;
