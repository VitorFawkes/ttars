-- ============================================================================
-- FIX: dois bugs latentes deixados pelo batch 20260504* de hoje
-- Date: 2026-05-04
--
-- (1) analytics_overview_kpis_v2 ficou em overload.
--     Migration 20260423d criou com 13 params (assinatura usada pelo frontend
--     atual via getRpcFiltersV1). Migration 20260504g recriou com 8 params,
--     mas o Postgres MANTEVE a antiga — virou overload. Resultado:
--       - chamadas com 10 params (frontend) resolvem para a antiga,
--         então a melhoria do skip_pos_venda nunca está em efeito.
--       - chamadas com poucos params dão PGRST203 ("could not choose
--         the best candidate function").
--     Fix: drop ambas e recria UMA versão com 13 params (compatível com
--     o frontend) e a lógica nova de 20260504g.
--
-- (2) process_cadence_entry_on_card_field_change perdeu semântica original.
--     Migration 20260504f recriou a função para early-return em
--     skip_pos_venda. Junto, mudou:
--       - event_config->>'field' → event_config->>'field_key' (UI grava 'field')
--       - removeu filtro applicable_stage_ids (regra existia em 20260419d)
--       - removeu filtro to_value (regra existia em 20260419d)
--       - mudou event_data: 'field'→'field_key' e removeu 'stage_id'
--     Hoje sem impacto (zero triggers field_changed em prod), mas latent —
--     trigger criado pela UI nunca dispararia.
--     Fix: restaurar semântica de 20260420a + manter early-return de skip
--     + manter array fix do 20260504m.
-- ============================================================================

BEGIN;

-- ─── (1) analytics_overview_kpis_v2: drop overloads e recria 13-arg ──────────

DROP FUNCTION IF EXISTS public.analytics_overview_kpis_v2(
    TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID[], UUID[]
);
DROP FUNCTION IF EXISTS public.analytics_overview_kpis_v2(
    TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID[], UUID[],
    TEXT[], TEXT[], TEXT, TEXT[], TEXT
);

CREATE FUNCTION public.analytics_overview_kpis_v2(
    p_date_start TIMESTAMPTZ DEFAULT '2020-01-01 00:00:00+00'::TIMESTAMPTZ,
    p_date_end   TIMESTAMPTZ DEFAULT NOW(),
    p_product TEXT DEFAULT NULL,
    p_mode TEXT DEFAULT 'entries',
    p_stage_id UUID DEFAULT NULL,
    p_owner_id UUID DEFAULT NULL,
    p_owner_ids UUID[] DEFAULT NULL,
    p_tag_ids UUID[] DEFAULT NULL,
    p_origem TEXT[] DEFAULT NULL,
    p_phase_slugs TEXT[] DEFAULT NULL,
    p_lead_entry_path TEXT DEFAULT NULL,
    p_destinos TEXT[] DEFAULT NULL,
    p_owner_context TEXT DEFAULT 'dono'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
BEGIN
    WITH leads_pool AS (
        SELECT c.id, c.pipeline_stage_id, c.status_comercial,
               c.valor_final, c.receita, c.data_fechamento, c.created_at,
               c.ganho_planner
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND CASE
            WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
            WHEN p_mode = 'ganho_sdr' THEN
              c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
            WHEN p_mode = 'ganho_planner' THEN
              c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
            WHEN p_mode = 'ganho_total' THEN
              c.status_comercial = 'ganho' AND c.data_fechamento IS NOT NULL
              AND c.data_fechamento >= p_date_start::DATE AND c.data_fechamento < (p_date_end + interval '1 day')::DATE
            ELSE
              c.created_at >= p_date_start AND c.created_at < p_date_end
          END
    ),
    outcomes_pool AS (
        SELECT c.id, c.status_comercial, c.valor_final, c.receita,
               c.data_fechamento, c.created_at
        FROM cards c
        WHERE c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND c.status_comercial IN ('ganho', 'perdido')
          AND (p_product IS NULL OR c.produto::TEXT = p_product)
          AND _a_owner_ok(c.dono_atual_id, p_owner_id, p_owner_ids)
          AND _a_tag_ok(c.id, p_tag_ids)
          AND CASE
            WHEN p_mode = 'stage_entry' AND p_stage_id IS NOT NULL THEN
              c.id IN (SELECT card_id FROM get_card_ids_by_stage_entry(p_stage_id, p_date_start, p_date_end, p_product))
            WHEN p_mode = 'ganho_sdr' THEN
              c.ganho_sdr = true AND c.ganho_sdr_at >= p_date_start AND c.ganho_sdr_at < p_date_end
            WHEN p_mode = 'ganho_planner' THEN
              c.ganho_planner = true AND c.ganho_planner_at >= p_date_start AND c.ganho_planner_at < p_date_end
            WHEN p_mode = 'ganho_total' THEN
              c.status_comercial = 'ganho' AND c.data_fechamento IS NOT NULL
              AND c.data_fechamento >= p_date_start::DATE AND c.data_fechamento < (p_date_end + interval '1 day')::DATE
            ELSE
              c.created_at >= p_date_start AND c.created_at < p_date_end
          END
    )
    SELECT json_build_object(
        'total_leads', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool),
        'total_won', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'total_lost', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'perdido'),
        'total_open', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool WHERE status_comercial NOT IN ('ganho', 'perdido')),
        'conversao_venda_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0
            THEN ROUND(
                (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho')::NUMERIC
                / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END,
        'receita_total', (SELECT COALESCE(SUM(valor_final), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'margem_total', (SELECT COALESCE(SUM(receita), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'ticket_medio', CASE
            WHEN (SELECT COUNT(*) FROM outcomes_pool WHERE status_comercial = 'ganho') > 0
            THEN (SELECT ROUND(SUM(valor_final) / COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho')
            ELSE 0
        END,
        'ciclo_medio_dias', (
            SELECT COALESCE(ROUND(AVG(
                EXTRACT(EPOCH FROM (o.data_fechamento::TIMESTAMPTZ - o.created_at)) / 86400
            ), 1), 0)
            FROM outcomes_pool o
            WHERE o.status_comercial = 'ganho'
              AND o.data_fechamento IS NOT NULL
              AND o.data_fechamento::TIMESTAMPTZ > o.created_at
        ),
        'viagens_vendidas', (SELECT COALESCE(COUNT(*), 0) FROM outcomes_pool WHERE status_comercial = 'ganho'),
        'ganho_planner_count', (SELECT COALESCE(COUNT(*), 0) FROM leads_pool WHERE ganho_planner = true OR status_comercial = 'ganho'),
        'ganho_planner_rate', CASE
            WHEN (SELECT COUNT(*) FROM leads_pool) > 0
            THEN ROUND(
                (SELECT COUNT(*) FROM leads_pool WHERE ganho_planner = true OR status_comercial = 'ganho')::NUMERIC
                / (SELECT COUNT(*) FROM leads_pool)::NUMERIC * 100, 1)
            ELSE 0
        END
    ) INTO result;

    RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_overview_kpis_v2(
    TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, UUID, UUID, UUID[], UUID[],
    TEXT[], TEXT[], TEXT, TEXT[], TEXT
) TO authenticated, anon, service_role;

-- ─── (2) process_cadence_entry_on_card_field_change: semântica original ────

CREATE OR REPLACE FUNCTION process_cadence_entry_on_card_field_change()
RETURNS TRIGGER AS $fn$
DECLARE
    v_trigger RECORD;
    v_card_pipeline_id UUID;
    v_field TEXT;
    v_old_value TEXT;
    v_new_value TEXT;
    v_pending_count INT;
    v_changed_fields TEXT[];
BEGIN
    IF TG_OP <> 'UPDATE' THEN RETURN NEW; END IF;

    -- Cards skip_pos_venda não disparam cadências/automações
    IF COALESCE(NEW.skip_pos_venda, false) = true THEN
        RETURN NEW;
    END IF;

    v_changed_fields := ARRAY[]::TEXT[];
    IF NEW.status_comercial IS DISTINCT FROM OLD.status_comercial THEN v_changed_fields := v_changed_fields || ARRAY['status_comercial']::TEXT[]; END IF;
    IF NEW.valor_final IS DISTINCT FROM OLD.valor_final THEN v_changed_fields := v_changed_fields || ARRAY['valor_final']::TEXT[]; END IF;
    IF NEW.valor_estimado IS DISTINCT FROM OLD.valor_estimado THEN v_changed_fields := v_changed_fields || ARRAY['valor_estimado']::TEXT[]; END IF;
    IF NEW.dono_atual_id IS DISTINCT FROM OLD.dono_atual_id THEN v_changed_fields := v_changed_fields || ARRAY['dono_atual_id']::TEXT[]; END IF;
    IF NEW.prioridade IS DISTINCT FROM OLD.prioridade THEN v_changed_fields := v_changed_fields || ARRAY['prioridade']::TEXT[]; END IF;
    IF NEW.pronto_para_contrato IS DISTINCT FROM OLD.pronto_para_contrato THEN v_changed_fields := v_changed_fields || ARRAY['pronto_para_contrato']::TEXT[]; END IF;
    IF NEW.taxa_status IS DISTINCT FROM OLD.taxa_status THEN v_changed_fields := v_changed_fields || ARRAY['taxa_status']::TEXT[]; END IF;
    IF NEW.data_viagem_inicio IS DISTINCT FROM OLD.data_viagem_inicio THEN v_changed_fields := v_changed_fields || ARRAY['data_viagem_inicio']::TEXT[]; END IF;

    IF array_length(v_changed_fields, 1) IS NULL THEN RETURN NEW; END IF;

    SELECT pipeline_id INTO v_card_pipeline_id FROM pipeline_stages WHERE id = NEW.pipeline_stage_id;

    FOREACH v_field IN ARRAY v_changed_fields LOOP
        v_old_value := CASE v_field
            WHEN 'status_comercial' THEN OLD.status_comercial::TEXT
            WHEN 'valor_final' THEN OLD.valor_final::TEXT
            WHEN 'valor_estimado' THEN OLD.valor_estimado::TEXT
            WHEN 'dono_atual_id' THEN OLD.dono_atual_id::TEXT
            WHEN 'prioridade' THEN OLD.prioridade::TEXT
            WHEN 'pronto_para_contrato' THEN OLD.pronto_para_contrato::TEXT
            WHEN 'taxa_status' THEN OLD.taxa_status::TEXT
            WHEN 'data_viagem_inicio' THEN OLD.data_viagem_inicio::TEXT
        END;
        v_new_value := CASE v_field
            WHEN 'status_comercial' THEN NEW.status_comercial::TEXT
            WHEN 'valor_final' THEN NEW.valor_final::TEXT
            WHEN 'valor_estimado' THEN NEW.valor_estimado::TEXT
            WHEN 'dono_atual_id' THEN NEW.dono_atual_id::TEXT
            WHEN 'prioridade' THEN NEW.prioridade::TEXT
            WHEN 'pronto_para_contrato' THEN NEW.pronto_para_contrato::TEXT
            WHEN 'taxa_status' THEN NEW.taxa_status::TEXT
            WHEN 'data_viagem_inicio' THEN NEW.data_viagem_inicio::TEXT
        END;

        FOR v_trigger IN
            SELECT * FROM cadence_event_triggers
            WHERE event_type = 'field_changed' AND is_active = true
              AND event_config->>'field' = v_field
              AND (applicable_pipeline_ids IS NULL OR array_length(applicable_pipeline_ids, 1) IS NULL OR v_card_pipeline_id = ANY(applicable_pipeline_ids))
              AND (applicable_stage_ids IS NULL OR array_length(applicable_stage_ids, 1) IS NULL OR NEW.pipeline_stage_id = ANY(applicable_stage_ids))
              AND (
                event_config->>'to_value' IS NULL
                OR event_config->>'to_value' = COALESCE(v_new_value, '')
              )
        LOOP
            SELECT COUNT(*) INTO v_pending_count FROM cadence_entry_queue
                WHERE card_id=NEW.id AND trigger_id=v_trigger.id AND status='pending';
            IF v_pending_count > 0 THEN CONTINUE; END IF;

            INSERT INTO cadence_entry_queue (card_id, trigger_id, event_type, event_data, execute_at)
            VALUES (NEW.id, v_trigger.id, 'field_changed',
                jsonb_build_object(
                    'field', v_field,
                    'old_value', v_old_value,
                    'new_value', v_new_value,
                    'pipeline_id', v_card_pipeline_id,
                    'stage_id', NEW.pipeline_stage_id
                ),
                CASE WHEN v_trigger.delay_minutes=0 THEN NOW() ELSE NOW()+(v_trigger.delay_minutes||' minutes')::INTERVAL END);
        END LOOP;
    END LOOP;

    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

COMMIT;
