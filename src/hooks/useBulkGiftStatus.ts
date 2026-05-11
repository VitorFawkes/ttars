import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GiftItem } from './useCardGifts'

/** Bulk status update for multiple gift assignments at once */
export function useBulkGiftStatus() {
    const queryClient = useQueryClient()
    const { profile } = useAuth()

    return useMutation({
        mutationFn: async ({ assignmentIds, newStatus, assignmentItems }: {
            assignmentIds: string[]
            newStatus: 'pendente' | 'preparando' | 'enviado' | 'entregue' | 'cancelado'
            /** Items per assignment for stock return on cancel. Key = assignmentId */
            assignmentItems?: Record<string, GiftItem[]>
        }) => {
            const updates: Record<string, unknown> = {
                status: newStatus,
                updated_at: new Date().toISOString(),
            }

            if (newStatus === 'enviado') {
                updates.shipped_by = profile?.id
                updates.shipped_at = new Date().toISOString()
            } else if (newStatus === 'entregue') {
                updates.delivered_at = new Date().toISOString()
            }

            // Return stock on bulk cancel
            if (newStatus === 'cancelado' && assignmentItems) {
                for (const assignmentId of assignmentIds) {
                    const items = assignmentItems[assignmentId] || []
                    for (const item of items) {
                        if (!item.product_id) continue
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await (supabase as any).from('inventory_movements').insert({
                            product_id: item.product_id,
                            quantity: item.quantity,
                            movement_type: 'devolucao',
                            reason: `Cancelamento em lote`,
                            reference_id: item.id,
                            performed_by: profile?.id,
                        })
                    }
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('card_gift_assignments')
                .update(updates)
                .in('id', assignmentIds)
            if (error) throw error

            return { updated: assignmentIds.length }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-gift-assignments'] })
            queryClient.invalidateQueries({ queryKey: ['premium-gifts'] })
            queryClient.invalidateQueries({ queryKey: ['card-gifts'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
            queryClient.invalidateQueries({ queryKey: ['gift-metrics'] })
        },
    })
}
