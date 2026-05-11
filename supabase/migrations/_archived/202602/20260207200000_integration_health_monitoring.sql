-- ============================================================================
-- Integration Health Monitoring System
-- Tabelas, funcao de verificacao, pg_cron, e seed data
-- ============================================================================

-- ============================================================================
-- 1. TABELA: integration_health_rules (config das regras)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.integration_health_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL CHECK (category IN (
        'whatsapp', 'activecampaign', 'outbound', 'monde', 'system'
    )),
    severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN (
        'info', 'warning', 'critical'
    )),
    threshold_hours NUMERIC NOT NULL DEFAULT 24,
    threshold_count INTEGER,
    threshold_percent NUMERIC,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_timestamp_integration_health_rules
    BEFORE UPDATE ON public.integration_health_rules
    FOR EACH ROW
    EXECUTE PROCEDURE public.handle_updated_at();

ALTER TABLE public.integration_health_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view health rules"
    ON public.integration_health_rules FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "Admins can manage health rules"
    ON public.integration_health_rules FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- 2. TABELA: integration_health_alerts (alertas gerados)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.integration_health_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES public.integration_health_rules(id) ON DELETE CASCADE,
    rule_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'acknowledged', 'resolved'
    )),
    context JSONB NOT NULL DEFAULT '{}'::jsonb,
    fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES public.profiles(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Maximo 1 alerta ativo/acknowledged por regra
CREATE UNIQUE INDEX idx_health_alerts_active_rule
    ON public.integration_health_alerts(rule_key)
    WHERE status IN ('active', 'acknowledged');

CREATE INDEX idx_health_alerts_status ON public.integration_health_alerts(status);
CREATE INDEX idx_health_alerts_fired_at ON public.integration_health_alerts(fired_at DESC);

ALTER TABLE public.integration_health_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view health alerts"
    ON public.integration_health_alerts FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "Admins can manage health alerts"
    ON public.integration_health_alerts FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================================================
-- 3. TABELA: integration_health_pulse (cache de ultimo evento por canal)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.integration_health_pulse (
    channel TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    last_event_at TIMESTAMPTZ,
    event_count_24h INTEGER DEFAULT 0,
    event_count_7d INTEGER DEFAULT 0,
    last_error_at TIMESTAMPTZ,
    error_count_24h INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.integration_health_pulse ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view pulse"
    ON public.integration_health_pulse FOR SELECT
    TO authenticated USING (true);

CREATE POLICY "Service role can manage pulse"
    ON public.integration_health_pulse FOR ALL
    TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 4. SEED DATA
-- ============================================================================

-- 15 regras de monitoramento
INSERT INTO public.integration_health_rules (rule_key, label, description, category, severity, threshold_hours, threshold_count, threshold_percent) VALUES
    -- WhatsApp (4)
    ('whatsapp_no_inbound',      'Sem mensagens recebidas (WhatsApp)',     'Nenhuma mensagem WhatsApp recebida no periodo',              'whatsapp',        'warning',  24, NULL, NULL),
    ('whatsapp_no_outbound',     'Sem mensagens enviadas (WhatsApp)',      'Nenhuma mensagem WhatsApp enviada no periodo',               'whatsapp',        'info',     24, NULL, NULL),
    ('whatsapp_raw_backlog',     'Backlog de eventos WhatsApp',            'Eventos raw pendentes ha muito tempo sem processar',          'whatsapp',        'critical', 2,  NULL, NULL),
    ('whatsapp_high_error_rate', 'Alta taxa de erro WhatsApp',             'Percentual alto de eventos WhatsApp falhando',                'whatsapp',        'critical', 24, NULL, 20),
    -- ActiveCampaign Inbound (4)
    ('active_no_events',         'Sem eventos do ActiveCampaign',          'Nenhum evento inbound recebido do AC no periodo',             'activecampaign',  'warning',  24, NULL, NULL),
    ('active_no_card_created',   'Sem cards criados via integracao',       'Nenhum card criado a partir do ActiveCampaign no periodo',    'activecampaign',  'warning',  48, NULL, NULL),
    ('active_no_card_updated',   'Sem cards atualizados via integracao',   'Nenhum card atualizado via eventos do AC no periodo',         'activecampaign',  'warning',  48, NULL, NULL),
    ('active_events_failing',    'Alta taxa de falha AC',                  'Muitos eventos inbound do AC falhando',                       'activecampaign',  'critical', 24, NULL, 25),
    -- Outbound (2)
    ('outbound_queue_stale',     'Fila outbound parada',                   'Itens na fila outbound pendentes ha muito tempo',             'outbound',        'critical', 2,  NULL, NULL),
    ('outbound_high_failure',    'Alta taxa de falha outbound',            'Muitos itens falhando no envio para AC',                      'outbound',        'critical', 24, 5,   NULL),
    -- Monde (2)
    ('monde_pending_stale',      'Vendas Monde paradas',                   'Vendas pendentes de envio ao Monde ha muito tempo',           'monde',           'warning',  24, NULL, NULL),
    ('monde_high_failure',       'Alta taxa de falha Monde',               'Muitas vendas falhando no envio ao Monde',                    'monde',           'critical', 24, 3,   NULL),
    -- System (3)
    ('cadence_queue_stale',      'Fila de cadencias parada',               'Steps de cadencia passaram do horario sem serem processados', 'system',          'critical', 1,  NULL, NULL),
    ('no_activities',            'Sem atividades registradas',             'Nenhuma atividade registrada no CRM no periodo',              'system',          'warning',  24, NULL, NULL),
    ('no_new_cards',             'Sem novos cards',                        'Nenhum card criado no periodo',                               'system',          'info',     48, NULL, NULL)
ON CONFLICT (rule_key) DO NOTHING;

-- 8 canais de pulse
INSERT INTO public.integration_health_pulse (channel, label) VALUES
    ('whatsapp_inbound',  'WhatsApp (Entrada)'),
    ('whatsapp_outbound', 'WhatsApp (Saida)'),
    ('active_inbound',    'ActiveCampaign (Entrada)'),
    ('active_outbound',   'ActiveCampaign (Saida)'),
    ('monde',             'Monde ERP'),
    ('cadence',           'Motor de Cadencias'),
    ('activities',        'Atividades CRM'),
    ('cards',             'Criacao de Cards')
ON CONFLICT (channel) DO NOTHING;

-- ============================================================================
-- 5. FUNCAO: fn_check_integration_health()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_check_integration_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rule RECORD;
    v_now TIMESTAMPTZ := now();
    v_cutoff TIMESTAMPTZ;
    v_count BIGINT;
    v_total BIGINT;
    v_last_event TIMESTAMPTZ;
    v_should_alert BOOLEAN;
    v_context JSONB;
    v_alerts_fired INT := 0;
    v_alerts_resolved INT := 0;
BEGIN
    -- =========================================================================
    -- STEP 1: Atualiza pulse table
    -- =========================================================================

    -- WhatsApp Inbound
    UPDATE integration_health_pulse SET
        last_event_at = sub.last_event,
        event_count_24h = sub.cnt_24h,
        event_count_7d = sub.cnt_7d,
        last_error_at = sub.last_err,
        error_count_24h = sub.err_24h,
        updated_at = v_now
    FROM (
        SELECT
            MAX(created_at) FILTER (WHERE direction = 'inbound') AS last_event,
            COUNT(*) FILTER (WHERE direction = 'inbound' AND created_at >= v_now - interval '24 hours') AS cnt_24h,
            COUNT(*) FILTER (WHERE direction = 'inbound' AND created_at >= v_now - interval '7 days') AS cnt_7d,
            NULL::timestamptz AS last_err,
            0::bigint AS err_24h
        FROM whatsapp_messages
    ) sub
    WHERE channel = 'whatsapp_inbound';

    -- WhatsApp Outbound
    UPDATE integration_health_pulse SET
        last_event_at = sub.last_event,
        event_count_24h = sub.cnt_24h,
        event_count_7d = sub.cnt_7d,
        last_error_at = NULL,
        error_count_24h = 0,
        updated_at = v_now
    FROM (
        SELECT
            MAX(created_at) FILTER (WHERE direction = 'outbound') AS last_event,
            COUNT(*) FILTER (WHERE direction = 'outbound' AND created_at >= v_now - interval '24 hours') AS cnt_24h,
            COUNT(*) FILTER (WHERE direction = 'outbound' AND created_at >= v_now - interval '7 days') AS cnt_7d
        FROM whatsapp_messages
    ) sub
    WHERE channel = 'whatsapp_outbound';

    -- ActiveCampaign Inbound
    UPDATE integration_health_pulse SET
        last_event_at = sub.last_event,
        event_count_24h = sub.cnt_24h,
        event_count_7d = sub.cnt_7d,
        last_error_at = sub.last_err,
        error_count_24h = sub.err_24h,
        updated_at = v_now
    FROM (
        SELECT
            MAX(created_at) AS last_event,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '24 hours') AS cnt_24h,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '7 days') AS cnt_7d,
            MAX(created_at) FILTER (WHERE status = 'failed') AS last_err,
            COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= v_now - interval '24 hours') AS err_24h
        FROM integration_events
    ) sub
    WHERE channel = 'active_inbound';

    -- ActiveCampaign Outbound
    UPDATE integration_health_pulse SET
        last_event_at = sub.last_event,
        event_count_24h = sub.cnt_24h,
        event_count_7d = sub.cnt_7d,
        last_error_at = sub.last_err,
        error_count_24h = sub.err_24h,
        updated_at = v_now
    FROM (
        SELECT
            MAX(created_at) AS last_event,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '24 hours') AS cnt_24h,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '7 days') AS cnt_7d,
            MAX(created_at) FILTER (WHERE status = 'failed') AS last_err,
            COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= v_now - interval '24 hours') AS err_24h
        FROM integration_outbound_queue
    ) sub
    WHERE channel = 'active_outbound';

    -- Monde
    UPDATE integration_health_pulse SET
        last_event_at = sub.last_event,
        event_count_24h = sub.cnt_24h,
        event_count_7d = sub.cnt_7d,
        last_error_at = sub.last_err,
        error_count_24h = sub.err_24h,
        updated_at = v_now
    FROM (
        SELECT
            MAX(created_at) AS last_event,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '24 hours') AS cnt_24h,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '7 days') AS cnt_7d,
            MAX(created_at) FILTER (WHERE status = 'failed') AS last_err,
            COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= v_now - interval '24 hours') AS err_24h
        FROM monde_sales
    ) sub
    WHERE channel = 'monde';

    -- Cadence
    UPDATE integration_health_pulse SET
        last_event_at = sub.last_event,
        event_count_24h = sub.cnt_24h,
        event_count_7d = sub.cnt_7d,
        last_error_at = NULL,
        error_count_24h = 0,
        updated_at = v_now
    FROM (
        SELECT
            MAX(created_at) AS last_event,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '24 hours') AS cnt_24h,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '7 days') AS cnt_7d
        FROM cadence_queue
    ) sub
    WHERE channel = 'cadence';

    -- Activities
    UPDATE integration_health_pulse SET
        last_event_at = sub.last_event,
        event_count_24h = sub.cnt_24h,
        event_count_7d = sub.cnt_7d,
        last_error_at = NULL,
        error_count_24h = 0,
        updated_at = v_now
    FROM (
        SELECT
            MAX(created_at) AS last_event,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '24 hours') AS cnt_24h,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '7 days') AS cnt_7d
        FROM activities
    ) sub
    WHERE channel = 'activities';

    -- Cards
    UPDATE integration_health_pulse SET
        last_event_at = sub.last_event,
        event_count_24h = sub.cnt_24h,
        event_count_7d = sub.cnt_7d,
        last_error_at = NULL,
        error_count_24h = 0,
        updated_at = v_now
    FROM (
        SELECT
            MAX(created_at) AS last_event,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '24 hours') AS cnt_24h,
            COUNT(*) FILTER (WHERE created_at >= v_now - interval '7 days') AS cnt_7d
        FROM cards WHERE deleted_at IS NULL
    ) sub
    WHERE channel = 'cards';

    -- =========================================================================
    -- STEP 2: Avalia cada regra habilitada
    -- =========================================================================

    FOR v_rule IN
        SELECT * FROM integration_health_rules WHERE is_enabled = true
    LOOP
        v_should_alert := false;
        v_context := '{}'::jsonb;
        v_cutoff := v_now - make_interval(hours => v_rule.threshold_hours::int);

        CASE v_rule.rule_key

            -- ═══════ WHATSAPP ═══════

            WHEN 'whatsapp_no_inbound' THEN
                SELECT MAX(created_at) INTO v_last_event
                FROM whatsapp_messages WHERE direction = 'inbound';
                v_should_alert := (v_last_event IS NULL OR v_last_event < v_cutoff);
                v_context := jsonb_build_object(
                    'last_event_at', v_last_event,
                    'hours_since', ROUND(EXTRACT(EPOCH FROM (v_now - COALESCE(v_last_event, v_now - interval '999 hours'))) / 3600),
                    'threshold_hours', v_rule.threshold_hours
                );

            WHEN 'whatsapp_no_outbound' THEN
                SELECT MAX(created_at) INTO v_last_event
                FROM whatsapp_messages WHERE direction = 'outbound';
                v_should_alert := (v_last_event IS NULL OR v_last_event < v_cutoff);
                v_context := jsonb_build_object(
                    'last_event_at', v_last_event,
                    'hours_since', ROUND(EXTRACT(EPOCH FROM (v_now - COALESCE(v_last_event, v_now - interval '999 hours'))) / 3600),
                    'threshold_hours', v_rule.threshold_hours
                );

            WHEN 'whatsapp_raw_backlog' THEN
                SELECT COUNT(*) INTO v_count
                FROM whatsapp_raw_events
                WHERE status = 'pending' AND created_at < v_cutoff;
                v_should_alert := (v_count > 0);
                v_context := jsonb_build_object(
                    'stuck_pending_count', v_count,
                    'threshold_hours', v_rule.threshold_hours
                );

            WHEN 'whatsapp_high_error_rate' THEN
                SELECT
                    COUNT(*) FILTER (WHERE status = 'failed'),
                    COUNT(*)
                INTO v_count, v_total
                FROM whatsapp_raw_events
                WHERE created_at >= v_cutoff;
                v_should_alert := (v_total > 5 AND (v_count::numeric / v_total * 100) > COALESCE(v_rule.threshold_percent, 20));
                v_context := jsonb_build_object(
                    'failed_count', v_count,
                    'total_count', v_total,
                    'error_rate_percent', CASE WHEN v_total > 0 THEN ROUND(v_count::numeric / v_total * 100, 1) ELSE 0 END,
                    'threshold_percent', v_rule.threshold_percent
                );

            -- ═══════ ACTIVECAMPAIGN INBOUND ═══════

            WHEN 'active_no_events' THEN
                SELECT MAX(created_at) INTO v_last_event FROM integration_events;
                v_should_alert := (v_last_event IS NULL OR v_last_event < v_cutoff);
                v_context := jsonb_build_object(
                    'last_event_at', v_last_event,
                    'hours_since', ROUND(EXTRACT(EPOCH FROM (v_now - COALESCE(v_last_event, v_now - interval '999 hours'))) / 3600),
                    'threshold_hours', v_rule.threshold_hours
                );

            WHEN 'active_no_card_created' THEN
                SELECT MAX(created_at) INTO v_last_event
                FROM cards WHERE origem = 'active_campaign' AND deleted_at IS NULL;
                v_should_alert := (v_last_event IS NULL OR v_last_event < v_cutoff);
                v_context := jsonb_build_object(
                    'last_card_created_at', v_last_event,
                    'hours_since', ROUND(EXTRACT(EPOCH FROM (v_now - COALESCE(v_last_event, v_now - interval '999 hours'))) / 3600),
                    'threshold_hours', v_rule.threshold_hours
                );

            WHEN 'active_no_card_updated' THEN
                SELECT MAX(updated_at) INTO v_last_event
                FROM integration_events
                WHERE status IN ('processed', 'processed_shadow', 'completed')
                  AND created_at >= v_cutoff;
                v_should_alert := (v_last_event IS NULL);
                v_context := jsonb_build_object(
                    'last_processed_event_at', v_last_event,
                    'threshold_hours', v_rule.threshold_hours
                );

            WHEN 'active_events_failing' THEN
                SELECT
                    COUNT(*) FILTER (WHERE status = 'failed'),
                    COUNT(*)
                INTO v_count, v_total
                FROM integration_events
                WHERE created_at >= v_cutoff;
                v_should_alert := (v_total > 5 AND (v_count::numeric / v_total * 100) > COALESCE(v_rule.threshold_percent, 25));
                v_context := jsonb_build_object(
                    'failed_count', v_count,
                    'total_count', v_total,
                    'error_rate_percent', CASE WHEN v_total > 0 THEN ROUND(v_count::numeric / v_total * 100, 1) ELSE 0 END,
                    'threshold_percent', v_rule.threshold_percent
                );

            -- ═══════ OUTBOUND ═══════

            WHEN 'outbound_queue_stale' THEN
                SELECT COUNT(*) INTO v_count
                FROM integration_outbound_queue
                WHERE status IN ('pending', 'processing') AND created_at < v_cutoff;
                v_should_alert := (v_count > 0);
                v_context := jsonb_build_object(
                    'stuck_count', v_count,
                    'threshold_hours', v_rule.threshold_hours
                );

            WHEN 'outbound_high_failure' THEN
                SELECT COUNT(*) INTO v_count
                FROM integration_outbound_queue
                WHERE status = 'failed' AND created_at >= v_cutoff;
                v_should_alert := (v_count >= COALESCE(v_rule.threshold_count, 5));
                v_context := jsonb_build_object(
                    'failed_count', v_count,
                    'threshold_count', v_rule.threshold_count
                );

            -- ═══════ MONDE ═══════

            WHEN 'monde_pending_stale' THEN
                SELECT COUNT(*) INTO v_count
                FROM monde_sales
                WHERE status IN ('pending', 'processing') AND created_at < v_cutoff;
                v_should_alert := (v_count > 0);
                v_context := jsonb_build_object(
                    'stuck_count', v_count,
                    'threshold_hours', v_rule.threshold_hours
                );

            WHEN 'monde_high_failure' THEN
                SELECT COUNT(*) INTO v_count
                FROM monde_sales
                WHERE status = 'failed' AND created_at >= v_cutoff;
                v_should_alert := (v_count >= COALESCE(v_rule.threshold_count, 3));
                v_context := jsonb_build_object(
                    'failed_count', v_count,
                    'threshold_count', v_rule.threshold_count
                );

            -- ═══════ SYSTEM ═══════

            WHEN 'cadence_queue_stale' THEN
                SELECT COUNT(*) INTO v_count
                FROM cadence_queue
                WHERE status = 'pending' AND execute_at < v_cutoff;
                v_should_alert := (v_count > 0);
                v_context := jsonb_build_object(
                    'overdue_count', v_count,
                    'threshold_hours', v_rule.threshold_hours
                );

            WHEN 'no_activities' THEN
                SELECT MAX(created_at) INTO v_last_event FROM activities;
                v_should_alert := (v_last_event IS NULL OR v_last_event < v_cutoff);
                v_context := jsonb_build_object(
                    'last_activity_at', v_last_event,
                    'hours_since', ROUND(EXTRACT(EPOCH FROM (v_now - COALESCE(v_last_event, v_now - interval '999 hours'))) / 3600),
                    'threshold_hours', v_rule.threshold_hours
                );

            WHEN 'no_new_cards' THEN
                SELECT MAX(created_at) INTO v_last_event
                FROM cards WHERE deleted_at IS NULL;
                v_should_alert := (v_last_event IS NULL OR v_last_event < v_cutoff);
                v_context := jsonb_build_object(
                    'last_card_at', v_last_event,
                    'hours_since', ROUND(EXTRACT(EPOCH FROM (v_now - COALESCE(v_last_event, v_now - interval '999 hours'))) / 3600),
                    'threshold_hours', v_rule.threshold_hours
                );

            ELSE
                CONTINUE;
        END CASE;

        -- =========================================================================
        -- STEP 3: Cria ou resolve alertas
        -- =========================================================================

        IF v_should_alert THEN
            INSERT INTO integration_health_alerts (rule_id, rule_key, status, context, fired_at)
            VALUES (v_rule.id, v_rule.rule_key, 'active', v_context, v_now)
            ON CONFLICT (rule_key) WHERE status IN ('active', 'acknowledged')
            DO UPDATE SET context = EXCLUDED.context, fired_at = EXCLUDED.fired_at;

            v_alerts_fired := v_alerts_fired + 1;
        ELSE
            UPDATE integration_health_alerts
            SET status = 'resolved', resolved_at = v_now
            WHERE rule_key = v_rule.rule_key
              AND status IN ('active', 'acknowledged');

            IF FOUND THEN
                v_alerts_resolved := v_alerts_resolved + 1;
            END IF;
        END IF;

    END LOOP;

    RETURN jsonb_build_object(
        'checked_at', v_now,
        'alerts_fired', v_alerts_fired,
        'alerts_resolved', v_alerts_resolved
    );
END;
$$;

-- ============================================================================
-- 6. PG_CRON: Rodar a cada hora
-- ============================================================================

SELECT cron.schedule(
    'check-integration-health',
    '0 * * * *',
    $$ SELECT public.fn_check_integration_health(); $$
);
