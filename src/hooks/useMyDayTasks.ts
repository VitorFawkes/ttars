import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { sbAny } from './convidados/_supabaseUntyped'
import { useAuth } from '../contexts/AuthContext'
import { startOfDay, endOfDay, addDays, subDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { formatContactName } from '../lib/contactUtils'

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
    /** 'tarefa' (nativa) | 'wedding_checklist' (tarefa do casamento, Fase 5). */
    origin?: 'tarefa' | 'wedding_checklist'
}

export type DayBucket = {
    key: string
    label: string
    date: Date | null // null for 'overdue'
    tasks: MyDayTask[]
}

interface UseMyDayTasksOptions {
    productFilter: string
    /** IDs to filter by. undefined = no filter (all). [] = no results. */
    responsavelIds?: string[]
}

/**
 * Hook that fetches pending tasks grouped into time buckets.
 * - responsavelIds = undefined → all tasks (no filter)
 * - responsavelIds = [userId] → only that user's tasks
 * - responsavelIds = [a, b, c] → tasks for those users (team or filtered)
 * - responsavelIds = [] → returns empty (waiting for data)
 *
 * Fase 5 (Weddings): quando productFilter==='WEDDING', faz uma 2ª leitura
 * (read-only) das tarefas do casamento em wedding_checklist e funde no resultado,
 * mapeando feito→concluida, prazo→data_vencimento e responsável = dono do card
 * (pos_owner_id/dono_atual_id). NÃO migra nada — wedding_checklist segue a fonte
 * única da trava/cobrança. Para Trips o bloco é pulado (comportamento idêntico).
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

            // tarefas é tabela de alto crescimento (as cobranças automáticas 🔁 do
            // Planejamento geram tarefas) e a janela [-30d,+7d] cobre TODOS os produtos
            // do workspace ANTES do filtro de produto (aplicado no cliente abaixo). Sem
            // paginar, um workspace movimentado passa de 1000 na janela e o PostgREST
            // corta em silêncio — some tarefa do "Meu Dia". Pagina por .range() com
            // ordem estável (data_vencimento + id de desempate).
            const PAGE = 1000
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let result: any[] = []
            for (let start = 0; ; start += PAGE) {
                let q = supabase
                    .from('tarefas')
                    .select(`
                        id, titulo, tipo, data_vencimento, concluida, status, card_id, responsavel_id, metadata,
                        card:cards!tarefas_card_id_fkey(id, titulo, produto, pessoa_principal_id,
                            contato:contatos!cards_pessoa_principal_id_fkey(nome, sobrenome)
                        )
                    `)
                    .eq('concluida', false)
                    .is('deleted_at', null)
                    .gte('data_vencimento', rangeStart.toISOString())
                    .lte('data_vencimento', rangeEnd.toISOString())
                    .order('data_vencimento', { ascending: true })
                    .order('id', { ascending: true })

                // Apply responsavel filter
                if (responsavelIds !== undefined) {
                    if (responsavelIds.length === 1) {
                        q = q.eq('responsavel_id', responsavelIds[0])
                    } else {
                        q = q.in('responsavel_id', responsavelIds)
                    }
                }

                const { data, error } = await q.range(start, start + PAGE - 1)
                if (error) throw error
                const page = data || []
                result.push(...page)
                if (page.length < PAGE) break
            }

            // Filter by product
            if (productFilter) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result = result.filter((t: any) => t.card?.produto === productFilter)
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nativeTasks: MyDayTask[] = result.map((t: any) => ({
                id: t.id,
                titulo: t.titulo,
                tipo: t.tipo,
                data_vencimento: t.data_vencimento,
                concluida: t.concluida,
                status: t.status,
                card_id: t.card?.id || t.card_id,
                card_titulo: t.card?.titulo || '',
                contato_nome: t.card?.contato ? (formatContactName(t.card.contato) || null) : null,
                responsavel_id: t.responsavel_id,
                responsavel_nome: null,
                origin: 'tarefa' as const,
            }))

            // ── Fase 5: tarefas do casamento (wedding_checklist) ──────────────
            // Só no workspace Weddings. Itens não-feitos COM prazo na janela
            // (sem prazo não entram numa fila por data — aparecem no Planejamento).
            let weddingTasks: MyDayTask[] = []
            if (productFilter === 'WEDDING') {
                const startDate = format(rangeStart, 'yyyy-MM-dd')
                const endDate = format(rangeEnd, 'yyyy-MM-dd')
                // wedding_checklist tem 2500+ linhas na org Weddings. Hoje a janela
                // (prazo NOT NULL) casa poucas porque os casamentos antigos estão com
                // prazo NULL — mas no dia em que o backfill de prazos rodar, a janela
                // enche e o cap de 1000 cortaria em silêncio. Pagina por .range().
                const PAGE_WC = 1000
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const wc: any[] = []
                for (let start = 0; ; start += PAGE_WC) {
                    const { data: wcPage, error: wcErr } = await sbAny
                        .from('wedding_checklist')
                        .select(`
                            id, titulo, tipo, prazo, feito, card_id,
                            card:cards!wedding_checklist_card_id_fkey(id, titulo, produto, pos_owner_id, dono_atual_id,
                                contato:contatos!cards_pessoa_principal_id_fkey(nome, sobrenome))
                        `)
                        .eq('feito', false)
                        .not('prazo', 'is', null)
                        .gte('prazo', startDate)
                        .lte('prazo', endDate)
                        .order('id', { ascending: true })
                        .range(start, start + PAGE_WC - 1)
                    if (wcErr) throw wcErr
                    const page = wcPage ?? []
                    wc.push(...page)
                    if (page.length < PAGE_WC) break
                }

                weddingTasks = wc
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((r: any) => {
                        const owner: string | null = r.card?.pos_owner_id || r.card?.dono_atual_id || null
                        return {
                            id: r.id,
                            titulo: r.titulo,
                            tipo: r.tipo,
                            data_vencimento: r.prazo ? `${String(r.prazo).slice(0, 10)}T12:00:00` : null,
                            concluida: false,
                            status: null,
                            card_id: r.card?.id || r.card_id,
                            card_titulo: r.card?.titulo || '',
                            contato_nome: r.card?.contato ? (formatContactName(r.card.contato) || null) : null,
                            responsavel_id: owner,
                            responsavel_nome: null,
                            origin: 'wedding_checklist' as const,
                        } as MyDayTask
                    })
                    // mesma régua de responsável que as nativas
                    .filter((t: MyDayTask) => {
                        if (responsavelIds === undefined) return true
                        return t.responsavel_id != null && responsavelIds.includes(t.responsavel_id)
                    })

                // Sem duplicar: se a cobrança automática já criou uma tarefa nativa
                // "🔁 Recobrar" pra este item (metadata.wedding_checklist_id), some com
                // o item original — a recobrança nativa é a ação que vale na fila.
                const coveredWcIds = new Set(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (result as any[]).map((t) => t?.metadata?.wedding_checklist_id).filter(Boolean),
                )
                weddingTasks = weddingTasks.filter((t) => !coveredWcIds.has(t.id))
            }

            const combined = [...nativeTasks, ...weddingTasks]

            // Fetch profile names for all responsavel_ids (no FK exists between tarefas→profiles)
            const uniqueIds = [...new Set(combined.map((t) => t.responsavel_id).filter(Boolean))] as string[]
            let profileMap: Record<string, string> = {}
            if (uniqueIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, nome')
                    .in('id', uniqueIds)
                profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.nome || '']))
            }

            return combined.map((t) => ({
                ...t,
                responsavel_nome: t.responsavel_id ? (profileMap[t.responsavel_id] || null) : null,
            })) as MyDayTask[]
        },
        staleTime: 1000 * 60,
        enabled: !!profile?.id && isReady,
    })

    // Lookup origin/card ao concluir (a UI só passa o id).
    const taskIndex = new Map((query.data || []).map((t) => [t.id, t]))

    // Complete task mutation (supports optional outcome/feedback)
    const completeMutation = useMutation({
        mutationFn: async ({ taskId, outcome, feedback }: { taskId: string; outcome?: string; feedback?: string }) => {
            const task = taskIndex.get(taskId)
            if (task?.origin === 'wedding_checklist') {
                // tarefa do casamento → marca feito na fonte (wedding_checklist)
                const { error } = await sbAny
                    .from('wedding_checklist')
                    .update({ feito: true })
                    .eq('id', taskId)
                if (error) throw error
                return
            }
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
            queryClient.invalidateQueries({ queryKey: ['planejamento'] })
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
