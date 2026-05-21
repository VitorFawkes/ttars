import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export interface CardMondeVenda {
    numero: string
    qtd_produtos: number
    is_primary: boolean
    in_card: boolean
}

interface ReconcileResult {
    success: boolean
    skipped?: string
    products_inserted?: number
    products_updated?: number
    products_unchanged?: number
    products_archived?: number
    products_cancelled?: number
    products_reactivated?: number
}

// Fonte: união entre "intent" (cards.produto_data) e "state" (card_financial_items).
// - intent: o que o card declara ter (primário + histórico) — venda recém-cadastrada
//   aparece mesmo antes da planilha Monde ser importada.
// - state: itens ativos no card (defesa em profundidade: se um item ficou pendurado
//   sem estar no histórico, ainda aparece).
export function useCardMondeVendas(cardId: string | undefined) {
    return useQuery({
        queryKey: ['card-monde-vendas', cardId],
        queryFn: async (): Promise<CardMondeVenda[]> => {
            if (!cardId) return []
            const [itemsRes, cardRes] = await Promise.all([
                supabase
                    .from('card_financial_items')
                    .select('monde_venda_num')
                    .eq('card_id', cardId)
                    .is('archived_at', null)
                    .not('monde_venda_num', 'is', null),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (supabase.from('cards') as any)
                    .select('produto_data')
                    .eq('id', cardId)
                    .maybeSingle(),
            ])
            if (itemsRes.error) throw itemsRes.error
            if (cardRes.error) throw cardRes.error

            const counts = new Map<string, number>()
            for (const row of itemsRes.data ?? []) {
                const num = (row as { monde_venda_num: string | null }).monde_venda_num
                if (!num) continue
                counts.set(num, (counts.get(num) ?? 0) + 1)
            }

            const pd = (cardRes.data?.produto_data ?? {}) as {
                numero_venda_monde?: string | number | null
                numeros_venda_monde_historico?: Array<{ numero?: string | number | null }> | null
            }
            const cleanNum = (v: unknown): string | null => {
                if (v === null || v === undefined) return null
                const s = String(v).trim()
                return s ? s : null
            }
            const primary = cleanNum(pd.numero_venda_monde)
            const historico = Array.isArray(pd.numeros_venda_monde_historico)
                ? pd.numeros_venda_monde_historico
                      .map(entry => cleanNum(entry?.numero))
                      .filter((n): n is string => n !== null)
                : []

            const intentSet = new Set<string>()
            if (primary) intentSet.add(primary)
            historico.forEach(n => intentSet.add(n))

            const allNumeros = new Set<string>(intentSet)
            counts.forEach((_, n) => allNumeros.add(n))

            return Array.from(allNumeros)
                .map(numero => ({
                    numero,
                    qtd_produtos: counts.get(numero) ?? 0,
                    is_primary: numero === primary,
                    in_card: intentSet.has(numero),
                }))
                .sort((a, b) => {
                    if (a.is_primary && !b.is_primary) return -1
                    if (!a.is_primary && b.is_primary) return 1
                    return a.numero.localeCompare(b.numero)
                })
        },
        enabled: !!cardId,
        staleTime: 30_000,
    })
}

export function useReconcileMondeVenda(cardId: string | undefined) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (vendaNum: string): Promise<ReconcileResult> => {
            if (!cardId) throw new Error('cardId obrigatório')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).rpc('reconcile_card_monde_venda', {
                p_card_id: cardId,
                p_venda_num: vendaNum,
            })
            if (error) throw error
            return data as ReconcileResult
        },
        onSuccess: (result, vendaNum) => {
            if (!result.success) {
                if (result.skipped === 'no_pending_sale') {
                    toast.info(`Venda ${vendaNum}: arquivo Monde original não está mais disponível para sincronizar.`)
                } else if (result.skipped === 'card_archived') {
                    toast.error('Card arquivado — não pode receber sincronização.')
                } else {
                    toast.warning(`Venda ${vendaNum}: ${result.skipped ?? 'sem mudanças'}`)
                }
                return
            }
            const parts: string[] = []
            if (result.products_inserted) parts.push(`${result.products_inserted} novo(s)`)
            if (result.products_updated) parts.push(`${result.products_updated} atualizado(s)`)
            if (result.products_archived) parts.push(`${result.products_archived} removido(s)`)
            if (result.products_unchanged && parts.length === 0) parts.push(`${result.products_unchanged} sem mudança`)
            toast.success(`Venda ${vendaNum} sincronizada: ${parts.join(', ') || 'nada a fazer'}`)

            qc.invalidateQueries({ queryKey: ['financial-items', cardId] })
            qc.invalidateQueries({ queryKey: ['card-monde-vendas', cardId] })
            qc.invalidateQueries({ queryKey: ['pipeline-cards'] })
        },
        onError: (err: Error) => {
            toast.error(`Falha ao re-sincronizar: ${err.message}`)
        },
    })
}
