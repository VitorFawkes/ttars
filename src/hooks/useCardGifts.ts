import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface GiftAssignment {
    id: string
    card_id: string
    status: 'pendente' | 'preparando' | 'enviado' | 'entregue' | 'cancelado'
    delivery_address: string | null
    delivery_date: string | null
    delivery_method: string | null
    budget: number | null
    notes: string | null
    assigned_by: string | null
    shipped_by: string | null
    shipped_at: string | null
    delivered_at: string | null
    created_at: string
    updated_at: string
    items: GiftItem[]
}

export interface GiftItem {
    id: string
    assignment_id: string
    product_id: string | null
    custom_name: string | null
    notes: string | null
    quantity: number
    unit_price_snapshot: number
    created_at: string
    product: { id: string; name: string; sku: string; image_path: string | null; current_stock: number } | null
}

export function getGiftItemName(item: GiftItem): string {
    return item.custom_name || item.product?.name || 'Item removido'
}

const STATUS_ORDER: GiftAssignment['status'][] = ['pendente', 'preparando', 'enviado', 'entregue']

export function useCardGifts(cardId: string) {
    const queryClient = useQueryClient()
    const { profile } = useAuth()
    const queryKey = ['card-gifts', cardId]

    const { data: assignment, isLoading } = useQuery({
        queryKey,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('card_gift_assignments')
                .select(`
                    *,
                    items:card_gift_items(
                        *,
                        product:inventory_products(id, name, sku, image_path, current_stock)
                    )
                `)
                .eq('card_id', cardId)
                .maybeSingle()
            if (error) throw error
            return data as GiftAssignment | null
        },
        enabled: !!cardId,
    })

    const createAssignment = useMutation({
        mutationFn: async (input?: { budget?: number; notes?: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('card_gift_assignments')
                .insert({
                    card_id: cardId,
                    assigned_by: profile?.id,
                    ...(input || {}),
                })
                .select()
                .single()
            if (error) throw error
            return data as GiftAssignment
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    const addItem = useMutation({
        mutationFn: async (input: { assignmentId: string; productId: string; quantity: number; unitPrice: number }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: item, error: itemErr } = await (supabase as any).from('card_gift_items')
                .insert({
                    assignment_id: input.assignmentId,
                    product_id: input.productId,
                    quantity: input.quantity,
                    unit_price_snapshot: input.unitPrice,
                })
                .select()
                .single()
            if (itemErr) throw itemErr

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: movErr } = await (supabase as any).from('inventory_movements')
                .insert({
                    product_id: input.productId,
                    quantity: -input.quantity,
                    movement_type: 'saida_gift',
                    reason: `Presente para card ${cardId}`,
                    reference_id: item.id,
                    performed_by: profile?.id,
                })
            if (movErr) throw movErr

            return item
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            queryClient.invalidateQueries({ queryKey: ['inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
        },
    })

    const addCustomItem = useMutation({
        mutationFn: async (input: { assignmentId: string; customName: string; quantity: number; unitPrice: number }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('card_gift_items')
                .insert({
                    assignment_id: input.assignmentId,
                    product_id: null,
                    custom_name: input.customName,
                    quantity: input.quantity,
                    unit_price_snapshot: input.unitPrice,
                })
                .select()
                .single()
            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    const removeItem = useMutation({
        mutationFn: async (item: GiftItem) => {
            // Só devolve ao estoque se for item do inventário (não customizado)
            if (item.product_id) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: movErr } = await (supabase as any).from('inventory_movements')
                    .insert({
                        product_id: item.product_id,
                        quantity: item.quantity,
                        movement_type: 'devolucao',
                        reason: `Removido do presente card ${cardId}`,
                        reference_id: item.id,
                        performed_by: profile?.id,
                    })
                if (movErr) throw movErr
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error: delErr } = await (supabase as any).from('card_gift_items')
                .delete()
                .eq('id', item.id)
            if (delErr) throw delErr
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            queryClient.invalidateQueries({ queryKey: ['inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
        },
    })

    const updateStatus = useMutation({
        mutationFn: async (newStatus: GiftAssignment['status']) => {
            if (!assignment) throw new Error('No gift assignment')

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

            // Se cancelado, devolver itens do inventário ao estoque (não customizados)
            if (newStatus === 'cancelado' && assignment.items?.length) {
                for (const item of assignment.items) {
                    if (!item.product_id) continue
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (supabase as any).from('inventory_movements').insert({
                        product_id: item.product_id,
                        quantity: item.quantity,
                        movement_type: 'devolucao',
                        reason: `Gift cancelado - card ${cardId}`,
                        reference_id: item.id,
                        performed_by: profile?.id,
                    })
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('card_gift_assignments')
                .update(updates)
                .eq('id', assignment.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            queryClient.invalidateQueries({ queryKey: ['inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
        },
    })

    const updateItemNotes = useMutation({
        mutationFn: async ({ itemId, notes }: { itemId: string; notes: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('card_gift_items')
                .update({ notes: notes || null })
                .eq('id', itemId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    const deleteAssignment = useMutation({
        mutationFn: async () => {
            if (!assignment) throw new Error('No gift assignment')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('card_gift_assignments')
                .delete()
                .eq('id', assignment.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    const updateDelivery = useMutation({
        mutationFn: async (input: { delivery_address?: string; delivery_date?: string; delivery_method?: string; budget?: number; notes?: string }) => {
            if (!assignment) throw new Error('No gift assignment')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('card_gift_assignments')
                .update({ ...input, updated_at: new Date().toISOString() })
                .eq('id', assignment.id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    const nextStatus = assignment ? STATUS_ORDER[STATUS_ORDER.indexOf(assignment.status) + 1] : null

    const totalCost = assignment?.items?.reduce((sum, i) => sum + (i.quantity * i.unit_price_snapshot), 0) ?? 0

    return {
        assignment,
        isLoading,
        createAssignment,
        addItem,
        addCustomItem,
        removeItem,
        updateItemNotes,
        updateStatus,
        updateDelivery,
        deleteAssignment,
        nextStatus,
        totalCost,
    }
}
