import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export type MeuRascunho = {
    id: string
    contato_id: string | null
    card_id: string | null
    telefone_normalizado: string | null
    dados_lead: {
        nome_casal?: string
        telefone?: string
        data_casamento?: string
        num_convidados?: number
        investimento_total?: number
    }
    score_result: { score?: number; qualificado?: boolean; disqualified?: boolean }
    created_at: string
    updated_at: string
    card_titulo?: string | null
}

export function useMeusRascunhos() {
    const { session } = useAuth()
    const userId = session?.user?.id

    return useQuery({
        queryKey: ['sdr-meus-rascunhos', userId],
        enabled: !!userId,
        staleTime: 30_000,
        queryFn: async () => {
            if (!userId) return []
            const { data, error } = await supabase
                .from('sdr_qualifications')
                .select('id, contato_id, card_id, telefone_normalizado, dados_lead, score_result, created_at, updated_at')
                .eq('sdr_user_id', userId)
                .eq('status', 'rascunho')
                .order('updated_at', { ascending: false })
                .limit(20)
            if (error) throw error
            const rows = (data ?? []) as MeuRascunho[]
            const cardIds = rows.map((r) => r.card_id).filter(Boolean) as string[]
            if (cardIds.length) {
                const { data: cardData } = await supabase
                    .from('cards')
                    .select('id, titulo')
                    .in('id', cardIds)
                const byId = new Map((cardData ?? []).map((c) => [c.id, c.titulo]))
                rows.forEach((r) => {
                    if (r.card_id) r.card_titulo = byId.get(r.card_id) ?? null
                })
            }
            return rows
        },
    })
}

export type MeuCardSdr = {
    id: string
    titulo: string
    pessoa_nome: string | null
    pessoa_telefone: string | null
    sdr_qualification_score_latest: { score: number; qualificado: boolean; disqualified: boolean } | null
    updated_at: string
}

export function useMeusCardsSdr() {
    const { session } = useAuth()
    const userId = session?.user?.id

    return useQuery({
        queryKey: ['sdr-meus-cards', userId],
        enabled: !!userId,
        staleTime: 30_000,
        queryFn: async () => {
            if (!userId) return []
            const { data, error } = await supabase
                .from('view_cards_acoes')
                .select('id, titulo, pessoa_nome, pessoa_telefone, sdr_qualification_score_latest, updated_at, status_comercial')
                .eq('produto', 'WEDDING')
                .eq('sdr_owner_id', userId)
                .eq('status_comercial', 'aberto')
                .is('archived_at', null)
                .order('updated_at', { ascending: false })
                .limit(50)
            if (error) throw error
            return (data ?? []) as unknown as MeuCardSdr[]
        },
    })
}
