-- ============================================================================
-- FIX: record_card_open() — adicionar validação de org_id
--
-- A função usa SECURITY DEFINER (bypassa RLS). Antes, um user de Org A
-- poderia chamar record_card_open(card_de_org_b) e o INSERT em card_opens
-- funcionaria com org_id da Org B. Agora valida requesting_org_id().
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_card_open(
    p_card_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_user_id UUID := auth.uid();
    v_is_first_open BOOLEAN := false;
    v_card_org UUID;
    v_rule RECORD;
    v_alerts_created INT := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('error', 'not_authenticated');
    END IF;

    -- Verifica se card existe, pertence à org do usuário, e pega org_id
    SELECT org_id INTO v_card_org
    FROM cards
    WHERE id = p_card_id
      AND deleted_at IS NULL
      AND org_id = requesting_org_id();

    IF v_card_org IS NULL THEN
        RETURN jsonb_build_object('error', 'card_not_found');
    END IF;

    -- INSERT ... ON CONFLICT: sabemos se é primeira abertura pelo resultado
    INSERT INTO card_opens (card_id, user_id, first_opened_at, last_opened_at, open_count, org_id)
    VALUES (p_card_id, v_user_id, now(), now(), 1, v_card_org)
    ON CONFLICT (card_id, user_id) DO UPDATE SET
        last_opened_at = now(),
        open_count = card_opens.open_count + 1
    RETURNING (xmax = 0) INTO v_is_first_open;

    -- Se é primeira abertura, aciona regras on_card_open
    IF v_is_first_open THEN
        FOR v_rule IN
            SELECT r.id
            FROM card_alert_rules r
            LEFT JOIN cards c ON c.id = p_card_id
            LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
            WHERE r.is_active = true
              AND r.trigger_mode = 'on_card_open'
              AND r.org_id = v_card_org
              AND (r.pipeline_id IS NULL OR r.pipeline_id = c.pipeline_id)
              AND (r.stage_id IS NULL OR r.stage_id = c.pipeline_stage_id)
              AND (r.phase_id IS NULL OR r.phase_id = s.phase_id)
              AND (r.product IS NULL OR r.product = c.produto::TEXT)
        LOOP
            BEGIN
                PERFORM public.generate_card_alerts(v_rule.id, p_card_id);
                v_alerts_created := v_alerts_created + 1;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'record_card_open rule % falhou: %', v_rule.id, SQLERRM;
            END;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'first_open', v_is_first_open,
        'alerts_created', v_alerts_created
    );
END;
$fn$;
