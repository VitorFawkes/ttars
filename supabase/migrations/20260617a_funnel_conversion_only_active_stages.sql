-- analytics_funnel_conversion — esconder etapas DESATIVADAS (ativo = false) do funil "agora".
--
-- BUG (reportado pelo Vitor): a "Carteira por etapa do Planner" mostrava etapas que não
-- existem mais / não estão visíveis (ex: "Aguardando Briefing", "Viagem Confirmada (Ganho)",
-- ambas ativo=false). Causa: analytics_funnel_conversion (lente 'now') era a ÚNICA função do
-- funil sem o filtro `s.ativo = true` — as irmãs já filtram:
--   analytics_funnel_by_owner      → WHERE s.ativo = true  (20260523a)
--   analytics_funnel_velocity      → WHERE s.ativo = true  (20260523a)
--   analytics_funnel_conversion_v3 → WHERE s.ativo = true  (20260523b)
-- Então isto só repõe a consistência que faltava nesta função.
--
-- Impacto medido em prod (Welcome Trips): só 4 cards abertos estão em etapas desativadas no
-- pipeline inteiro (3 em "Aguardando Briefing", 1 numa etapa SDR), então o efeito numérico é
-- mínimo — apenas para de listar as etapas mortas em TODAS as telas do funil (Funil, SDR,
-- Planner, Corp).
--
-- AUDITORIA DE REBASE (CLAUDE.md §TOP 5 #5 / feedback_function_rebase_cuidado.md):
-- corpo é cópia EXATA da versão mais recente (20260523a). Reli as 5 migrations anteriores e
-- confirmei que TODAS as correções seguem presentes:
--   • 20260305 product isolation  → (p_product IS NULL OR pip.produto::TEXT = p_product)  ✓
--   • 20260306 enum cast          → pip.produto::TEXT                                      ✓
--   • 20260313 sub_card filter     → COALESCE(c.card_type,'standard') != 'sub_card'        ✓
--   • 20260420k org isolation      → v_org / pip.org_id = v_org / c.org_id = v_org         ✓
--   • 20260523a filtro origem      → v_has_origens + c.origem::TEXT = ANY(p_origens)       ✓
-- Única mudança vs 20260523a: adiciona `s.ativo = true` no WHERE.

-- Dropa TODAS as overloads de analytics_funnel_conversion (staging pode estar defasado com
-- assinatura diferente). Mesmo padrão do cleanup de 20260523a.
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
          AND p.proname = 'analytics_funnel_conversion'
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || quote_ident(r.schema) || '.' || quote_ident(r.name) || '(' || r.args || ') CASCADE';
    END LOOP;
END $cleanup$;

CREATE FUNCTION public.analytics_funnel_conversion(
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
    WHERE s.ativo = true                                          -- ✨ FIX: só etapas ativas (igual às outras RPCs do funil)
      AND (p_product IS NULL OR pip.produto::TEXT = p_product)
    GROUP BY s.id, s.nome, pp.slug, s.ordem, pp.order_index
    ORDER BY pp.order_index, s.ordem;
END;
$$;

GRANT EXECUTE ON FUNCTION analytics_funnel_conversion TO authenticated;
