-- analytics_cards_travados: detecta cards bloqueados por quality gate.
-- Sistema enforce orcamento + data_prevista_fechamento em "Proposta Enviada" (Planner)
-- e em toda fase pós-venda. Se o consultor tentar mover sem preencher, o card fica
-- preso. Esta função lista quais cards estão presos e há quanto tempo.

CREATE OR REPLACE FUNCTION public.analytics_cards_travados(
    p_owner_ids UUID[] DEFAULT NULL,
    p_limit     INT    DEFAULT 100
)
RETURNS TABLE(
    card_id           UUID,
    titulo            TEXT,
    dono_atual_nome   TEXT,
    stage_atual_nome  TEXT,
    phase_slug        TEXT,
    dias_travado      INT,
    falta_orcamento   BOOLEAN,
    falta_data_prev   BOOLEAN,
    valor_estimado    NUMERIC,
    total_count       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH cards_em_risco AS (
        -- Cards em "Proposta Enviada" (Planner) ou qualquer etapa de pós-venda
        -- onde orcamento ou data_prevista_fechamento estão vazios
        SELECT
            c.id,
            c.titulo,
            c.dono_atual_id,
            c.pipeline_stage_id,
            c.valor_estimado,
            c.stage_entered_at,
            s.nome AS stage_nome,
            pp.slug AS phase_slug,
            -- "vazio" = NULL ou string vazia em JSONB
            (c.produto_data->>'orcamento' IS NULL
             OR TRIM(c.produto_data->>'orcamento') = ''
             OR c.produto_data->>'orcamento' = '0') AS sem_orcamento,
            (c.produto_data->>'data_prevista_fechamento' IS NULL
             OR TRIM(c.produto_data->>'data_prevista_fechamento') = '') AS sem_data_prev
        FROM cards c
        JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        JOIN pipeline_phases pp ON pp.id = s.phase_id
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial NOT IN ('ganho', 'perdido')
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND _a_owner_ok(c.dono_atual_id, NULL, p_owner_ids)
          AND (
              -- Etapa de Proposta (gate ativo aqui)
              s.milestone_key = 'proposta'
              OR pp.slug = 'pos_venda'
          )
    ),
    travados AS (
        SELECT *
        FROM cards_em_risco
        WHERE sem_orcamento OR sem_data_prev
    ),
    totals AS (
        SELECT COUNT(*)::BIGINT AS t FROM travados
    ),
    ordenados AS (
        SELECT
            t.id,
            t.titulo,
            t.dono_atual_id,
            t.stage_nome,
            t.phase_slug,
            t.valor_estimado,
            t.sem_orcamento,
            t.sem_data_prev,
            GREATEST(EXTRACT(DAY FROM NOW() - t.stage_entered_at)::INT, 0) AS dias
        FROM travados t
        ORDER BY t.stage_entered_at ASC NULLS LAST
        LIMIT p_limit
    )
    SELECT
        o.id AS card_id,
        o.titulo,
        prof.nome AS dono_atual_nome,
        o.stage_nome AS stage_atual_nome,
        o.phase_slug,
        o.dias AS dias_travado,
        o.sem_orcamento AS falta_orcamento,
        o.sem_data_prev AS falta_data_prev,
        o.valor_estimado,
        (SELECT t FROM totals) AS total_count
    FROM ordenados o
    LEFT JOIN profiles prof ON prof.id = o.dono_atual_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_cards_travados TO authenticated;

COMMENT ON FUNCTION public.analytics_cards_travados IS
'Cards bloqueados por quality gate (orcamento e/ou data_prevista_fechamento vazios em Proposta Enviada ou Pós-venda). Sinaliza gargalo de preenchimento — consultor não consegue avançar.';
