import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface NotificationTypeConfig {
    id: string
    type_key: string
    label: string
    description: string | null
    icon: string
    color: string
    enabled: boolean
    created_at: string
    updated_at: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export function useNotificationConfig() {
    const queryClient = useQueryClient()

    const { data: configs = [], isLoading } = useQuery({
        queryKey: ['notification-type-config'],
        queryFn: async () => {
            const { data, error } = await db
                .from('notification_type_config')
                .select('*')
                .order('type_key')
            if (error) throw error
            return (data ?? []) as NotificationTypeConfig[]
        },
        staleTime: 5 * 60_000,
    })

    const toggleType = useMutation({
        mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
            const { error } = await db
                .from('notification_type_config')
                .update({ enabled, updated_at: new Date().toISOString() })
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notification-type-config'] })
        },
    })

    return { configs, isLoading, toggleType }
}
