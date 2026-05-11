import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { GiftItem } from './useCardGifts'

export interface GiftAssignmentFull {
    id: string
    card_id: string | null
    contato_id: string | null
    gift_type: 'trip' | 'premium'
    occasion: string | null
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
    card?: { id: string; titulo: string; produto: string | null } | null
}

export interface GiftFilters {
    status?: string[]
    giftType?: 'trip' | 'premium' | null
    search?: string
    dateFrom?: string
    dateTo?: string
}

/** Fetches ALL gift assignments (trip + premium) with filters, for the Central de Envios */
export function useAllGiftAssignments(filters: GiftFilters = {}) {
    const { data: assignments = [], isLoading } = useQuery({
        queryKey: ['all-gift-assignments', filters],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabase as any).from('card_gift_assignments')
                .select(`
                    *,
                    contato:contatos!card_gift_assignments_contato_id_fkey(id, nome, sobrenome, email, telefone),
                    card:cards!card_gift_assignments_card_id_fkey(id, titulo, produto),
                    items:card_gift_items(
                        *,
                        product:inventory_products(id, name, sku, image_path, current_stock)
                    )
                `)
                .order('scheduled_ship_date', { ascending: true, nullsFirst: false })

            if (filters.giftType) {
                query = query.eq('gift_type', filters.giftType)
            }

            if (filters.status?.length) {
                query = query.in('status', filters.status)
            }

            if (filters.dateFrom) {
                query = query.gte('scheduled_ship_date', filters.dateFrom)
            }
            if (filters.dateTo) {
                query = query.lte('scheduled_ship_date', filters.dateTo)
            }

            const { data, error } = await query
            if (error) throw error

            let results = (data || []) as GiftAssignmentFull[]

            // Client-side contact name search (PostgREST doesn't support nested text search)
            if (filters.search) {
                const term = filters.search.toLowerCase()
                results = results.filter(a => {
                    const nome = a.contato?.nome?.toLowerCase() || ''
                    const sobrenome = a.contato?.sobrenome?.toLowerCase() || ''
                    const cardTitulo = a.card?.titulo?.toLowerCase() || ''
                    return nome.includes(term) || sobrenome.includes(term) || cardTitulo.includes(term)
                })
            }

            return results
        },
        staleTime: 1000 * 15,
    })

    // KPI stats
    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const pendingCount = assignments.filter(a => a.status === 'pendente' || a.status === 'preparando').length
    const preparingCount = assignments.filter(a => a.status === 'preparando').length
    const shippedThisMonth = assignments.filter(a =>
        a.status === 'enviado' || a.status === 'entregue'
    ).filter(a => a.shipped_at && a.shipped_at >= thisMonthStart).length

    const totalCostThisMonth = assignments
        .filter(a => a.created_at >= thisMonthStart)
        .reduce((sum, a) =>
            sum + (a.items?.reduce((s, i) => s + i.quantity * i.unit_price_snapshot, 0) ?? 0), 0)

    const overdueCount = assignments.filter(a => {
        if (a.status !== 'pendente' && a.status !== 'preparando') return false
        if (!a.scheduled_ship_date) return false
        return a.scheduled_ship_date < now.toISOString().split('T')[0]
    }).length

    return {
        assignments,
        isLoading,
        stats: {
            pendingCount,
            preparingCount,
            shippedThisMonth,
            totalCostThisMonth,
            overdueCount,
        },
    }
}
