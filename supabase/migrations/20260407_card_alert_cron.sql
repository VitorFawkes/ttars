-- ============================================================================
-- MIGRATION: pg_cron diário para processar regras daily_cron
-- Date: 2026-04-07
--
-- Agenda um job diário às 9h UTC (6h BRT) que chama generate_card_alerts
-- para cada regra ativa com trigger_mode='daily_cron'.
--
-- Pode ser rodado manualmente via:
--   SELECT public.run_card_alerts_daily();
-- ============================================================================

-- Wrapper que processa todas as regras de uma vez
CREATE OR REPLACE FUNCTION public.run_card_alerts_daily()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_rule RECORD;
    v_result JSONB;
    v_results JSONB := '[]'::jsonb;
    v_total_created INT := 0;
    v_total_removed INT := 0;
BEGIN
    FOR v_rule IN
        SELECT id, name
        FROM card_alert_rules
        WHERE is_active = true
          AND trigger_mode = 'daily_cron'
    LOOP
        BEGIN
            v_result := public.generate_card_alerts(v_rule.id, NULL);
            v_results := v_results || jsonb_build_array(jsonb_build_object(
                'rule_id', v_rule.id,
                'rule_name', v_rule.name,
                'result', v_result
            ));
            v_total_created := v_total_created + COALESCE((v_result->>'created')::int, 0);
            v_total_removed := v_total_removed + COALESCE((v_result->>'removed')::int, 0);
        EXCEPTION WHEN OTHERS THEN
            v_results := v_results || jsonb_build_array(jsonb_build_object(
                'rule_id', v_rule.id,
                'rule_name', v_rule.name,
                'error', SQLERRM
            ));
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'run_at', now(),
        'total_created', v_total_created,
        'total_removed', v_total_removed,
        'rules', v_results
    );
END;
$fn$;

COMMENT ON FUNCTION public.run_card_alerts_daily() IS
'Wrapper chamado pelo cron diário. Itera sobre regras ativas daily_cron e '
'chama generate_card_alerts para cada uma. Resiliente a erros individuais.';

-- Agenda o cron (idempotente via unschedule + schedule)
DO $$
BEGIN
    -- pg_cron pode não estar habilitado em staging; ignora erro
    BEGIN
        PERFORM cron.unschedule('card-alerts-daily');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    BEGIN
        PERFORM cron.schedule(
            'card-alerts-daily',
            '0 9 * * *',  -- 9h UTC = 6h BRT
            $cron$SELECT public.run_card_alerts_daily()$cron$
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'pg_cron não disponível ou sem permissão — schedule manual necessário: %', SQLERRM;
    END;
END $$;
