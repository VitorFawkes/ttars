import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GiftAssignmentFull } from './useAllGiftAssignments'

export interface PremiumGiftRecipient {
    contatoId: string
    contatoName: string
}

export interface PremiumGiftInput {
    recipients: PremiumGiftRecipient[]
    occasion: string | null
    occasionDetail?: string
    items: { productId: string | null; customName?: string; quantity: number; unitPrice: number }[]
    deliveryAddress?: string
    deliveryDate?: string
    deliveryMethod?: string
    scheduledShipDate?: string
    budget?: number
    notes?: string
}

/** CRUD for premium gifts (gift_type = 'premium', card_id = null) */
export function usePremiumGifts(filters: { status?: string[]; occasion?: string; search?: string } = {}) {
    const queryClient = useQueryClient()
    const { profile } = useAuth()
    const queryKey = ['premium-gifts', filters]

    const { data: gifts = [], isLoading } = useQuery({
        queryKey,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabase as any).from('card_gift_assignments')
                .select(`
                    *,
                    contato:contatos!card_gift_assignments_contato_id_fkey(id, nome, sobrenome, email, telefone),
                    items:card_gift_items(
                        *,
                        product:inventory_products(id, name, sku, image_path, current_stock)
                    )
                `)
                .eq('gift_type', 'premium')
                .order('created_at', { ascending: false })

            if (filters.status?.length) {
                query = query.in('status', filters.status)
            }
            if (filters.occasion) {
                query = query.eq('occasion', filters.occasion)
            }

            const { data, error } = await query
            if (error) throw error

            let results = (data || []) as GiftAssignmentFull[]

            if (filters.search) {
                const term = filters.search.toLowerCase()
                results = results.filter(a => {
                    const nome = a.contato?.nome?.toLowerCase() || ''
                    const sobrenome = a.contato?.sobrenome?.toLowerCase() || ''
                    return nome.includes(term) || sobrenome.includes(term)
                })
            }

            return results
        },
        staleTime: 1000 * 15,
    })

    const createPremiumGift = useMutation({
        mutationFn: async (input: PremiumGiftInput) => {
            const occasionText = input.occasionDetail
                ? `${input.occasion} — ${input.occasionDetail}`
                : input.occasion

            const created: unknown[] = []

            for (const recipient of input.recipients) {
                // 1. Create assignment for this recipient
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: assignment, error: aErr } = await (supabase as any).from('card_gift_assignments')
                    .insert({
                        card_id: null,
                        contato_id: recipient.contatoId,
                        gift_type: 'premium',
                        occasion: occasionText,
                        assigned_by: profile?.id,
                        scheduled_ship_date: input.scheduledShipDate || null,
                        delivery_address: input.deliveryAddress || null,
                        delivery_date: input.deliveryDate || null,
                        delivery_method: input.deliveryMethod || null,
                        budget: input.budget || null,
                        notes: input.notes || null,
                    })
                    .select()
                    .single()
                if (aErr) throw aErr

                // 2. Add items + deduct stock (per recipient — one shipment each)
                for (const item of input.items) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { data: giftItem, error: iErr } = await (supabase as any).from('card_gift_items')
                        .insert({
                            assignment_id: assignment.id,
                            product_id: item.productId,
                            custom_name: item.customName || null,
                            quantity: item.quantity,
                            unit_price_snapshot: item.unitPrice,
                        })
                        .select()
                        .single()
                    if (iErr) throw iErr

                    if (item.productId) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const { error: movErr } = await (supabase as any).from('inventory_movements')
                            .insert({
                                product_id: item.productId,
                                quantity: -item.quantity,
                                movement_type: 'saida_gift',
                                reason: `Presente avulso — ${recipient.contatoName}`,
                                reference_id: giftItem.id,
                                performed_by: profile?.id,
                            })
                        if (movErr) throw movErr
                    }
                }

                // 3. Create shipping task if date provided
                if (input.scheduledShipDate) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { data: tarefa } = await (supabase as any).from('tarefas')
                        .insert({
                            titulo: `Enviar presente avulso — ${recipient.contatoName}`,
                            tipo: 'envio_presente',
                            data_vencimento: new Date(`${input.scheduledShipDate}T09:00:00`).toISOString(),
                            responsavel_id: profile?.id,
                            status: 'pendente',
                            concluida: false,
                            created_by: profile?.id,
                            metadata: { gift_assignment_id: assignment.id },
                        })
                        .select('id')
                        .single()

                    if (tarefa?.id) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await (supabase as any).from('card_gift_assignments')
                            .update({ tarefa_id: tarefa.id })
                            .eq('id', assignment.id)
                    }
                }

                created.push(assignment)
            }

            return created
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            queryClient.invalidateQueries({ queryKey: ['all-gift-assignments'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
            queryClient.invalidateQueries({ queryKey: ['gift-metrics'] })
        },
    })

    const duplicateGift = useMutation({
        mutationFn: async ({ sourceAssignment, newContatoId, newContatoName }: { sourceAssignment: GiftAssignmentFull; newContatoId: string; newContatoName: string }) => {
            const items = sourceAssignment.items.map(i => ({
                productId: i.product_id,
                customName: i.custom_name || undefined,
                quantity: i.quantity,
                unitPrice: i.unit_price_snapshot,
            }))

            return createPremiumGift.mutateAsync({
                recipients: [{ contatoId: newContatoId, contatoName: newContatoName }],
                occasion: sourceAssignment.occasion,
                items,
                deliveryMethod: sourceAssignment.delivery_method || undefined,
                budget: sourceAssignment.budget || undefined,
            })
        },
    })

    // Stats
    const totalCost = gifts.reduce((sum, a) =>
        sum + (a.items?.reduce((s, i) => s + i.quantity * i.unit_price_snapshot, 0) ?? 0), 0)

    const statusCounts = gifts.reduce((acc, a) => {
        acc[a.status] = (acc[a.status] || 0) + 1
        return acc
    }, {} as Record<string, number>)

    const occasionCounts = gifts.reduce((acc, a) => {
        const key = a.occasion?.split(' — ')[0] || 'Sem ocasião'
        acc[key] = (acc[key] || 0) + 1
        return acc
    }, {} as Record<string, number>)

    return {
        gifts,
        isLoading,
        createPremiumGift,
        duplicateGift,
        totalCost,
        statusCounts,
        occasionCounts,
    }
}
