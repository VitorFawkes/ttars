import { useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useCalendarFilters, getDateRange } from './useCalendarFilters'
import type { Database } from '@/database.types'

type TarefaRow = Database['public']['Tables']['tarefas']['Row']

export interface CalendarMeeting extends TarefaRow {
    duration_minutes: number
    card: {
        id: string
        titulo: string | null
        contato: { nome: string | null; sobrenome: string | null } | null
    } | null
    responsavel: {
        id: string
        nome: string | null
        email: string | null
        avatar_url: string | null
    } | null
}

function extractDuration(metadata: unknown): number {
    if (metadata && typeof metadata === 'object' && 'duration_minutes' in metadata) {
        const val = (metadata as Record<string, unknown>).duration_minutes
        if (typeof val === 'number' && val > 0) return val
    }
    return 30 // default 30 min
}

export function useCalendarMeetings() {
    const { profile } = useAuth()
    const { viewMode, currentDate, teamView, selectedUserIds, statusFilter, search } = useCalendarFilters()
    const { start, end } = getDateRange(viewMode, currentDate)

    const query = useQuery({
        queryKey: ['calendar-meetings', start, end, teamView, selectedUserIds, statusFilter, profile?.id],
        queryFn: async () => {
            // NOTE: responsavel join removed because tarefas_responsavel_id_fkey → auth.users,
            // not public.profiles. PostgREST can't do cross-schema joins.
            // We fetch profiles separately and merge client-side.
            let q = supabase
                .from('tarefas')
                .select(`
                    *,
                    card:cards!tarefas_card_id_fkey(id, titulo,
                        contato:contatos!cards_pessoa_principal_id_fkey(nome, sobrenome)
                    )
                `)
                .eq('tipo', 'reuniao')
                .is('deleted_at', null)
                .gte('data_vencimento', start)
                .lte('data_vencimento', end)
                .order('data_vencimento', { ascending: true })

            // Filter by user
            if (!teamView && profile?.id) {
                q = q.eq('responsavel_id', profile.id)
            } else if (teamView && selectedUserIds.length > 0) {
                q = q.in('responsavel_id', selectedUserIds)
            }

            // Filter by status
            if (statusFilter.length > 0) {
                q = q.in('status', statusFilter)
            }

            const { data, error } = await q
            if (error) throw error

            const rows = data || []

            // Fetch profiles for unique responsavel_ids
            const profileIds = [...new Set(rows.map(r => r.responsavel_id).filter(Boolean))] as string[]
            let profileMap = new Map<string, { id: string; nome: string | null; email: string | null; avatar_url: string | null }>()

            if (profileIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, nome, email, avatar_url')
                    .in('id', profileIds)

                if (profiles) {
                    profileMap = new Map(profiles.map(p => [p.id, p]))
                }
            }

            return rows.map((row) => ({
                ...row,
                duration_minutes: extractDuration(row.metadata),
                responsavel: row.responsavel_id ? profileMap.get(row.responsavel_id) ?? null : null,
            })) as CalendarMeeting[]
        },
        placeholderData: keepPreviousData,
        staleTime: 1000 * 60, // 1 min
        enabled: !!profile?.id,
    })

    // Client-side search filter (lightweight, avoids extra DB calls)
    const filteredData = useMemo(() => {
        if (!search || !query.data) return query.data
        const term = search.toLowerCase()
        return query.data.filter(m =>
            (m.titulo?.toLowerCase().includes(term)) ||
            (m.descricao?.toLowerCase().includes(term)) ||
            (m.card?.titulo?.toLowerCase().includes(term)) ||
            (m.responsavel?.nome?.toLowerCase().includes(term)) ||
            (m.participantes_externos?.some(p => p.toLowerCase().includes(term)))
        )
    }, [query.data, search])

    return {
        ...query,
        data: filteredData,
    }
}
