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
}

export type DayBucket = {
    key: string
    label: string
    date: Date | null // null for 'overdue'
    tasks: MyDayTask[]
}

/**
 * Hook that fetches all pending tasks for the current user
 * grouped into time buckets: overdue, today, and next 7 days
 */
export function useMyDayTasks(productFilter: Product) {
    const { profile } = useAuth()
    const queryClient = useQueryClient()

    const query = useQuery({
        queryKey: ['my-day-tasks', profile?.id, productFilter],
        queryFn: async () => {
            if (!profile?.id) return []

            const now = new Date()
            const rangeStart = subDays(startOfDay(now), 30) // up to 30 days overdue
            const rangeEnd = endOfDay(addDays(now, 7))

            const { data, error } = await supabase
                .from('tarefas')
                .select(`
                    id, titulo, tipo, data_vencimento, concluida, status, card_id, responsavel_id,
                    card:cards!tarefas_card_id_fkey(id, titulo, produto, pessoa_principal_id,
                        contato:contatos!cards_pessoa_principal_id_fkey(nome)
                    )
                `)
                .eq('responsavel_id', profile.id)
                .eq('concluida', false)
                .is('deleted_at', null)
                .gte('data_vencimento', rangeStart.toISOString())
                .lte('data_vencimento', rangeEnd.toISOString())
                .order('data_vencimento', { ascending: true })

            if (error) throw error

            let result = data || []

            // Filter by product
            if (productFilter) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result = result.filter((t: any) => t.card?.produto === productFilter)
            }

            // Map to MyDayTask
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
            })) as MyDayTask[]
        },
        staleTime: 1000 * 60, // 1 min
        enabled: !!profile?.id,
    })

    // Complete task mutation
    const completeMutation = useMutation({
        mutationFn: async (taskId: string) => {
            const { error } = await supabase
                .from('tarefas')
                .update({
                    concluida: true,
                    concluida_em: new Date().toISOString(),
                    concluido_por: profile!.id,
                })
                .eq('id', taskId)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['my-day-tasks'] })
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
            toast.success('Tarefa concluída')
        },
        onError: (error: Error) => {
            toast.error('Erro ao concluir tarefa', { description: error.message })
        },
    })

    // Group tasks into buckets
    const buckets = groupIntoBuckets(query.data || [])

    // Summary counts
    const overdue = buckets.find(b => b.key === 'overdue')?.tasks.length || 0
    const today = buckets.find(b => b.key === 'today')?.tasks.length || 0
    const weekTotal = buckets
        .filter(b => b.key !== 'overdue' && b.key !== 'today')
        .reduce((sum, b) => sum + b.tasks.length, 0)

    return {
        buckets,
        overdue,
        today,
        weekTotal,
        total: (query.data || []).length,
        isLoading: query.isLoading,
        completeTask: completeMutation.mutate,
        isCompleting: completeMutation.isPending,
    }
}

function groupIntoBuckets(tasks: MyDayTask[]): DayBucket[] {
    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)

    const buckets: DayBucket[] = []

    // Overdue bucket
    const overdueTasks = tasks.filter(t => {
        if (!t.data_vencimento) return false
        return new Date(t.data_vencimento) < todayStart
    })
    buckets.push({ key: 'overdue', label: 'Atrasadas', date: null, tasks: overdueTasks })

    // Today bucket
    const todayTasks = tasks.filter(t => {
        if (!t.data_vencimento) return false
        const d = new Date(t.data_vencimento)
        return d >= todayStart && d <= todayEnd
    })
    buckets.push({ key: 'today', label: 'Hoje', date: now, tasks: todayTasks })

    // Next 7 days (one bucket per day)
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
            .replace(/^\w/, c => c.toUpperCase()) // capitalize first letter

        buckets.push({
            key: `day-${i}`,
            label,
            date: day,
            tasks: dayTasks,
        })
    }

    return buckets
}
