import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { startOfDay, endOfDay, addDays, subDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'

import type { Database } from '../database.types'

type Product = Database['public']['Enums']['app_product']

export interface MyDayTask {
    id: string
    titulo: string
    tipo: string
    data_vencimento: string | null
    concluida: boolean
    status: string | null
    card_id: string
    card_titulo: string
    contato_nome: string | null
    responsavel_id: string | null
    responsavel_nome: string | null
}

export type DayBucket = {
    key: string
    label: string
    date: Date | null // null for 'overdue'
    tasks: MyDayTask[]
}

interface UseMyDayTasksOptions {
    productFilter: Product
    /** IDs to filter by. undefined = no filter (all). [] = no results. */
    responsavelIds?: string[]
}

/**
 * Hook that fetches pending tasks grouped into time buckets.
 * - responsavelIds = undefined → all tasks (no filter)
 * - responsavelIds = [userId] → only that user's tasks
 * - responsavelIds = [a, b, c] → tasks for those users (team or filtered)
 * - responsavelIds = [] → returns empty (waiting for data)
 */
export function useMyDayTasks({ productFilter, responsavelIds }: UseMyDayTasksOptions) {
    const { profile } = useAuth()
    const queryClient = useQueryClient()

    // Don't fire query if responsavelIds is an empty array (still loading team members, etc.)
    const isReady = responsavelIds === undefined || responsavelIds.length > 0

    const query = useQuery({
        queryKey: ['my-day-tasks', productFilter, responsavelIds],
        queryFn: async () => {
            const now = new Date()
            const rangeStart = subDays(startOfDay(now), 30)
            const rangeEnd = endOfDay(addDays(now, 7))

            let q = supabase
                .from('tarefas')
                .select(`
                    id, titulo, tipo, data_vencimento, concluida, status, card_id, responsavel_id,
                    card:cards!tarefas_card_id_fkey(id, titulo, produto, pessoa_principal_id,
                        contato:contatos!cards_pessoa_principal_id_fkey(nome)
                    )
                `)
                .eq('concluida', false)
                .is('deleted_at', null)
                .gte('data_vencimento', rangeStart.toISOString())
                .lte('data_vencimento', rangeEnd.toISOString())
                .order('data_vencimento', { ascending: true })

            // Apply responsavel filter
            if (responsavelIds !== undefined) {
                if (responsavelIds.length === 1) {
                    q = q.eq('responsavel_id', responsavelIds[0])
                } else {
                    q = q.in('responsavel_id', responsavelIds)
                }
            }

            const { data, error } = await q

            if (error) throw error

            let result = data || []

            // Filter by product
            if (productFilter) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result = result.filter((t: any) => t.card?.produto === productFilter)
            }

            // Fetch profile names for responsavel_id (no FK exists between tarefas→profiles)
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

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return result.map((t: any) => ({
                id: t.id,
                titulo: t.titulo,
                tipo: t.tipo,
                data_vencimento: t.data_vencimento,
                concluida: t.concluida,
                status: t.status,
                card_id: t.card?.id || t.card_id,
                card_titulo: t.card?.titulo || '',
                contato_nome: t.card?.contato?.nome || null,
                responsavel_id: t.responsavel_id,
                responsavel_nome: t.responsavel_id ? (profileMap[t.responsavel_id] || null) : null,
            })) as MyDayTask[]
        },
        staleTime: 1000 * 60,
        enabled: !!profile?.id && isReady,
    })

    // Complete task mutation (supports optional outcome/feedback)
    const completeMutation = useMutation({
        mutationFn: async ({ taskId, outcome, feedback }: { taskId: string; outcome?: string; feedback?: string }) => {
            const { error } = await supabase
                .from('tarefas')
                .update({
                    concluida: true,
                    concluida_em: new Date().toISOString(),
                    concluido_por: profile!.id,
                    status: 'concluida',
                    ...(outcome ? { outcome, resultado: outcome } : {}),
                    ...(feedback ? { feedback } : {}),
                })
                .eq('id', taskId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            queryClient.invalidateQueries({ queryKey: ['tasks-list'] })
            queryClient.invalidateQueries({ queryKey: ['cards'] })
            toast.success('Tarefa concluida')
        },
        onError: (error: Error) => {
            toast.error('Erro ao concluir tarefa', { description: error.message })
        },
    })

    // Group tasks into buckets
    const buckets = groupIntoBuckets(query.data || [])

    const overdue = buckets.find(b => b.key === 'overdue')?.tasks.length || 0
    const today = buckets.find(b => b.key === 'today')?.tasks.length || 0

    return {
        buckets,
        overdue,
        today,
        total: (query.data || []).length,
        isLoading: query.isLoading,
        completeTask: completeMutation.mutate,
        isCompleting: completeMutation.isPending,
        tasks: query.data || [],
    }
}

function groupIntoBuckets(tasks: MyDayTask[]): DayBucket[] {
    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)

    const buckets: DayBucket[] = []

    const overdueTasks = tasks.filter(t => {
        if (!t.data_vencimento) return false
        return new Date(t.data_vencimento) < todayStart
    })
    buckets.push({ key: 'overdue', label: 'Atrasadas', date: null, tasks: overdueTasks })

    const todayTasks = tasks.filter(t => {
        if (!t.data_vencimento) return false
        const d = new Date(t.data_vencimento)
        return d >= todayStart && d <= todayEnd
    })
    buckets.push({ key: 'today', label: 'Hoje', date: now, tasks: todayTasks })

    for (let i = 1; i <= 7; i++) {
        const day = addDays(now, i)
        const dayStart = startOfDay(day)
        const dayEnd = endOfDay(day)

        const dayTasks = tasks.filter(t => {
            if (!t.data_vencimento) return false
            const d = new Date(t.data_vencimento)
            return d >= dayStart && d <= dayEnd
        })

        const label = format(day, "EEE dd", { locale: ptBR })
            .replace(/^\w/, c => c.toUpperCase())

        buckets.push({ key: `day-${i}`, label, date: day, tasks: dayTasks })
    }

    return buckets
}
