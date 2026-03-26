import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { GiftItem } from './useCardGifts'

interface GiftMetricAssignment {
    id: string
    gift_type: string
    status: string
    occasion: string | null
    created_at: string
    shipped_at: string | null
    contato_id: string | null
    contato: { id: string; nome: string; sobrenome: string | null } | null
    items: Pick<GiftItem, 'id' | 'quantity' | 'unit_price_snapshot' | 'product_id' | 'product'>[]
}

export interface MonthlySpend {
    month: string // YYYY-MM
    tripCost: number
    premiumCost: number
    total: number
}

export interface TopRecipient {
    contatoId: string
    nome: string
    giftCount: number
    totalCost: number
    lastGift: string
}

export interface TopProduct {
    productId: string
    name: string
    unitsSent: number
    totalCost: number
}

/** Aggregated metrics for the Relatórios tab */
export function useGiftMetrics() {
    return useQuery({
        queryKey: ['gift-metrics'],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('card_gift_assignments')
                .select(`
                    id, gift_type, status, occasion, created_at, shipped_at, contato_id,
                    contato:contatos!card_gift_assignments_contato_id_fkey(id, nome, sobrenome),
                    items:card_gift_items(
                        id, quantity, unit_price_snapshot, product_id,
                        product:inventory_products(id, name)
                    )
                `)
                .neq('status', 'cancelado')
                .order('created_at', { ascending: false })

            if (error) throw error
            const assignments = (data || []) as GiftMetricAssignment[]

            const calcCost = (a: GiftMetricAssignment) =>
                a.items?.reduce((s, i) => s + i.quantity * i.unit_price_snapshot, 0) ?? 0

            // Current month
            const now = new Date()
            const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

            const thisMonthAssignments = assignments.filter(a => a.created_at.startsWith(thisMonthKey))
            const totalSentThisMonth = thisMonthAssignments.filter(a => a.status === 'enviado' || a.status === 'entregue').length
            const totalCostThisMonth = thisMonthAssignments.reduce((s, a) => s + calcCost(a), 0)
            const avgCostPerGift = assignments.length > 0
                ? assignments.reduce((s, a) => s + calcCost(a), 0) / assignments.length
                : 0
            const uniqueContacts = new Set(thisMonthAssignments.map(a => a.contato_id).filter(Boolean)).size

            // Monthly spend (last 6 months)
            const monthlySpend: MonthlySpend[] = []
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                const monthAssignments = assignments.filter(a => a.created_at.startsWith(key))

                const tripCost = monthAssignments.filter(a => a.gift_type === 'trip').reduce((s, a) => s + calcCost(a), 0)
                const premiumCost = monthAssignments.filter(a => a.gift_type === 'premium').reduce((s, a) => s + calcCost(a), 0)

                monthlySpend.push({ month: key, tripCost, premiumCost, total: tripCost + premiumCost })
            }

            // Top recipients
            const recipientMap = new Map<string, TopRecipient>()
            for (const a of assignments) {
                if (!a.contato_id || !a.contato) continue
                const existing = recipientMap.get(a.contato_id)
                const cost = calcCost(a)
                const nome = a.contato.sobrenome ? `${a.contato.nome} ${a.contato.sobrenome}` : a.contato.nome
                if (existing) {
                    existing.giftCount++
                    existing.totalCost += cost
                    if (a.created_at > existing.lastGift) existing.lastGift = a.created_at
                } else {
                    recipientMap.set(a.contato_id, {
                        contatoId: a.contato_id,
                        nome,
                        giftCount: 1,
                        totalCost: cost,
                        lastGift: a.created_at,
                    })
                }
            }
            const topRecipients = Array.from(recipientMap.values())
                .sort((a, b) => b.totalCost - a.totalCost)
                .slice(0, 10)

            // Top products
            const productMap = new Map<string, TopProduct>()
            for (const a of assignments) {
                for (const item of a.items || []) {
                    if (!item.product_id || !item.product) continue
                    const existing = productMap.get(item.product_id)
                    const cost = item.quantity * item.unit_price_snapshot
                    if (existing) {
                        existing.unitsSent += item.quantity
                        existing.totalCost += cost
                    } else {
                        productMap.set(item.product_id, {
                            productId: item.product_id,
                            name: item.product.name,
                            unitsSent: item.quantity,
                            totalCost: cost,
                        })
                    }
                }
            }
            const topProducts = Array.from(productMap.values())
                .sort((a, b) => b.unitsSent - a.unitsSent)
                .slice(0, 10)

            // Recent activity (last 20)
            const recentActivity = assignments.slice(0, 20).map(a => ({
                id: a.id,
                contatoNome: a.contato?.nome || 'Desconhecido',
                giftType: a.gift_type,
                status: a.status,
                occasion: a.occasion,
                cost: calcCost(a),
                date: a.created_at,
            }))

            return {
                summary: {
                    totalSentThisMonth,
                    totalCostThisMonth,
                    avgCostPerGift,
                    uniqueContacts,
                },
                monthlySpend,
                topRecipients,
                topProducts,
                recentActivity,
            }
        },
        staleTime: 1000 * 60,
    })
}
