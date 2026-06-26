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
    /** Telefone informado na resposta (Typeform "Qual seu telefone?"), quando não há contato vinculado. */
    original_phone: string | null
}

interface RawAnswer {
    title?: string | null
    value?: unknown
    questionId?: string | null
}

interface RawRow {
    id: string
    score: number
    comment: string | null
    proximo_destino: string | null
    responded_at: string
    card_id: string | null
    raw_payload: { original_name?: string; proximo_destino?: string; answers?: RawAnswer[] } | null
    cards: { titulo: string | null } | null
    nps_surveys: {
        channel: string | null
        contatos: { id: string; nome: string | null; sobrenome: string | null } | null
    } | null
}

/** Extrai o telefone das respostas cruas do Typeform (campo "Qual seu telefone?"). */
function extractPhone(payload: RawRow['raw_payload']): string | null {
    const answers = payload?.answers
    if (!Array.isArray(answers)) return null
    const phoneAnswer = answers.find((a) => {
        const title = (a.title ?? '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
        return title.includes('telefone') || a.questionId === 'og97XVJEVy'
    })
    const value = phoneAnswer?.value
    return typeof value === 'string' && value.trim() ? value.trim() : null
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
                    original_phone: extractPhone(row.raw_payload),
                }
            })
        },
        enabled: !!activeOrgId,
    })
}
