import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CardMondeVenda {
    numero: string
    qtd_produtos: number
}

/**
 * Números de venda Monde ATIVOS no card naquele momento.
 *
 * Fonte de verdade: card_financial_items.monde_venda_num das linhas com
 * archived_at IS NULL. Não usa numeros_venda_monde_historico (que é
 * apenas metadado/auditoria).
 *
 * Regra do Vitor (15/05/2026): "Os números de venda do card são SEMPRE
 * os que estão ATIVOS naquele momento — vêm da tabela de produtos."
 */
export function useCardMondeVendas(cardId: string | undefined) {
    return useQuery({
        queryKey: ['card-monde-vendas', cardId],
        queryFn: async (): Promise<CardMondeVenda[]> => {
            if (!cardId) return []
            const { data, error } = await supabase
                .from('card_financial_items')
                .select('monde_venda_num')
                .eq('card_id', cardId)
                .is('archived_at', null)
                .not('monde_venda_num', 'is', null)
            if (error) throw error
            const counts = new Map<string, number>()
            for (const row of data ?? []) {
                const num = (row as { monde_venda_num: string }).monde_venda_num
                if (!num) continue
                counts.set(num, (counts.get(num) ?? 0) + 1)
            }
            return Array.from(counts.entries())
                .map(([numero, qtd_produtos]) => ({ numero, qtd_produtos }))
                .sort((a, b) => a.numero.localeCompare(b.numero))
        },
        enabled: !!cardId,
        staleTime: 30_000,
    })
}
