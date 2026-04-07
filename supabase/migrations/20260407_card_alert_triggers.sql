-- ============================================================================
-- MIGRATION: Triggers reativos para card_alert_rules
-- Date: 2026-04-07
--
-- Fase 2 do motor de alertas: triggers AFTER UPDATE em cards que chamam
-- generate_card_alerts em tempo real para regras com trigger_mode
-- 'on_card_enter' e 'on_field_change'. Também re-avalia TODAS as regras
-- ativas do card quando campos relevantes mudam, permitindo limpeza
-- automática de alertas já corrigidos (independente do trigger_mode).
--
-- Reativo vs preventivo:
-- - daily_cron continua sendo a fonte de verdade (baseline)
-- - Triggers aceleram a UX: alerta aparece/some assim que o campo muda
-- - Guard pg_trigger_depth() evita recursão quando o engine insere notifications
-- ============================================================================

-- ─── 1. Trigger function on_card_enter ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.card_alert_on_stage_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_rule RECORD;
BEGIN
    -- Evita recursão se engine inserir notifications que mexem em outras tabelas
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- Só atua se stage realmente mudou
    IF NEW.pipeline_stage_id IS NOT DISTINCT FROM OLD.pipeline_stage_id THEN
        RETURN NEW;
    END IF;

    -- Itera sobre regras 'on_card_enter' cujo escopo cobre o NEW stage
    FOR v_rule IN
        SELECT r.id
        FROM card_alert_rules r
        LEFT JOIN pipeline_stages s ON s.id = NEW.pipeline_stage_id
        WHERE r.is_active = true
          AND r.trigger_mode = 'on_card_enter'
          AND r.org_id = NEW.org_id
          AND (r.pipeline_id IS NULL OR r.pipeline_id = NEW.pipeline_id)
          AND (r.stage_id IS NULL OR r.stage_id = NEW.pipeline_stage_id)
          AND (r.phase_id IS NULL OR r.phase_id = s.phase_id)
          AND (r.product IS NULL OR r.product = NEW.produto::TEXT)
    LOOP
        BEGIN
            PERFORM public.generate_card_alerts(v_rule.id, NEW.id);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'card_alert_on_stage_change rule % falhou: %', v_rule.id, SQLERRM;
        END;
    END LOOP;

    -- Também re-avalia regras daily_cron cujo escopo cobre o NOVO stage
    -- (pro card já ter notification imediata ao entrar, não precisa esperar 6h)
    FOR v_rule IN
        SELECT r.id
        FROM card_alert_rules r
        LEFT JOIN pipeline_stages s ON s.id = NEW.pipeline_stage_id
        WHERE r.is_active = true
          AND r.trigger_mode = 'daily_cron'
          AND r.org_id = NEW.org_id
          AND (r.pipeline_id IS NULL OR r.pipeline_id = NEW.pipeline_id)
          AND (r.stage_id IS NULL OR r.stage_id = NEW.pipeline_stage_id)
          AND (r.phase_id IS NULL OR r.phase_id = s.phase_id)
          AND (r.product IS NULL OR r.product = NEW.produto::TEXT)
    LOOP
        BEGIN
            PERFORM public.generate_card_alerts(v_rule.id, NEW.id);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'card_alert_on_stage_change (daily cover) rule % falhou: %', v_rule.id, SQLERRM;
        END;
    END LOOP;

    -- Também re-avalia regras cujo escopo cobre o ANTIGO stage
    -- (pro card ter notification ghost removida ao SAIR do escopo)
    IF OLD.pipeline_stage_id IS NOT NULL THEN
        FOR v_rule IN
            SELECT r.id
            FROM card_alert_rules r
            LEFT JOIN pipeline_stages s ON s.id = OLD.pipeline_stage_id
            WHERE r.is_active = true
              AND r.trigger_mode IN ('daily_cron', 'on_card_enter', 'on_field_change')
              AND r.org_id = OLD.org_id
              AND (
                  r.stage_id = OLD.pipeline_stage_id
                  OR (r.phase_id IS NOT NULL AND r.phase_id = s.phase_id)
              )
        LOOP
            BEGIN
                PERFORM public.generate_card_alerts(v_rule.id, NEW.id);
            EXCEPTION WHEN OTHERS THEN NULL;
            END;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_card_alert_on_stage_change ON public.cards;

CREATE TRIGGER trg_card_alert_on_stage_change
    AFTER UPDATE OF pipeline_stage_id ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION public.card_alert_on_stage_change();

COMMENT ON FUNCTION public.card_alert_on_stage_change() IS
'Trigger AFTER UPDATE OF pipeline_stage_id. Re-avalia regras on_card_enter + '
'daily_cron cobrindo o novo e o antigo stage, permitindo alerta imediato ao '
'entrar e limpeza automática ao sair.';

-- ─── 2. Trigger function on_field_change ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.card_alert_on_field_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_rule RECORD;
    v_fields_changed BOOLEAN;
BEGIN
    IF pg_trigger_depth() > 1 THEN
        RETURN NEW;
    END IF;

    -- Só atua se algum dos campos relevantes mudou
    v_fields_changed :=
        NEW.produto_data IS DISTINCT FROM OLD.produto_data
        OR NEW.briefing_inicial IS DISTINCT FROM OLD.briefing_inicial
        OR NEW.pessoa_principal_id IS DISTINCT FROM OLD.pessoa_principal_id
        OR NEW.motivo_perda_id IS DISTINCT FROM OLD.motivo_perda_id
        OR NEW.motivo_perda_comentario IS DISTINCT FROM OLD.motivo_perda_comentario;

    IF NOT v_fields_changed THEN
        RETURN NEW;
    END IF;

    -- Re-avalia TODAS as regras ativas cujo escopo cobre o card atual
    -- (tanto on_field_change quanto daily_cron e on_card_enter — pra limpeza)
    FOR v_rule IN
        SELECT r.id
        FROM card_alert_rules r
        LEFT JOIN pipeline_stages s ON s.id = NEW.pipeline_stage_id
        WHERE r.is_active = true
          AND r.org_id = NEW.org_id
          AND (r.pipeline_id IS NULL OR r.pipeline_id = NEW.pipeline_id)
          AND (r.stage_id IS NULL OR r.stage_id = NEW.pipeline_stage_id)
          AND (r.phase_id IS NULL OR r.phase_id = s.phase_id)
          AND (r.product IS NULL OR r.product = NEW.produto::TEXT)
    LOOP
        BEGIN
            PERFORM public.generate_card_alerts(v_rule.id, NEW.id);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'card_alert_on_field_change rule % falhou: %', v_rule.id, SQLERRM;
        END;
    END LOOP;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_card_alert_on_field_change ON public.cards;

CREATE TRIGGER trg_card_alert_on_field_change
    AFTER UPDATE OF produto_data, briefing_inicial, pessoa_principal_id, motivo_perda_id, motivo_perda_comentario
    ON public.cards
    FOR EACH ROW
    EXECUTE FUNCTION public.card_alert_on_field_change();

COMMENT ON FUNCTION public.card_alert_on_field_change() IS
'Trigger AFTER UPDATE dos campos que afetam condições de alerta. Re-avalia '
'todas as regras ativas cobrindo o card, criando alertas novos e removendo '
'os que foram corrigidos. Custo: 1 chamada de generate_card_alerts por regra '
'ativa cobrindo o card.';
