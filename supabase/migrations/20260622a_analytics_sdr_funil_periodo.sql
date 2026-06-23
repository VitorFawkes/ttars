-- Funil de pré-venda (SDR) por PERÍODO — Welcome Trips (e qualquer produto)
--
-- Motivação (mensagem da gestora de Trips, 2026-06-22): as 4 perguntas dela —
-- "quantos agendaram reunião / realizaram a reunião / foram qualificados / desqualificados
-- pelo SDR" — não tinham resposta correta por período:
--   - "agendaram" usava a lente "Agora" (foto = cards parados na etapa) → subcontava;
--   - "realizaram" não existia como métrica (o dado é a etapa "Apresentação Feita");
--   - "qualificados" aparecia como "taxas vendidas" — recurso DESLIGADO no Trips
--     (taxa_status='nao_aplicavel' em 100% dos cards) e SEM filtro de período (vitalício);
--   - "desqualificados" nunca foi exposto como número.
--
-- Esta migration cria 2 RPCs que contam por THROUGHPUT no período (o evento aconteceu
-- dentro do período), espelhando o motor já provado em 20260422a/b (analytics_funnel_conversion_v3):
--   1. analytics_sdr_funil_periodo        → 6 contadores (entraram..desqualificados)
--   2. analytics_sdr_funil_periodo_cards  → lista de cards de cada métrica (drill-down)
--
-- Definições (validadas read-only contra produção em 90d: 1366/137/97/57/59/263):
--   entraram          = cards criados no período
--   conectaram        = entrou na etapa "Conectado" (fase sdr) no período
--   agendaram_reuniao = entrou na etapa "Reunião Agendada" (fase sdr) no período
--   realizaram_reuniao= entrou na etapa "Apresentação Feita" (fase sdr) no período
--   qualificados      = handoff real SDR→Planner (old_stage ∈ fase sdr E new_stage ∈ fase planner)
--   desqualificados   = card_lost no período cujo metadata.stage_id ∈ fase sdr
--
-- Isolamento: SECURITY DEFINER + requesting_org_id() (workspace). Pipeline resolvido por
-- org_id + produto (nunca por slug solto — a account-mãe tem slugs colidentes; CLAUDE.md §6).
-- Reusa helpers _a_owner_ok / _a_tag_ok / _a_origem_ok.
--
-- ⚠️ Staging está defasado (cards sem org_id) → lá só valida SINTAXE. A LÓGICA valida-se
-- read-only contra PRODUÇÃO (Management API).

-- ═══ 1. analytics_sdr_funil_periodo ════════════════════════════════════════

DROP FUNCTION IF EXISTS public.analytics_sdr_funil_periodo(
    timestamptz, timestamptz, text, uuid[], text[], uuid[]
);

CREATE FUNCTION public.analytics_sdr_funil_periodo(
    p_date_start timestamptz DEFAULT (now() - interval '90 days'),
    p_date_end   timestamptz DEFAULT now(),
    p_product    text   DEFAULT NULL,
    p_owner_ids  uuid[] DEFAULT NULL,
    p_origens    text[] DEFAULT NULL,
    p_tag_ids    uuid[] DEFAULT NULL
)
RETURNS TABLE(
    entraram           bigint,
    conectaram         bigint,
    agendaram_reuniao  bigint,
    realizaram_reuniao bigint,
    qualificados       bigint,
    desqualificados    bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH
    -- Etapas do pipeline do workspace+produto (sem filtro de ativo: handoff/perda pode
    -- envolver etapa inativa, ex. "Taxa Paga"). Escopo por org_id evita slugs colidentes.
    st AS (
        SELECT s.id, s.nome, ph.slug AS phase
        FROM pipeline_stages s
        JOIN pipeline_phases ph ON ph.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id
        WHERE pip.org_id = v_org
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
    ),
    -- População: cards do workspace+produto, aplicando owner/tag/origem.
    pop AS (
        SELECT c.id, c.created_at
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, NULL::uuid, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND _a_origem_ok(c.origem, p_origens)
    ),
    -- Transições de etapa no período, só de cards da população.
    sc AS (
        SELECT a.card_id,
               (a.metadata->>'old_stage_id')::uuid AS old_id,
               (a.metadata->>'new_stage_id')::uuid AS new_id
        FROM activities a
        WHERE a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start AND a.created_at < p_date_end
          AND a.card_id IN (SELECT id FROM pop)
    ),
    -- Perdas no período, só de cards da população. stage_id = etapa onde o card morreu.
    lost AS (
        SELECT a.card_id, (a.metadata->>'stage_id')::uuid AS lost_stage_id
        FROM activities a
        WHERE a.tipo = 'card_lost'
          AND a.created_at >= p_date_start AND a.created_at < p_date_end
          AND a.card_id IN (SELECT id FROM pop)
    )
    SELECT
        (SELECT count(*) FROM pop
           WHERE pop.created_at >= p_date_start AND pop.created_at < p_date_end)::bigint,
        (SELECT count(DISTINCT sc.card_id) FROM sc
           WHERE sc.new_id IN (SELECT id FROM st WHERE phase = 'sdr' AND nome ILIKE '%conectad%'))::bigint,
        (SELECT count(DISTINCT sc.card_id) FROM sc
           WHERE sc.new_id IN (SELECT id FROM st WHERE phase = 'sdr' AND nome ILIKE '%reuni%agendad%'))::bigint,
        (SELECT count(DISTINCT sc.card_id) FROM sc
           WHERE sc.new_id IN (SELECT id FROM st WHERE phase = 'sdr' AND nome ILIKE '%apresenta%feita%'))::bigint,
        (SELECT count(DISTINCT sc.card_id) FROM sc
           WHERE sc.old_id IN (SELECT id FROM st WHERE phase = 'sdr')
             AND sc.new_id IN (SELECT id FROM st WHERE phase = 'planner'))::bigint,
        (SELECT count(DISTINCT lost.card_id) FROM lost
           WHERE lost.lost_stage_id IN (SELECT id FROM st WHERE phase = 'sdr'))::bigint;
END;
$$;

COMMENT ON FUNCTION public.analytics_sdr_funil_periodo IS
'Funil de pré-venda (SDR) por período/throughput (2026-06-22). 6 contadores: entraram, conectaram, agendaram_reuniao (etapa Reunião Agendada), realizaram_reuniao (etapa Apresentação Feita), qualificados (handoff SDR→Planner), desqualificados (card_lost com metadata.stage_id na fase sdr). Isolado por requesting_org_id()+produto.';

GRANT EXECUTE ON FUNCTION public.analytics_sdr_funil_periodo TO authenticated;


-- ═══ 2. analytics_sdr_funil_periodo_cards (drill-down de cada métrica) ══════
-- Mesma semântica/CTEs; p_metric escolhe o conjunto de cards. Shape idêntico ao
-- analytics_drill_down_cards (consumido pelo drawer via presetLoader).

DROP FUNCTION IF EXISTS public.analytics_sdr_funil_periodo_cards(
    text, timestamptz, timestamptz, text, uuid[], text[], uuid[], integer, integer
);

CREATE FUNCTION public.analytics_sdr_funil_periodo_cards(
    p_metric     text,
    p_date_start timestamptz DEFAULT (now() - interval '90 days'),
    p_date_end   timestamptz DEFAULT now(),
    p_product    text   DEFAULT NULL,
    p_owner_ids  uuid[] DEFAULT NULL,
    p_origens    text[] DEFAULT NULL,
    p_tag_ids    uuid[] DEFAULT NULL,
    p_limit      integer DEFAULT 2000,
    p_offset     integer DEFAULT 0
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
AS $$
DECLARE
    v_org UUID := requesting_org_id();
BEGIN
    RETURN QUERY
    WITH
    st AS (
        SELECT s.id, s.nome, ph.slug AS phase
        FROM pipeline_stages s
        JOIN pipeline_phases ph ON ph.id = s.phase_id
        JOIN pipelines pip ON pip.id = s.pipeline_id
        WHERE pip.org_id = v_org
          AND (p_product IS NULL OR pip.produto::TEXT = p_product)
    ),
    pop AS (
        SELECT c.id, c.created_at
        FROM cards c
        WHERE c.org_id = v_org
          AND c.deleted_at IS NULL AND c.archived_at IS NULL
          AND COALESCE(c.card_type, 'standard') != 'sub_card'
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, NULL::uuid, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND _a_origem_ok(c.origem, p_origens)
    ),
    -- Etapa-alvo para as métricas de entrada em etapa (conectaram/agendaram/realizaram).
    -- Coluna nomeada stage_id (não 'id') para não colidir com a coluna de saída id da função.
    target AS (
        SELECT st.id AS stage_id FROM st
        WHERE (p_metric = 'conectaram'  AND st.phase = 'sdr' AND st.nome ILIKE '%conectad%')
           OR (p_metric = 'agendaram'   AND st.phase = 'sdr' AND st.nome ILIKE '%reuni%agendad%')
           OR (p_metric = 'realizaram'  AND st.phase = 'sdr' AND st.nome ILIKE '%apresenta%feita%')
    ),
    ids AS (
        -- entraram: criados no período
        SELECT pop.id AS card_id FROM pop
        WHERE p_metric = 'entraram'
          AND pop.created_at >= p_date_start AND pop.created_at < p_date_end
        UNION
        -- conectaram/agendaram/realizaram: entrou na etapa-alvo no período
        SELECT DISTINCT a.card_id FROM activities a
        WHERE p_metric IN ('conectaram', 'agendaram', 'realizaram')
          AND a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start AND a.created_at < p_date_end
          AND (a.metadata->>'new_stage_id')::uuid IN (SELECT target.stage_id FROM target)
          AND a.card_id IN (SELECT pop.id FROM pop)
        UNION
        -- qualificados: handoff SDR→Planner no período
        SELECT DISTINCT a.card_id FROM activities a
        WHERE p_metric = 'qualificados'
          AND a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start AND a.created_at < p_date_end
          AND (a.metadata->>'old_stage_id')::uuid IN (SELECT st.id FROM st WHERE st.phase = 'sdr')
          AND (a.metadata->>'new_stage_id')::uuid IN (SELECT st.id FROM st WHERE st.phase = 'planner')
          AND a.card_id IN (SELECT pop.id FROM pop)
        UNION
        -- desqualificados: card_lost no período com stage_id na fase sdr
        SELECT DISTINCT a.card_id FROM activities a
        WHERE p_metric = 'desqualificados'
          AND a.tipo = 'card_lost'
          AND a.created_at >= p_date_start AND a.created_at < p_date_end
          AND (a.metadata->>'stage_id')::uuid IN (SELECT st.id FROM st WHERE st.phase = 'sdr')
          AND a.card_id IN (SELECT pop.id FROM pop)
    )
    SELECT
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
    WHERE c.id IN (SELECT ids.card_id FROM ids)
    ORDER BY c.created_at DESC NULLS LAST
    LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.analytics_sdr_funil_periodo_cards IS
'Drill-down do funil de pré-venda por período. p_metric ∈ {entraram, conectaram, agendaram, realizaram, qualificados, desqualificados}. Mesma semântica de analytics_sdr_funil_periodo; shape = analytics_drill_down_cards.';

GRANT EXECUTE ON FUNCTION public.analytics_sdr_funil_periodo_cards TO authenticated;
