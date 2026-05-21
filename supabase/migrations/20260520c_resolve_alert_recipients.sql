-- 20260520c_resolve_alert_recipients.sql
-- Função que resolve a lista de profile_id que devem receber a notificação
-- de uma regra, dado um card específico.
-- Spec: docs/superpowers/specs/2026-05-20-alertas-viscerais-e-painel-acessos-design.md §3.3

CREATE OR REPLACE FUNCTION public.resolve_alert_recipients(
    p_rule_id UUID,
    p_card_id UUID
) RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rule RECORD;
    v_card RECORD;
    v_user_id UUID;
BEGIN
    SELECT id, org_id, recipient_mode, recipient_target
        INTO v_rule
        FROM public.card_alert_rules
        WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT id, dono_atual_id, sdr_owner_id, vendas_owner_id,
           pos_owner_id, concierge_owner_id
        INTO v_card
        FROM public.cards
        WHERE id = p_card_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    CASE v_rule.recipient_mode
        WHEN 'card_owner' THEN
            IF v_card.dono_atual_id IS NOT NULL THEN
                user_id := v_card.dono_atual_id;
                RETURN NEXT;
            END IF;

        WHEN 'team_managers' THEN
            FOR v_user_id IN
                SELECT om.user_id
                FROM public.org_members om
                JOIN public.profiles p ON p.id = om.user_id
                WHERE om.org_id = v_rule.org_id
                  AND p.is_admin = TRUE
                  AND COALESCE(p.active, TRUE) = TRUE
            LOOP
                user_id := v_user_id;
                RETURN NEXT;
            END LOOP;

        WHEN 'specific_roles' THEN
            -- recipient_target = ["sdr","vendas","pos","concierge"]
            IF v_rule.recipient_target ? 'sdr' AND v_card.sdr_owner_id IS NOT NULL THEN
                user_id := v_card.sdr_owner_id;
                RETURN NEXT;
            END IF;
            IF v_rule.recipient_target ? 'vendas' AND v_card.vendas_owner_id IS NOT NULL THEN
                user_id := v_card.vendas_owner_id;
                RETURN NEXT;
            END IF;
            IF v_rule.recipient_target ? 'pos' AND v_card.pos_owner_id IS NOT NULL THEN
                user_id := v_card.pos_owner_id;
                RETURN NEXT;
            END IF;
            IF v_rule.recipient_target ? 'concierge' AND v_card.concierge_owner_id IS NOT NULL THEN
                user_id := v_card.concierge_owner_id;
                RETURN NEXT;
            END IF;

        WHEN 'specific_users' THEN
            -- recipient_target = ["uuid1","uuid2"]
            FOR v_user_id IN
                SELECT (jsonb_array_elements_text(v_rule.recipient_target))::UUID
            LOOP
                -- Valida que o user pertence à org da regra
                IF EXISTS (
                    SELECT 1 FROM public.org_members om
                    WHERE om.user_id = v_user_id AND om.org_id = v_rule.org_id
                ) THEN
                    user_id := v_user_id;
                    RETURN NEXT;
                END IF;
            END LOOP;

        ELSE
            RAISE WARNING 'resolve_alert_recipients: recipient_mode desconhecido: %', v_rule.recipient_mode;
    END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_alert_recipients(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_alert_recipients(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.resolve_alert_recipients IS
'Resolve destinatários (user_id) de uma regra de alerta para um card. Usado por generate_card_alerts.';
