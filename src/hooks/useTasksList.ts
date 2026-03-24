import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { startOfDay, endOfDay, addDays, differenceInDays } from 'date-fns'
import type { TaskFilterState } from './useTaskFilters'

export interface TaskListItem {
    id: string
    titulo: string
    tipo: string
    data_vencimento: string | null
    concluida: boolean
    concluida_em: string | null
    status: string | null
    prioridade: string | null
    outcome: string | null
    resultado: string | null
    feedback: string | null
    card_id: string
    card_titulo: string
    card_produto: string | null
    contato_nome: string | null
    responsavel_id: string | null
    responsavel_nome: string | null
    /** Positive = days until due, negative = days overdue, 0 = today, null = no date */
    diff_days: number | null
}

interface UseTasksListOptions {
    filters: TaskFilterState
}

export function useTasksList({ filters }: UseTasksListOptions) {
    const { profile } = useAuth()

    return useQuery({
        queryKey: ['tasks-list', filters],
        queryFn: async () => {
            const now = new Date()

            let q = supabase
                .from('tarefas')
                .select(`
                    id, titulo, tipo, data_vencimento, concluida, concluida_em, status, prioridade, outcome, resultado, feedback, card_id, responsavel_id,
                    card:cards!tarefas_card_id_fkey(id, titulo, produto,
                        contato:contatos!cards_pessoa_principal_id_fkey(nome)
                    )
                `)
                .is('deleted_at', null)
                .order('data_vencimento', { ascending: true, nullsFirst: false })

            // Status filter
            if (filters.statusFilter === 'pending') {
                q = q.eq('concluida', false)
            } else {
                q = q.eq('concluida', true)
            }

            // Responsavel filter
            if (filters.responsavelIds.length > 0) {
                if (filters.responsavelIds.length === 1) {
                    q = q.eq('responsavel_id', filters.responsavelIds[0])
                } else {
                    q = q.in('responsavel_id', filters.responsavelIds)
                }
            }

            // Tipo filter
            if (filters.tipos.length > 0) {
                q = q.in('tipo', filters.tipos)
            }

            // Search filter (titulo)
            if (filters.search.trim()) {
                q = q.ilike('titulo', `%${filters.search.trim()}%`)
            }

            // Date range filter
            if (filters.dateFrom) {
                q = q.gte('data_vencimento', startOfDay(new Date(filters.dateFrom)).toISOString())
            }
            if (filters.dateTo) {
                q = q.lte('data_vencimento', endOfDay(new Date(filters.dateTo)).toISOString())
            }

            // Deadline quick filter (overrides date range)
            if (filters.deadlineFilter !== 'all' && !filters.dateFrom && !filters.dateTo) {
                const todayStart = startOfDay(now)
                const todayEnd = endOfDay(now)

                switch (filters.deadlineFilter) {
                    case 'overdue':
                        q = q.lt('data_vencimento', todayStart.toISOString())
                        break
                    case 'today':
                        q = q.gte('data_vencimento', todayStart.toISOString())
                            .lte('data_vencimento', todayEnd.toISOString())
                        break
                    case 'tomorrow':
                        q = q.gte('data_vencimento', startOfDay(addDays(now, 1)).toISOString())
                            .lte('data_vencimento', endOfDay(addDays(now, 1)).toISOString())
                        break
                    case 'this_week':
                        q = q.gte('data_vencimento', todayStart.toISOString())
                            .lte('data_vencimento', endOfDay(addDays(now, 7)).toISOString())
                        break
                    case 'next_week':
                        q = q.gte('data_vencimento', startOfDay(addDays(now, 7)).toISOString())
                            .lte('data_vencimento', endOfDay(addDays(now, 14)).toISOString())
                        break
                    case 'no_date':
                        q = q.is('data_vencimento', null)
                        break
                }
            }

            const { data, error } = await q.limit(500)
            if (error) throw error

            const result = data || []

            // Fetch profile names for responsavel_id
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const uniqueIds = [...new Set(result.map((t: any) => t.responsavel_id).filter(Boolean))]
            let profileMap: Record<string, string> = {}
            if (uniqueIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, nome')
                    .in('id', uniqueIds)
                profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.nome || '']))
            }

            const todayStart = startOfDay(now)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return result.map((t: any) => {
                let diff_days: number | null = null
                if (t.data_vencimento) {
                    const due = startOfDay(new Date(t.data_vencimento))
                    diff_days = differenceInDays(due, todayStart)
                }

                return {
                    id: t.id,
                    titulo: t.titulo,
                    tipo: t.tipo,
                    data_vencimento: t.data_vencimento,
                    concluida: t.concluida,
                    concluida_em: t.concluida_em,
                    status: t.status,
                    prioridade: t.prioridade,
                    outcome: t.outcome || null,
                    resultado: t.resultado || null,
                    feedback: t.feedback || null,
                    card_id: t.card?.id || t.card_id,
                    card_titulo: t.card?.titulo || '',
                    card_produto: t.card?.produto || null,
                    contato_nome: t.card?.contato?.nome || null,
                    responsavel_id: t.responsavel_id,
                    responsavel_nome: t.responsavel_id ? (profileMap[t.responsavel_id] || null) : null,
                    diff_days,
                } as TaskListItem
            })
        },
        staleTime: 1000 * 60,
        enabled: !!profile?.id,
    })
}
