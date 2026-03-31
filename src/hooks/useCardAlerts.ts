import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface CardAlert {
    id: string
    user_id: string
    type: string
    title: string
    body: string | null
    url: string | null
    read: boolean
    card_id: string | null
    created_at: string
}

export function useCardAlerts(cardId: string) {
    const { user } = useAuth()
    const queryClient = useQueryClient()
    const queryKey = ['card-alerts', cardId]

    const { data: alerts = [], isLoading } = useQuery({
        queryKey,
        queryFn: async () => {
            if (!user?.id) return []
            const { data, error } = await db
                .from('notifications')
                .select('*')
                .eq('card_id', cardId)
                .eq('user_id', user.id)
                .eq('type', 'card_alert')
                .order('created_at', { ascending: false })
            if (error) throw error
            return (data ?? []) as CardAlert[]
        },
        enabled: !!cardId && !!user?.id,
        staleTime: 30_000,
    })

    const markAsRead = useMutation({
        mutationFn: async (alertId: string) => {
            const { error } = await db
                .from('notifications')
                .update({ read: true })
                .eq('id', alertId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] })
        },
    })

    const markAllAsRead = useMutation({
        mutationFn: async () => {
            if (!user?.id) return
            const unreadIds = alerts.filter(a => !a.read).map(a => a.id)
            if (unreadIds.length === 0) return
            const { error } = await db
                .from('notifications')
                .update({ read: true })
                .in('id', unreadIds)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] })
        },
    })

    const unreadCount = alerts.filter(a => !a.read).length

    return { alerts, isLoading, unreadCount, markAsRead, markAllAsRead }
}
