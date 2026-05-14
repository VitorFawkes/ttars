import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useOrg } from '@/contexts/OrgContext'

export interface NPSResponseRow {
    id: string
    score: number
    comment: string | null
    responded_at: string
    card_id: string | null
    card_titulo: string | null
    contato_nome: string | null
    channel: string | null
    original_name: string | null
}

interface RawRow {
    id: string
    score: number
    comment: string | null
    responded_at: string
    card_id: string | null
    raw_payload: { original_name?: string; proximo_destino?: string } | null
    cards: { titulo: string | null } | null
    nps_surveys: {
        channel: string | null
        contatos: { nome: string | null; sobrenome: string | null } | null
    } | null
}

export function useNPSResponses(limit = 200) {
    const { org } = useOrg()
    const activeOrgId = org?.id

    return useQuery<NPSResponseRow[]>({
        queryKey: ['nps-responses', activeOrgId, limit],
        queryFn: async () => {
            if (!activeOrgId) return []

            const { data, error } = await supabase
                .from('nps_responses' as never)
                .select(`
                    id,
                    score,
                    comment,
                    responded_at,
                    card_id,
                    raw_payload,
                    cards(titulo),
                    nps_surveys!inner(
                        channel,
                        contatos(nome, sobrenome)
                    )
                `)
                .eq('org_id', activeOrgId)
                .order('responded_at', { ascending: false })
                .limit(limit)

            if (error) throw error

            return ((data as unknown as RawRow[]) ?? []).map((row) => {
                const contato = row.nps_surveys?.contatos
                const fullName = contato
                    ? [contato.nome, contato.sobrenome].filter(Boolean).join(' ').trim() || null
                    : null
                return {
                    id: row.id,
                    score: row.score,
                    comment: row.comment,
                    responded_at: row.responded_at,
                    card_id: row.card_id,
                    card_titulo: row.cards?.titulo ?? null,
                    contato_nome: fullName,
                    channel: row.nps_surveys?.channel ?? null,
                    original_name: row.raw_payload?.original_name ?? null,
                }
            })
        },
        enabled: !!activeOrgId,
    })
}
