import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface DuplicateCardHit {
    id: string
    titulo: string
    produto: string
    status_comercial: string
    data_viagem_inicio: string | null
    data_viagem_fim: string | null
    valor_final: number | null
    valor_estimado: number | null
    pipeline_stage_id: string | null
    stage_nome: string | null
    phase_slug: string | null
    financial_items_count: number
    created_at: string
}

interface Params {
    pessoaPrincipalId: string | null | undefined
    produto: string | null | undefined
    dataInicio?: string | null
    dataFim?: string | null
    excludeCardId?: string | null
    enabled?: boolean
}

export function useDuplicateCardDetection({
    pessoaPrincipalId,
    produto,
    dataInicio,
    dataFim,
    excludeCardId,
    enabled = true,
}: Params) {
    return useQuery({
        queryKey: [
            'duplicate-cards',
            pessoaPrincipalId,
            produto,
            dataInicio,
            dataFim,
            excludeCardId,
        ],
        enabled: enabled && !!pessoaPrincipalId && !!produto,
        queryFn: async (): Promise<DuplicateCardHit[]> => {
            if (!pessoaPrincipalId || !produto) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC não tipada
            const { data, error } = await (supabase.rpc as any)('find_possible_duplicate_cards', {
                p_pessoa_principal_id: pessoaPrincipalId,
                p_produto: produto,
                p_data_inicio: dataInicio ?? null,
                p_data_fim: dataFim ?? null,
                p_exclude_card_id: excludeCardId ?? null,
            })
            if (error) {
                console.warn('[useDuplicateCardDetection]', error)
                return []
            }
            return (data ?? []) as DuplicateCardHit[]
        },
        staleTime: 30_000,
    })
}

export interface FundirCardsResult {
    success: boolean
    card_origem_id: string
    card_origem_titulo: string | null
    card_destino_id: string
    card_destino_titulo: string | null
    items_moved: number
    passengers_moved: number
    contatos_moved: number
    activities_moved: number
    team_moved: number
    attachments_moved: number
    destino_valor_final: number | null
    destino_receita: number | null
}

export async function fundirCards(
    cardOrigemId: string,
    cardDestinoId: string,
    motivo?: string,
): Promise<FundirCardsResult> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC não tipada
    const { data, error } = await (supabase.rpc as any)('fundir_cards', {
        p_card_origem: cardOrigemId,
        p_card_destino: cardDestinoId,
        p_motivo: motivo ?? null,
    })
    if (error) throw error
    return data as FundirCardsResult
}

export async function moverFinancialItems(
    itemIds: string[],
    cardDestinoId: string,
): Promise<{ success: boolean; items_moved: number; source_cards: string[]; destino_id: string }> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC não tipada
    const { data, error } = await (supabase.rpc as any)('mover_financial_items', {
        p_item_ids: itemIds,
        p_card_destino: cardDestinoId,
    })
    if (error) throw error
    return data as { success: boolean; items_moved: number; source_cards: string[]; destino_id: string }
}
