import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { GiftAssignmentFull } from './useAllGiftAssignments'

export interface PremiumGiftRecipient {
    contatoId: string
    contatoName: string
    /** Se preenchido, o presente é vinculado a esse card (gift_type='trip').
     *  Se null/omitido, vira presente avulso (gift_type='premium', card_id=null). */
    cardId?: string | null
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
    /** Quando preenchido, registra como já enviado/entregue (backfill).
     *  NÃO desconta do estoque atual nem cria tarefa de envio. */
    historical?: { shippedAt: string; deliveredAt: string }
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

            const historical = input.historical
            const shippedAtIso = historical ? new Date(`${historical.shippedAt}T12:00:00`).toISOString() : null
            const deliveredAtIso = historical ? new Date(`${historical.deliveredAt}T12:00:00`).toISOString() : null
            const historicalNote = historical
                ? `[Histórico] enviado ${historical.shippedAt}, entregue ${historical.deliveredAt}`
                : null
            const baseNotes = [historicalNote, input.notes].filter(Boolean).join('\n') || null

            const created: unknown[] = []

            for (const recipient of input.recipients) {
                const isLinked = !!recipient.cardId
                const giftType = isLinked ? 'trip' : 'premium'
                const reasonLabel = isLinked
                    ? `Presente — ${recipient.contatoName}`
                    : `Presente avulso — ${recipient.contatoName}`

                let assignment: { id: string }

                // Se for vinculado a card, faz upsert (UNIQUE card_id+contato_id)
                if (isLinked) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { data: existing } = await (supabase as any)
                        .from('card_gift_assignments')
                        .select('id, notes')
                        .eq('card_id', recipient.cardId)
                        .eq('contato_id', recipient.contatoId)
                        .maybeSingle()

                    if (existing) {
                        const updates: Record<string, unknown> = {
                            occasion: occasionText,
                            delivery_address: input.deliveryAddress || null,
                            delivery_date: input.deliveryDate || null,
                            delivery_method: input.deliveryMethod || null,
                            budget: input.budget || null,
                        }
                        if (historical) {
                            const prev: string = existing.notes ?? ''
                            updates.status = 'entregue'
                            updates.shipped_at = shippedAtIso
                            updates.shipped_by = profile?.id
                            updates.delivered_at = deliveredAtIso
                            updates.scheduled_ship_date = null
                            updates.notes = prev.includes('[Histórico]') ? prev : (prev ? `${historicalNote}\n${prev}` : historicalNote)
                        } else if (input.scheduledShipDate) {
                            updates.scheduled_ship_date = input.scheduledShipDate
                        }
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const { error: upErr } = await (supabase as any)
                            .from('card_gift_assignments')
                            .update(updates)
                            .eq('id', existing.id)
                        if (upErr) throw upErr
                        assignment = existing
                    } else {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const { data: newAssign, error: aErr } = await (supabase as any)
                            .from('card_gift_assignments')
                            .insert({
                                card_id: recipient.cardId,
                                contato_id: recipient.contatoId,
                                gift_type: giftType,
                                occasion: occasionText,
                                assigned_by: profile?.id,
                                scheduled_ship_date: historical ? null : (input.scheduledShipDate || null),
                                delivery_address: input.deliveryAddress || null,
                                delivery_date: input.deliveryDate || null,
                                delivery_method: input.deliveryMethod || null,
                                budget: input.budget || null,
                                notes: baseNotes,
                                ...(historical ? {
                                    status: 'entregue',
                                    shipped_at: shippedAtIso,
                                    shipped_by: profile?.id,
                                    delivered_at: deliveredAtIso,
                                } : {}),
                            })
                            .select()
                            .single()
                        if (aErr) throw aErr
                        assignment = newAssign
                    }
                } else {
                    // Avulso: sempre cria nova linha
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { data: newAssign, error: aErr } = await (supabase as any)
                        .from('card_gift_assignments')
                        .insert({
                            card_id: null,
                            contato_id: recipient.contatoId,
                            gift_type: giftType,
                            occasion: occasionText,
                            assigned_by: profile?.id,
                            scheduled_ship_date: historical ? null : (input.scheduledShipDate || null),
                            delivery_address: input.deliveryAddress || null,
                            delivery_date: input.deliveryDate || null,
                            delivery_method: input.deliveryMethod || null,
                            budget: input.budget || null,
                            notes: baseNotes,
                            ...(historical ? {
                                status: 'entregue',
                                shipped_at: shippedAtIso,
                                shipped_by: profile?.id,
                                delivered_at: deliveredAtIso,
                            } : {}),
                        })
                        .select()
                        .single()
                    if (aErr) throw aErr
                    assignment = newAssign
                }

                // 2. Add items (e desconta estoque, exceto em modo histórico)
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

                    if (!historical && item.productId) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const { error: movErr } = await (supabase as any).from('inventory_movements')
                            .insert({
                                product_id: item.productId,
                                quantity: -item.quantity,
                                movement_type: 'saida_gift',
                                reason: reasonLabel,
                                reference_id: giftItem.id,
                                performed_by: profile?.id,
                            })
                        if (movErr) throw movErr
                    }
                }

                // 3. Create shipping task if date provided (skip em histórico)
                if (!historical && input.scheduledShipDate) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { data: tarefa } = await (supabase as any).from('tarefas')
                        .insert({
                            titulo: `Enviar presente — ${recipient.contatoName}`,
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
            queryClient.invalidateQueries({ queryKey: ['card-gifts'] })
            queryClient.invalidateQueries({ queryKey: ['contact-available-cards'] })
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
