-- ============================================================================
-- MIGRATION: Motor de alertas admin — tabela card_alert_rules
-- Date: 2026-04-07
--
-- Cria a tabela de regras que o admin usa para configurar alertas escalados
-- em cima de cards. Cada regra define:
-- - Escopo (produto / pipeline / fase / stage) — WHERE para buscar cards
-- - Condição (JSONB DSL) — avaliada por evaluate_alert_condition
-- - Trigger mode (daily_cron, on_card_enter, on_card_open, on_field_change)
-- - Template de título e corpo da notificação
--
-- Também adiciona coluna metadata em notifications para rastrear rule_id
-- e permitir dedup + ghost cleanup.
-- ============================================================================

-- ─── 1. metadata em notifications ───────────────────────────────────────────

ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.notifications.metadata IS
'Dados extras da notificação. Para type=card_alert_rule, contém {rule_id, rule_name, severity, missing_fields[]}.';

-- Índice parcial para dedup rápido de alertas por regra
CREATE INDEX IF NOT EXISTS idx_notifications_rule_card_user
    ON public.notifications ((metadata->>'rule_id'), card_id, user_id)
    WHERE type = 'card_alert_rule';

-- ─── 2. card_alert_rules ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.card_alert_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Identificação e estado
    name TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL DEFAULT 'warning'
        CHECK (severity IN ('info', 'warning', 'critical')),
    is_active BOOLEAN NOT NULL DEFAULT true,

    -- Escopo (quais cards são avaliados)
    -- Pelo menos um dos filtros pode ser null = sem filtro naquele nível
    pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES public.pipeline_phases(id) ON DELETE CASCADE,
    stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
    product TEXT,

    -- Condição JSONB DSL (ver evaluate_alert_condition)
    condition JSONB NOT NULL DEFAULT '{"type":"stage_requirements"}'::jsonb,

    -- Trigger mode
    trigger_mode TEXT NOT NULL DEFAULT 'daily_cron'
        CHECK (trigger_mode IN ('daily_cron', 'on_card_enter', 'on_card_open', 'on_field_change')),
    daily_time TIME DEFAULT '06:00',

    -- UX: templates com placeholders {titulo}, {stage_name}, {missing_fields}
    title_template TEXT NOT NULL,
    body_template TEXT,

    -- Controle de email (evita flood em regras com muitos cards)
    send_email BOOLEAN NOT NULL DEFAULT false,

    -- Auditoria
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.card_alert_rules IS
'Regras criadas pelo admin que definem alertas escalados em cards. '
'Processadas por generate_card_alerts() que cria notifications pro dono_atual_id.';

CREATE INDEX IF NOT EXISTS idx_card_alert_rules_org_active
    ON public.card_alert_rules(org_id, is_active);

CREATE INDEX IF NOT EXISTS idx_card_alert_rules_trigger_mode
    ON public.card_alert_rules(trigger_mode)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_card_alert_rules_stage_id
    ON public.card_alert_rules(stage_id)
    WHERE is_active = true AND stage_id IS NOT NULL;

-- ─── 3. updated_at trigger ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.card_alert_rules_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_card_alert_rules_updated_at ON public.card_alert_rules;
CREATE TRIGGER trg_card_alert_rules_updated_at
    BEFORE UPDATE ON public.card_alert_rules
    FOR EACH ROW
    EXECUTE FUNCTION public.card_alert_rules_set_updated_at();

-- ─── 4. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.card_alert_rules ENABLE ROW LEVEL SECURITY;

-- Leitura: todos os membros da org podem listar (UI não-admin pode querer saber)
DROP POLICY IF EXISTS "Members read org alert rules" ON public.card_alert_rules;
CREATE POLICY "Members read org alert rules"
    ON public.card_alert_rules FOR SELECT
    USING (org_id = public.requesting_org_id());

-- Escrita: só admin da org
DROP POLICY IF EXISTS "Admins insert org alert rules" ON public.card_alert_rules;
CREATE POLICY "Admins insert org alert rules"
    ON public.card_alert_rules FOR INSERT
    WITH CHECK (
        org_id = public.requesting_org_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

DROP POLICY IF EXISTS "Admins update org alert rules" ON public.card_alert_rules;
CREATE POLICY "Admins update org alert rules"
    ON public.card_alert_rules FOR UPDATE
    USING (
        org_id = public.requesting_org_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

DROP POLICY IF EXISTS "Admins delete org alert rules" ON public.card_alert_rules;
CREATE POLICY "Admins delete org alert rules"
    ON public.card_alert_rules FOR DELETE
    USING (
        org_id = public.requesting_org_id()
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- ─── 5. Registrar tipo novo em notification_type_config ─────────────────────
-- DO block pra lidar com schemas diferentes entre staging e produção
-- (produção tem coluna org_id, staging ainda não).

DO $$
DECLARE
    v_has_org_id BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notification_type_config'
          AND column_name = 'org_id'
    ) INTO v_has_org_id;

    IF v_has_org_id THEN
        INSERT INTO public.notification_type_config (type_key, label, description, icon, color, enabled, org_id)
        VALUES (
            'card_alert_rule',
            'Alertas de Cards',
            'Alertas automáticos quando um card precisa de ajuste (regras configuradas pelo admin)',
            'alert-triangle',
            'amber',
            true,
            'a0000000-0000-0000-0000-000000000001'
        )
        ON CONFLICT (type_key) DO UPDATE SET
            label = EXCLUDED.label,
            description = EXCLUDED.description,
            icon = EXCLUDED.icon,
            color = EXCLUDED.color;
    ELSE
        INSERT INTO public.notification_type_config (type_key, label, description, icon, color, enabled)
        VALUES (
            'card_alert_rule',
            'Alertas de Cards',
            'Alertas automáticos quando um card precisa de ajuste (regras configuradas pelo admin)',
            'alert-triangle',
            'amber',
            true
        )
        ON CONFLICT (type_key) DO UPDATE SET
            label = EXCLUDED.label,
            description = EXCLUDED.description,
            icon = EXCLUDED.icon,
            color = EXCLUDED.color;
    END IF;
END $$;
