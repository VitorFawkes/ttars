import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface GiftAssignment {
    id: string
    card_id: string
    contato_id: string | null
    status: 'pendente' | 'preparando' | 'enviado' | 'entregue' | 'cancelado'
    scheduled_ship_date: string | null
    delivery_address: string | null
    delivery_date: string | null
    delivery_method: string | null
    budget: number | null
    notes: string | null
    assigned_by: string | null
    shipped_by: string | null
    shipped_at: string | null
    delivered_at: string | null
    tarefa_id: string | null
    created_at: string
    updated_at: string
    items: GiftItem[]
    contato?: { id: string; nome: string; sobrenome: string | null; email: string | null; telefone: string | null } | null
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

export function getContactDisplayName(contato: { nome: string; sobrenome: string | null } | null | undefined): string {
    if (!contato) return 'Sem contato'
    return contato.sobrenome ? `${contato.nome} ${contato.sobrenome}` : contato.nome
}

const STATUS_ORDER: GiftAssignment['status'][] = ['pendente', 'preparando', 'enviado', 'entregue']

export function getNextStatus(status: GiftAssignment['status']): GiftAssignment['status'] | null {
    const idx = STATUS_ORDER.indexOf(status)
    return idx >= 0 && idx < STATUS_ORDER.length - 1 ? STATUS_ORDER[idx + 1] : null
}

/** Per-assignment operations (used by the widget for a specific contact's gift) */
export function useGiftAssignment(assignmentId: string | undefined, cardId: string) {
    const queryClient = useQueryClient()
    const { profile } = useAuth()
    const queryKey = ['card-gifts', cardId]

    const addItem = useMutation({
        mutationFn: async (input: { productId: string; quantity: number; unitPrice: number }) => {
            if (!assignmentId) throw new Error('No assignment')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: item, error: itemErr } = await (supabase as any).from('card_gift_items')
                .insert({
                    assignment_id: assignmentId,
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
                    reason: cardId ? `Presente para card ${cardId}` : `Presente avulso`,
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
        mutationFn: async (input: { customName: string; quantity: number; unitPrice: number }) => {
            if (!assignmentId) throw new Error('No assignment')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('card_gift_items')
                .insert({
                    assignment_id: assignmentId,
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
            if (item.product_id) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: movErr } = await (supabase as any).from('inventory_movements')
                    .insert({
                        product_id: item.product_id,
                        quantity: item.quantity,
                        movement_type: 'devolucao',
                        reason: cardId ? `Removido do presente card ${cardId}` : `Removido do presente avulso`,
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

    const updateDelivery = useMutation({
        mutationFn: async (input: { delivery_address?: string; delivery_date?: string; delivery_method?: string; budget?: number; notes?: string }) => {
            if (!assignmentId) throw new Error('No assignment')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('card_gift_assignments')
                .update({ ...input, updated_at: new Date().toISOString() })
                .eq('id', assignmentId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
        },
    })

    return { addItem, addCustomItem, removeItem, updateItemNotes, updateDelivery }
}

/** Main hook: fetches all gift assignments for a card (one per contact) */
export function useCardGifts(cardId: string) {
    const queryClient = useQueryClient()
    const { profile } = useAuth()
    const queryKey = ['card-gifts', cardId]

    const { data: assignments = [], isLoading } = useQuery({
        queryKey,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('card_gift_assignments')
                .select(`
                    *,
                    contato:contatos!card_gift_assignments_contato_id_fkey(id, nome, sobrenome, email, telefone),
                    items:card_gift_items(
                        *,
                        product:inventory_products(id, name, sku, image_path, current_stock)
                    )
                `)
                .eq('card_id', cardId)
                .order('created_at', { ascending: true })
            if (error) throw error
            return (data || []) as GiftAssignment[]
        },
        enabled: !!cardId,
    })

    const createAssignment = useMutation({
        mutationFn: async (input: { contatoId: string; contatoName: string; scheduledShipDate?: string; budget?: number; notes?: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('card_gift_assignments')
                .insert({
                    card_id: cardId,
                    contato_id: input.contatoId,
                    gift_type: 'trip',
                    assigned_by: profile?.id,
                    scheduled_ship_date: input.scheduledShipDate || null,
                    budget: input.budget || null,
                    notes: input.notes || null,
                })
                .select()
                .single()
            if (error) throw error

            // Auto-create shipping task if date provided
            if (input.scheduledShipDate) {
                const tarefa = await createShipTask(cardId, data.id, input.contatoName, input.scheduledShipDate, profile?.id)
                if (tarefa?.id) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (supabase as any).from('card_gift_assignments')
                        .update({ tarefa_id: tarefa.id })
                        .eq('id', data.id)
                }
            }

            return data as GiftAssignment
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            queryClient.invalidateQueries({ queryKey: ['card-tasks'] })
        },
    })

    /** Creates assignments for multiple contacts with the same items (kit builder flow) */
    const createBulkAssignments = useMutation({
        mutationFn: async (input: {
            contacts: { id: string; name: string }[]
            items: { productId: string | null; customName?: string; quantity: number; unitPrice: number }[]
            scheduledShipDate?: string
            /** Quando preenchido, registra o presente como já enviado/entregue (backfill).
             *  Não cria movimentação de estoque nem tarefa de envio. */
            historical?: { shippedAt: string; deliveredAt: string }
        }) => {
            const results: GiftAssignment[] = []
            const historical = input.historical
            const shippedAtIso = historical ? new Date(`${historical.shippedAt}T12:00:00`).toISOString() : null
            const deliveredAtIso = historical ? new Date(`${historical.deliveredAt}T12:00:00`).toISOString() : null

            for (const contact of input.contacts) {
                // Upsert: reuse existing assignment if it exists (e.g., retry after partial failure)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { data: existing } = await (supabase as any).from('card_gift_assignments')
                    .select('id, notes')
                    .eq('card_id', cardId)
                    .eq('contato_id', contact.id)
                    .maybeSingle()

                let assignment: { id: string }
                if (existing) {
                    assignment = existing
                    if (historical) {
                        const prevNotes: string = existing.notes ?? ''
                        const noteLine = `[Histórico] enviado ${historical.shippedAt}, entregue ${historical.deliveredAt}`
                        const mergedNotes = prevNotes.includes('[Histórico]') ? prevNotes : (prevNotes ? `${noteLine}\n${prevNotes}` : noteLine)
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const { error: upErr } = await (supabase as any).from('card_gift_assignments')
                            .update({
                                status: 'entregue',
                                shipped_at: shippedAtIso,
                                shipped_by: profile?.id,
                                delivered_at: deliveredAtIso,
                                notes: mergedNotes,
                                scheduled_ship_date: null,
                            })
                            .eq('id', assignment.id)
                        if (upErr) throw upErr
                    }
                } else {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const { data: newAssignment, error: aErr } = await (supabase as any).from('card_gift_assignments')
                        .insert({
                            card_id: cardId,
                            contato_id: contact.id,
                            gift_type: 'trip',
                            assigned_by: profile?.id,
                            scheduled_ship_date: historical ? null : (input.scheduledShipDate || null),
                            ...(historical ? {
                                status: 'entregue',
                                shipped_at: shippedAtIso,
                                shipped_by: profile?.id,
                                delivered_at: deliveredAtIso,
                                notes: `[Histórico] enviado ${historical.shippedAt}, entregue ${historical.deliveredAt}`,
                            } : {}),
                        })
                        .select()
                        .single()
                    if (aErr) throw aErr
                    assignment = newAssignment
                }

                // Create task if date provided (skip in historical mode)
                if (!historical && input.scheduledShipDate) {
                    const tarefa = await createShipTask(cardId, assignment.id, contact.name, input.scheduledShipDate, profile?.id)
                    if (tarefa?.id) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        await (supabase as any).from('card_gift_assignments')
                            .update({ tarefa_id: tarefa.id })
                            .eq('id', assignment.id)
                    }
                }

                // Add items
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

                    // Stock deduction for inventory items (skip in historical mode — stock already deducted in real life)
                    if (!historical && item.productId) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const { error: movErr } = await (supabase as any).from('inventory_movements')
                            .insert({
                                product_id: item.productId,
                                quantity: -item.quantity,
                                movement_type: 'saida_gift',
                                reason: cardId ? `Presente para card ${cardId} — ${contact.name}` : `Presente — ${contact.name}`,
                                reference_id: giftItem.id,
                                performed_by: profile?.id,
                            })
                        if (movErr) throw movErr
                    }
                }

                results.push(assignment as GiftAssignment)
            }
            return results
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            queryClient.invalidateQueries({ queryKey: ['card-tasks'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
        },
    })

    const updateShipDate = useMutation({
        mutationFn: async ({ assignmentId, date, contatoName, currentTarefaId }: { assignmentId: string; date: string | null; contatoName: string; currentTarefaId: string | null }) => {
            const updates: Record<string, unknown> = {
                scheduled_ship_date: date,
                updated_at: new Date().toISOString(),
            }

            if (date && !currentTarefaId) {
                // Create new task
                const tarefa = await createShipTask(cardId, assignmentId, contatoName, date, profile?.id)
                if (tarefa?.id) updates.tarefa_id = tarefa.id
            } else if (date && currentTarefaId) {
                // Update existing task date
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase as any).from('tarefas')
                    .update({ data_vencimento: (() => { const p = new Date(`${date.slice(0, 10)}T09:00:00`); return isNaN(p.getTime()) ? null : p.toISOString() })() })
                    .eq('id', currentTarefaId)
            } else if (!date && currentTarefaId) {
                // Remove task if date cleared
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase as any).from('tarefas')
                    .delete()
                    .eq('id', currentTarefaId)
                updates.tarefa_id = null
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('card_gift_assignments')
                .update(updates)
                .eq('id', assignmentId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            queryClient.invalidateQueries({ queryKey: ['card-tasks'] })
        },
    })

    const updateStatus = useMutation({
        mutationFn: async ({ assignmentId, newStatus, items }: { assignmentId: string; newStatus: GiftAssignment['status']; items?: GiftItem[] }) => {
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

            // Return stock on cancel
            if (newStatus === 'cancelado' && items?.length) {
                for (const item of items) {
                    if (!item.product_id) continue
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await (supabase as any).from('inventory_movements').insert({
                        product_id: item.product_id,
                        quantity: item.quantity,
                        movement_type: 'devolucao',
                        reason: cardId ? `Gift cancelado - card ${cardId}` : `Gift cancelado`,
                        reference_id: item.id,
                        performed_by: profile?.id,
                    })
                }
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('card_gift_assignments')
                .update(updates)
                .eq('id', assignmentId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            queryClient.invalidateQueries({ queryKey: ['inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
            queryClient.invalidateQueries({ queryKey: ['card-tasks'] })
        },
    })

    const deleteAssignment = useMutation({
        mutationFn: async ({ assignmentId, tarefaId }: { assignmentId: string; tarefaId?: string | null }) => {
            if (tarefaId) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (supabase as any).from('tarefas').delete().eq('id', tarefaId)
            }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('card_gift_assignments')
                .delete()
                .eq('id', assignmentId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey })
            queryClient.invalidateQueries({ queryKey: ['card-tasks'] })
        },
    })

    // Summary stats
    const totalItems = assignments.reduce((sum, a) => sum + (a.items?.length ?? 0), 0)
    const totalCost = assignments.reduce((sum, a) =>
        sum + (a.items?.reduce((s, i) => s + i.quantity * i.unit_price_snapshot, 0) ?? 0), 0)

    const statusCounts = assignments.reduce((acc, a) => {
        acc[a.status] = (acc[a.status] || 0) + 1
        return acc
    }, {} as Record<string, number>)

    return {
        assignments,
        isLoading,
        createAssignment,
        createBulkAssignments,
        updateShipDate,
        updateStatus,
        deleteAssignment,
        totalItems,
        totalCost,
        statusCounts,
    }
}

/** Helper: create shipping task */
async function createShipTask(cardId: string, assignmentId: string, contatoName: string, date: string, profileId?: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('tarefas')
        .insert({
            card_id: cardId,
            titulo: `Enviar presente — ${contatoName}`,
            tipo: 'envio_presente',
            data_vencimento: (() => { const p = new Date(`${date.slice(0, 10)}T09:00:00`); return isNaN(p.getTime()) ? null : p.toISOString() })(),
            responsavel_id: profileId,
            status: 'pendente',
            concluida: false,
            created_by: profileId,
            metadata: { gift_assignment_id: assignmentId },
        })
        .select('id')
        .single()
    if (error) {
        console.error('Failed to create gift shipping task:', error)
        return null
    }
    return data as { id: string }
}
