import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import type { NPSPeriod } from './useNPSKpis'

export interface NPSResponseRow {
    id: string
    score: number
    comment: string | null
    proximo_destino: string | null
    responded_at: string
    card_id: string | null
    card_titulo: string | null
    contact_id: string | null
    contato_nome: string | null
    channel: string | null
    original_name: string | null
}

interface RawRow {
    id: string
    score: number
    comment: string | null
    proximo_destino: string | null
    responded_at: string
    card_id: string | null
    raw_payload: { original_name?: string; proximo_destino?: string } | null
    cards: { titulo: string | null } | null
    nps_surveys: {
        channel: string | null
        contatos: { id: string; nome: string | null; sobrenome: string | null } | null
    } | null
}

export function useNPSResponses(
    period: NPSPeriod = { start: null, end: null },
    limit = 500,
) {
    const { org } = useOrg()
    const activeOrgId = org?.id
    const startIso = period.start?.toISOString() ?? null
    const endIso = period.end?.toISOString() ?? null

    return useQuery<NPSResponseRow[]>({
        queryKey: ['nps-responses', activeOrgId, startIso, endIso, limit],
        queryFn: async () => {
            if (!activeOrgId) return []

            let query = supabase
                .from('nps_responses' as never)
                .select(`
                    id,
                    score,
                    comment,
                    proximo_destino,
                    responded_at,
                    card_id,
                    raw_payload,
                    cards(titulo),
                    nps_surveys!inner(
                        channel,
                        contatos(id, nome, sobrenome)
                    )
                `)
                .eq('org_id', activeOrgId)
                .order('responded_at', { ascending: false })
                .limit(limit)

            if (startIso) query = query.gte('responded_at', startIso)
            if (endIso) query = query.lt('responded_at', endIso)

            const { data, error } = await query

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
                    proximo_destino: row.proximo_destino ?? row.raw_payload?.proximo_destino ?? null,
                    responded_at: row.responded_at,
                    card_id: row.card_id,
                    card_titulo: row.cards?.titulo ?? null,
                    contact_id: contato?.id ?? null,
                    contato_nome: fullName,
                    channel: row.nps_surveys?.channel ?? null,
                    original_name: row.raw_payload?.original_name ?? null,
                }
            })
        },
        enabled: !!activeOrgId,
    })
}
