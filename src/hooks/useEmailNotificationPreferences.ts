import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export interface EmailNotificationPreferences {
    email_notifications_enabled: boolean
    notification_types: Record<string, boolean>
}

const DEFAULT_PREFERENCES: EmailNotificationPreferences = {
    email_notifications_enabled: true,
    notification_types: {
        lead_assigned: true,
        task_due: true,
        task_overdue: true,
        proposal_status: false,
        meeting_upcoming: true,
    },
}

export function useEmailNotificationPreferences() {
    const { user, profile } = useAuth()
    const queryClient = useQueryClient()

    const query = useQuery<EmailNotificationPreferences>({
        queryKey: ['email-notification-preferences', user?.id],
        queryFn: async () => {
            if (!user) return DEFAULT_PREFERENCES
            // Tabela nova (H3-030) ainda não está em database.types.ts — usar cast
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any)
                .from('email_notification_preferences')
                .select('email_notifications_enabled, notification_types')
                .eq('user_id', user.id)
                .maybeSingle()
            if (error) throw error
            if (!data) return DEFAULT_PREFERENCES
            return {
                email_notifications_enabled: data.email_notifications_enabled as boolean,
                notification_types: (data.notification_types as Record<string, boolean>) ?? DEFAULT_PREFERENCES.notification_types,
            }
        },
        enabled: !!user,
    })

    const upsertMutation = useMutation({
        mutationFn: async (input: Partial<EmailNotificationPreferences>) => {
            if (!user || !profile?.org_id) throw new Error('Not authenticated')

            const current = query.data ?? DEFAULT_PREFERENCES
            const next = {
                email_notifications_enabled: input.email_notifications_enabled ?? current.email_notifications_enabled,
                notification_types: { ...current.notification_types, ...(input.notification_types ?? {}) },
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any)
                .from('email_notification_preferences')
                .upsert({
                    user_id: user.id,
                    org_id: profile.org_id,
                    email_notifications_enabled: next.email_notifications_enabled,
                    notification_types: next.notification_types,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id' })
            if (error) throw error

            return next
        },
        onSuccess: (next) => {
            queryClient.setQueryData(['email-notification-preferences', user?.id], next)
        },
    })

    return {
        preferences: query.data ?? DEFAULT_PREFERENCES,
        isLoading: query.isLoading,
        setGlobalEnabled: (enabled: boolean) =>
            upsertMutation.mutateAsync({ email_notifications_enabled: enabled }),
        setTypeEnabled: (type: string, enabled: boolean) =>
            upsertMutation.mutateAsync({ notification_types: { [type]: enabled } }),
        isSaving: upsertMutation.isPending,
    }
}
