import { useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useProductContext } from './useProductContext'

type ProposalEvent = 'viewed' | 'accepted' | 'rejected' | 'in_progress' | 'expired'

interface ProposalNotification {
    id: string
    proposal_id: string
    status: ProposalEvent
    card_title?: string
    proposal_title?: string
    viewed_at?: string
}

const EVENT_CONFIG: Record<ProposalEvent, {
    emoji: string
    title: string
    description: (data: ProposalNotification) => string
    type: 'success' | 'warning' | 'error' | 'info'
}> = {
    viewed: {
        emoji: '👁️',
        title: 'Proposta visualizada!',
        description: (d) => `"${d.proposal_title || d.card_title}" foi visualizada pelo cliente`,
        type: 'info',
    },
    accepted: {
        emoji: '🎉',
        title: 'Proposta aceita!',
        description: (d) => `"${d.proposal_title || d.card_title}" foi aceita pelo cliente`,
        type: 'success',
    },
    rejected: {
        emoji: '❌',
        title: 'Proposta rejeitada',
        description: (d) => `"${d.proposal_title || d.card_title}" foi rejeitada`,
        type: 'error',
    },
    in_progress: {
        emoji: '⏳',
        title: 'Proposta em análise',
        description: (d) => `"${d.proposal_title || d.card_title}" está sendo analisada`,
        type: 'info',
    },
    expired: {
        emoji: '📄',
        title: 'Proposta expirada',
        description: (d) => `"${d.proposal_title || d.card_title}" expirou`,
        type: 'warning',
    },
}

/**
 * Hook to subscribe to real-time proposal status changes
 * Shows toast notifications when proposal status changes
 */
export function useProposalNotifications() {
    const queryClient = useQueryClient()
    const { currentProduct } = useProductContext()
    // Ref to access currentProduct inside the realtime callback without re-subscribing
    const currentProductRef = useRef(currentProduct)
    currentProductRef.current = currentProduct // eslint-disable-line react-hooks/refs

    const showNotification = useCallback((data: ProposalNotification) => {
        const config = EVENT_CONFIG[data.status]
        if (!config) return

        const message = `${config.emoji} ${config.title}`

        // Show toast based on type
        if (config.type === 'error') {
            toast.error(message, { description: config.description(data), duration: 6000 })
        } else if (config.type === 'success') {
            toast.success(message, { description: config.description(data), duration: 6000 })
        } else if (config.type === 'warning') {
            toast.warning(message, { description: config.description(data), duration: 6000 })
        } else {
            toast.info(message, { description: config.description(data), duration: 6000 })
        }

        // Invalidate related queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['proposals'] })
        queryClient.invalidateQueries({ queryKey: ['proposal-stats-widget'] })
        queryClient.invalidateQueries({ queryKey: ['pending-proposals-widget'] })
    }, [queryClient])

    useEffect(() => {
        // Subscribe to proposals table changes
        const channel = supabase
            .channel('proposal-notifications')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'proposals',
                },
                async (payload) => {
                    const newData = payload.new as Record<string, unknown>
                    const oldData = payload.old as Record<string, unknown>

                    // Only notify if status changed
                    if (newData.status && newData.status !== oldData.status) {
                        // Fetch additional data for notification (include produto for isolation)
                        const { data: proposalData } = await supabase
                            .from('proposals')
                            .select(`
                                id,
                                status,
                                card:cards!card_id(titulo, produto),
                                active_version:proposal_versions!active_version_id(title)
                            `)
                            .eq('id', newData.id as string)
                            .single()

                        if (proposalData) {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const pd = proposalData as any

                            // Product isolation: only show notification if card belongs to current product
                            if (pd.card?.produto && pd.card.produto !== currentProductRef.current) {
                                return
                            }

                            const notification: ProposalNotification = {
                                id: pd.id,
                                proposal_id: pd.id,
                                status: pd.status,
                                card_title: pd.card?.titulo,
                                proposal_title: pd.active_version?.title,
                            }

                            showNotification(notification)
                        }
                    }
                }
            )
            .subscribe()

        // Cleanup on unmount
        return () => {
            supabase.removeChannel(channel)
        }
    }, [showNotification])
}
