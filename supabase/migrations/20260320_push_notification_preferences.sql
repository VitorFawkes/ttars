-- ============================================================================
-- Preferências de notificação push por usuário
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.push_notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    lead_assigned BOOLEAN DEFAULT true,
    task_expiring BOOLEAN DEFAULT true,
    task_overdue BOOLEAN DEFAULT true,
    proposal_status BOOLEAN DEFAULT true,
    meeting_reminder BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.push_notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own notification preferences"
    ON public.push_notification_preferences FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Nota: coluna reunioes.notificada_push está na migration 20260320_push_cron_meeting_reminder.sql
