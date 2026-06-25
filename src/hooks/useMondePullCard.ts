import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

interface PullResult {
    ok?: boolean
    error?: string
    sales_fetched?: number
    cards_updated?: number
    products_inserted?: number
    products_updated?: number
    products_unchanged?: number
    products_archived?: number
    products_cancelled?: number
    products_reactivated?: number
}

/**
 * "Puxar do Monde" — busca as vendas do card direto na API v3 do Monde e
 * reconcilia em card_financial_items (mesma máquina da planilha).
 * Edge function: monde-sales-import (mode: single).
 */
export function useMondePullCard(cardId: string | undefined) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (): Promise<PullResult> => {
            if (!cardId) throw new Error('cardId obrigatório')
            const { data, error } = await supabase.functions.invoke<PullResult>('monde-sales-import', {
                body: { mode: 'single', card_id: cardId },
            })
            if (error) throw error
            if (data?.error) throw new Error(data.error)
            return data ?? {}
        },
        onSuccess: (r) => {
            if (!r.sales_fetched) {
                toast.info('Nenhuma venda encontrada no Monde para este card.')
            } else {
                const parts: string[] = []
                if (r.products_inserted) parts.push(`${r.products_inserted} novo(s)`)
                if (r.products_updated) parts.push(`${r.products_updated} atualizado(s)`)
                if (r.products_archived) parts.push(`${r.products_archived} removido(s)`)
                if (r.products_cancelled) parts.push(`${r.products_cancelled} cancelado(s)`)
                if (r.products_reactivated) parts.push(`${r.products_reactivated} reativado(s)`)
                toast.success(`Monde sincronizado: ${parts.join(', ') || 'sem mudanças'}`)
            }
            qc.invalidateQueries({ queryKey: ['financial-items', cardId] })
            qc.invalidateQueries({ queryKey: ['card-monde-vendas', cardId] })
            qc.invalidateQueries({ queryKey: ['pipeline-cards'] })
        },
        onError: (err: Error) => {
            toast.error(`Falha ao puxar do Monde: ${err.message}`)
        },
    })
}
