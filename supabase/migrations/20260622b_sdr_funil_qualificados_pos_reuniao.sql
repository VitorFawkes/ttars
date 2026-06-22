-- Correção de VENDAS no funil de pré-venda (SDR) — "qualificados" só pós-reunião.
--
-- Achado (validação contra prod, 2026-06-22): a definição original de "qualificados"
-- (qualquer transição old_stage∈sdr → new_stage∈planner no período) contava LIXO de vendas:
--   - cards de curso "Imersão Reggio Emilia" (25) movidos em massa "Novo Lead → Oportunidade"
--   - cards perdidos antigos migrados em bloco direto do topo do funil pro Planner
-- Resultado: 52 "qualificados", dos quais só ~14 eram handoff real pós-reunião.
--
-- A própria definição do Vitor é "DEPOIS da reunião o lead vira oportunidade". Logo, o handoff
-- que conta é o que SAI de uma etapa pós-reunião (Reunião Agendada ou Apresentação Feita),
-- não do topo (Novo Lead / Tentativa de Contato). Isso zera o lixo e deixa o funil monotônico
-- (entraram ≥ agendaram ≥ realizaram ≥ qualificados).
--
-- Atualiza analytics_sdr_funil_periodo (contador) e analytics_sdr_funil_periodo_cards (drill).
-- Só muda a regra de "qualificados"; demais métricas inalteradas.

-- ═══ 1. analytics_sdr_funil_periodo ════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_sdr_funil_periodo(
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
    sc AS (
        SELECT a.card_id,
               (a.metadata->>'old_stage_id')::uuid AS old_id,
               (a.metadata->>'new_stage_id')::uuid AS new_id
        FROM activities a
        WHERE a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start AND a.created_at < p_date_end
          AND a.card_id IN (SELECT id FROM pop)
    ),
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
        -- QUALIFICADOS: handoff pós-reunião → Planner (exclui bulk Novo Lead/Tentativa → Planner)
        (SELECT count(DISTINCT sc.card_id) FROM sc
           WHERE sc.old_id IN (SELECT id FROM st WHERE phase = 'sdr'
                                 AND (nome ILIKE '%reuni%agendad%' OR nome ILIKE '%apresenta%feita%'))
             AND sc.new_id IN (SELECT id FROM st WHERE phase = 'planner'))::bigint,
        (SELECT count(DISTINCT lost.card_id) FROM lost
           WHERE lost.lost_stage_id IN (SELECT id FROM st WHERE phase = 'sdr'))::bigint;
END;
$$;

COMMENT ON FUNCTION public.analytics_sdr_funil_periodo IS
'Funil de pré-venda (SDR) por período/throughput. qualificados = handoff PÓS-reunião (old_stage Reunião Agendada/Apresentação Feita → Planner), evita bulk Novo Lead→Planner. Isolado por requesting_org_id()+produto. v2 2026-06-22b.';

-- ═══ 2. analytics_sdr_funil_periodo_cards ══════════════════════════════════
CREATE OR REPLACE FUNCTION public.analytics_sdr_funil_periodo_cards(
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
    target AS (
        SELECT st.id AS stage_id FROM st
        WHERE (p_metric = 'conectaram'  AND st.phase = 'sdr' AND st.nome ILIKE '%conectad%')
           OR (p_metric = 'agendaram'   AND st.phase = 'sdr' AND st.nome ILIKE '%reuni%agendad%')
           OR (p_metric = 'realizaram'  AND st.phase = 'sdr' AND st.nome ILIKE '%apresenta%feita%')
    ),
    ids AS (
        SELECT pop.id AS card_id FROM pop
        WHERE p_metric = 'entraram'
          AND pop.created_at >= p_date_start AND pop.created_at < p_date_end
        UNION
        SELECT DISTINCT a.card_id FROM activities a
        WHERE p_metric IN ('conectaram', 'agendaram', 'realizaram')
          AND a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start AND a.created_at < p_date_end
          AND (a.metadata->>'new_stage_id')::uuid IN (SELECT target.stage_id FROM target)
          AND a.card_id IN (SELECT pop.id FROM pop)
        UNION
        -- QUALIFICADOS: handoff pós-reunião → Planner
        SELECT DISTINCT a.card_id FROM activities a
        WHERE p_metric = 'qualificados'
          AND a.tipo = 'stage_changed'
          AND a.created_at >= p_date_start AND a.created_at < p_date_end
          AND (a.metadata->>'old_stage_id')::uuid IN (SELECT st.id FROM st WHERE st.phase = 'sdr'
                                AND (st.nome ILIKE '%reuni%agendad%' OR st.nome ILIKE '%apresenta%feita%'))
          AND (a.metadata->>'new_stage_id')::uuid IN (SELECT st.id FROM st WHERE st.phase = 'planner')
          AND a.card_id IN (SELECT pop.id FROM pop)
        UNION
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
'Drill-down do funil de pré-venda por período. qualificados = handoff pós-reunião (ver analytics_sdr_funil_periodo). v2 2026-06-22b.';
