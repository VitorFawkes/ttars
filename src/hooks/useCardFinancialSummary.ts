import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/database.types'

type Card = Database['public']['Tables']['cards']['Row']

export interface FinancialItem {
    id: string
    description: string | null
    sale_value: number
    supplier_cost: number
    is_ready: boolean
    notes: string | null
    fornecedor: string | null
    representante: string | null
    documento: string | null
    data_inicio: string | null
    data_fim: string | null
    observacoes: string | null
    last_change_summary: string | null
    last_change_at: string | null
    monde_venda_num: string | null
}

export interface CardFinancialSummary {
    items: FinancialItem[]
    orcamentoPrevisto: number
    fechado: number
    falta: number
    receitaFechada: number
    marginPercent: number
    readyCount: number
    obsCount: number
    hasOrcamento: boolean
    isLoading: boolean
}

export function useCardFinancialSummary(cardId: string, card: Card): CardFinancialSummary {
    const { data: items = [], isLoading } = useQuery({
        queryKey: ['financial-items', cardId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.from('card_financial_items') as any)
                .select('id, description, sale_value, supplier_cost, is_ready, notes, fornecedor, representante, documento, data_inicio, data_fim, observacoes, last_change_summary, last_change_at, monde_venda_num')
                .eq('card_id', cardId)
                .is('archived_at', null)
                .order('created_at')
            if (error) throw error
            return (data || []) as FinancialItem[]
        },
        enabled: !!cardId,
    })

    const orcamentoPrevisto = Number(card.valor_estimado) || 0
    const fechado = items.reduce((sum, i) => sum + (Number(i.sale_value) || 0), 0)
    const falta = orcamentoPrevisto - fechado
    const receitaFechada = Number(card.receita) || 0
    const marginPercent = fechado > 0 ? (receitaFechada / fechado) * 100 : 0
    const readyCount = items.filter(i => i.is_ready).length
    const obsCount = items.filter(i => i.observacoes).length
    const hasOrcamento = orcamentoPrevisto > 0

    return {
        items,
        orcamentoPrevisto,
        fechado,
        falta,
        receitaFechada,
        marginPercent,
        readyCount,
        obsCount,
        hasOrcamento,
        isLoading,
    }
}
