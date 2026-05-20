-- ============================================================================
-- MIGRATION: generate_card_alerts — múltiplos destinatários + canais
-- Date: 2026-05-20
--
-- Marco A.4 — Alertas Viscerais: Atualiza generate_card_alerts para:
--
-- 1. Usar resolve_alert_recipients(rule_id, card_id) em vez de hardcode
--    user_id = card.dono_atual_id. Suporta team_managers, specific_roles, specific_users.
--
-- 2. Gravar metadata.channels {modal, banner, bell} pra o frontend filtrar
--    onde mostrar a notificação (modal de welcome, faixa no KanbanCard, sino).
--
-- 3. Preservar tudo mais: dedup por (rule_id, card_id, user_id, read=false),
--    ghost cleanup, template rendering, validate_stage_requirements.
--
-- Retorna JSONB { created, removed, skipped }.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_card_alerts(
    p_rule_id UUID,
    p_card_id UUID DEFAULT NULL  -- filtra pra um card específico (on_card_enter/change)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
    v_rule RECORD;
    v_card RECORD;
    v_violates BOOLEAN;
    v_stage_req JSONB;
    v_missing_fields TEXT;
    v_title TEXT;
    v_body TEXT;
    v_stage_name TEXT;
    v_created INT := 0;
    v_removed INT := 0;
    v_skipped INT := 0;
    v_existing_notif_id UUID;
    v_recipient_id UUID;
BEGIN
    SELECT * INTO v_rule
    FROM card_alert_rules
    WHERE id = p_rule_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'rule_not_found', 'rule_id', p_rule_id);
    END IF;

    IF NOT v_rule.is_active THEN
        -- Regra desativada: limpar todas as notifications dela
        DELETE FROM notifications
        WHERE type = 'card_alert_rule'
          AND metadata->>'rule_id' = p_rule_id::text;
        GET DIAGNOSTICS v_removed = ROW_COUNT;
        RETURN jsonb_build_object('created', 0, 'removed', v_removed, 'skipped', 0, 'note', 'rule_inactive');
    END IF;

    -- Itera sobre cards no escopo
    FOR v_card IN
        SELECT
            c.id,
            c.titulo,
            c.dono_atual_id,
            c.pipeline_stage_id,
            c.pipeline_id,
            c.produto,
            s.nome AS stage_nome,
            s.phase_id
        FROM cards c
        LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
        WHERE c.org_id = v_rule.org_id
          AND c.deleted_at IS NULL
          AND c.archived_at IS NULL
          AND (p_card_id IS NULL OR c.id = p_card_id)
          AND (v_rule.pipeline_id IS NULL OR c.pipeline_id = v_rule.pipeline_id)
          AND (v_rule.stage_id IS NULL OR c.pipeline_stage_id = v_rule.stage_id)
          AND (v_rule.phase_id IS NULL OR s.phase_id = v_rule.phase_id)
          AND (v_rule.product IS NULL OR c.produto::TEXT = v_rule.product)
    LOOP
        v_violates := public.evaluate_alert_condition(v_card.id, v_rule.condition);

        -- Build missing_fields humano (só para stage_requirements)
        v_missing_fields := '';
        IF v_rule.condition->>'type' = 'stage_requirements' THEN
            v_stage_req := public.validate_stage_requirements(v_card.id, v_card.pipeline_stage_id);
            v_missing_fields := array_to_string(
                ARRAY(SELECT jsonb_array_elements_text(v_stage_req->'missing')),
                ', '
            );
        END IF;

        v_stage_name := COALESCE(v_card.stage_nome, 'stage desconhecido');

        -- Render templates
        v_title := replace(replace(replace(
            v_rule.title_template,
            '{titulo}', COALESCE(v_card.titulo, 'Card sem título')),
            '{stage_name}', v_stage_name),
            '{missing_fields}', v_missing_fields);

        v_body := NULL;
        IF v_rule.body_template IS NOT NULL THEN
            v_body := replace(replace(replace(
                v_rule.body_template,
                '{titulo}', COALESCE(v_card.titulo, 'Card sem título')),
                '{stage_name}', v_stage_name),
                '{missing_fields}', v_missing_fields);
        END IF;

        -- Itera sobre destinatários da regra para este card
        FOR v_recipient_id IN
            SELECT r.user_id
            FROM public.resolve_alert_recipients(v_rule.id, v_card.id) r
        LOOP
            -- Já existe notification não-lida pra esta regra/card/destinatário?
            SELECT id INTO v_existing_notif_id
            FROM notifications
            WHERE type = 'card_alert_rule'
              AND card_id = v_card.id
              AND user_id = v_recipient_id
              AND metadata->>'rule_id' = p_rule_id::text
              AND read = false
            LIMIT 1;

            IF v_violates THEN
                -- Dedup: notification não-lida já existe pra mesmo rule+card+user → skip
                IF v_existing_notif_id IS NOT NULL THEN
                    v_skipped := v_skipped + 1;
                    CONTINUE;
                END IF;

                INSERT INTO notifications (
                    user_id, type, title, body, url, card_id, org_id, metadata
                ) VALUES (
                    v_recipient_id,
                    'card_alert_rule',
                    v_title,
                    v_body,
                    '/cards/' || v_card.id::text,
                    v_card.id,
                    v_rule.org_id,
                    jsonb_build_object(
                        'rule_id', p_rule_id,
                        'rule_name', v_rule.name,
                        'severity', v_rule.severity,
                        'send_email', v_rule.send_email,
                        'missing_fields', v_missing_fields,
                        'channels', jsonb_build_object(
                            'modal', v_rule.show_in_modal,
                            'banner', v_rule.show_in_kanban_banner,
                            'bell', v_rule.show_in_bell
                        )
                    )
                );

                v_created := v_created + 1;
            ELSE
                -- Não viola mais → remove notification ghost (se não-lida)
                -- Se já foi lida, mantém no histórico
                IF v_existing_notif_id IS NOT NULL THEN
                    DELETE FROM notifications WHERE id = v_existing_notif_id;
                    v_removed := v_removed + 1;
                ELSE
                    v_skipped := v_skipped + 1;
                END IF;
            END IF;
        END LOOP;
    END LOOP;

    -- Ghost cleanup global: se está rodando sem p_card_id (cron), remover
    -- notifications dessa regra para cards que saíram do escopo.
    -- (cards que não aparecem no FOR acima mas têm notification dessa regra)
    IF p_card_id IS NULL THEN
        WITH deleted AS (
            DELETE FROM notifications n
            WHERE n.type = 'card_alert_rule'
              AND n.metadata->>'rule_id' = p_rule_id::text
              AND n.read = false
              AND NOT EXISTS (
                  SELECT 1
                  FROM cards c
                  LEFT JOIN pipeline_stages s ON s.id = c.pipeline_stage_id
                  WHERE c.id = n.card_id
                    AND c.org_id = v_rule.org_id
                    AND c.deleted_at IS NULL
                    AND c.archived_at IS NULL
                    AND (v_rule.pipeline_id IS NULL OR c.pipeline_id = v_rule.pipeline_id)
                    AND (v_rule.stage_id IS NULL OR c.pipeline_stage_id = v_rule.stage_id)
                    AND (v_rule.phase_id IS NULL OR s.phase_id = v_rule.phase_id)
                    AND (v_rule.product IS NULL OR c.produto::TEXT = v_rule.product)
              )
            RETURNING 1
        )
        SELECT v_removed + COUNT(*) INTO v_removed FROM deleted;
    END IF;

    RETURN jsonb_build_object(
        'rule_id', p_rule_id,
        'created', v_created,
        'removed', v_removed,
        'skipped', v_skipped
    );
END;
$fn$;

COMMENT ON FUNCTION public.generate_card_alerts(uuid, uuid) IS
'Engine do motor de alertas (Marco A.4). Dado rule_id (opcionalmente card_id), '
'avalia cards no escopo, resolve destinatários via resolve_alert_recipients, '
'cria notifications com metadata.channels pra quem viola a condição e limpa '
'notifications ghost. Retorna contadores.';
