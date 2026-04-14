import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProductContext } from './useProductContext'
import { startOfDay, endOfDay, addDays, differenceInDays } from 'date-fns'
import type { TaskFilterState, TaskOrigemFilter } from './useTaskFilters'

export interface TaskListItem {
    id: string
    titulo: string
    descricao: string | null
    tipo: string
    categoria_outro: string | null
    data_vencimento: string | null
    concluida: boolean
    concluida_em: string | null
    started_at: string | null
    status: string | null
    prioridade: string | null
    outcome: string | null
    resultado: string | null
    feedback: string | null
    metadata: Record<string, unknown> | null
    rescheduled_from_id: string | null
    rescheduled_to_id: string | null
    participantes_externos: unknown
    external_source: string | null
    card_id: string
    card_titulo: string
    card_produto: string | null
    card_valor: number | null
    card_stage_nome: string | null
    card_pipeline_stage_id: string | null
    contato_id: string | null
    contato_nome: string | null
    contato_telefone: string | null
    contato_email: string | null
    responsavel_id: string | null
    responsavel_nome: string | null
    responsavel_fase_slug: string | null
    responsavel_fase_nome: string | null
    responsavel_team_id: string | null
    /** Origem derivada: manual / cadencia / automacao / integracao */
    origem: TaskOrigemFilter
    cadencia_nome: string | null
    /** Positive = days until due, negative = days overdue, 0 = today, null = no date */
    diff_days: number | null
}

interface UseTasksListOptions {
    filters: TaskFilterState
}

interface RawTaskRow {
    id: string
    titulo: string
    descricao: string | null
    tipo: string
    categoria_outro: string | null
    data_vencimento: string | null
    concluida: boolean
    concluida_em: string | null
    started_at: string | null
    status: string | null
    prioridade: string | null
    outcome: string | null
    resultado: string | null
    feedback: string | null
    metadata: Record<string, unknown> | null
    rescheduled_from_id: string | null
    rescheduled_to_id: string | null
    participantes_externos: unknown
    external_source: string | null
    card_id: string
    responsavel_id: string | null
    card?: {
        id: string
        titulo: string
        produto: string | null
        valor_estimado: number | null
        valor_final: number | null
        pipeline_stage_id: string | null
        stage?: { nome: string } | null
        contato?: { id: string; nome: string; telefone: string | null; email: string | null } | null
    } | null
}

function deriveOrigem(row: RawTaskRow): TaskOrigemFilter {
    if (row.external_source) return 'integracao'
    const meta = row.metadata
    if (meta && typeof meta === 'object') {
        const origin = (meta as Record<string, unknown>).origin
        if (origin === 'cadence' || origin === 'cadencia') return 'cadencia'
        if (origin === 'automation' || origin === 'automacao' || origin === 'event_trigger') return 'automacao'
        if ((meta as Record<string, unknown>).cadence_instance_id) return 'cadencia'
        if ((meta as Record<string, unknown>).automation_rule_id) return 'automacao'
    }
    return 'manual'
}

function deriveCadenciaNome(row: RawTaskRow): string | null {
    const meta = row.metadata
    if (!meta || typeof meta !== 'object') return null
    const m = meta as Record<string, unknown>
    const name = m.cadence_template_name || m.cadencia_nome || m.template_name
    return typeof name === 'string' ? name : null
}

export function useTasksList({ filters }: UseTasksListOptions) {
    const { profile } = useAuth()
    const { currentProduct } = useProductContext()

    return useQuery({
        queryKey: ['tasks-list', filters, currentProduct, profile?.id, profile?.team_id],
        queryFn: async () => {
            const now = new Date()

            let q = supabase
                .from('tarefas')
                .select(`
                    id, titulo, descricao, tipo, categoria_outro, data_vencimento,
                    concluida, concluida_em, started_at, status, prioridade, outcome,
                    resultado, feedback, metadata, rescheduled_from_id, rescheduled_to_id,
                    participantes_externos, external_source, card_id, responsavel_id,
                    card:cards!tarefas_card_id_fkey!inner(
                        id, titulo, produto, valor_estimado, valor_final, pipeline_stage_id,
                        stage:pipeline_stages(nome),
                        contato:contatos!cards_pessoa_principal_id_fkey(id, nome, telefone, email)
                    )
                `)
                .is('deleted_at', null)
                .order('data_vencimento', { ascending: true, nullsFirst: false })

            // Product isolation (defesa em profundidade sobre RLS)
            if (currentProduct) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                q = q.eq('card.produto', currentProduct as any)
            }

            // Status tri-estado
            if (filters.statusFilter === 'pending') {
                q = q.eq('concluida', false)
                q = q.not('status', 'eq', 'reagendada')
            } else if (filters.statusFilter === 'completed_today') {
                q = q.eq('concluida', true)
                q = q.gte('concluida_em', startOfDay(now).toISOString())
            }

            // Scope
            if (filters.scope === 'minhas' && profile?.id) {
                q = q.eq('responsavel_id', profile.id)
            } else if (filters.scope === 'meu_time' && profile?.team_id) {
                const { data: teamMembers } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('team_id', profile.team_id)
                const ids = (teamMembers || []).map(p => p.id)
                if (ids.length > 0) q = q.in('responsavel_id', ids)
            }

            if (filters.responsavelIds.length > 0) {
                if (filters.responsavelIds.length === 1) {
                    q = q.eq('responsavel_id', filters.responsavelIds[0])
                } else {
                    q = q.in('responsavel_id', filters.responsavelIds)
                }
            }

            if (filters.tipos.length > 0) q = q.in('tipo', filters.tipos)
            if (filters.prioridades.length > 0) q = q.in('prioridade', filters.prioridades)

            if (filters.search.trim()) {
                const term = filters.search.trim()
                q = q.or(`titulo.ilike.%${term}%,descricao.ilike.%${term}%`)
            }

            if (filters.dateFrom) {
                q = q.gte('data_vencimento', startOfDay(new Date(filters.dateFrom)).toISOString())
            }
            if (filters.dateTo) {
                q = q.lte('data_vencimento', endOfDay(new Date(filters.dateTo)).toISOString())
            }

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

            const result = (data || []) as unknown as RawTaskRow[]

            const uniqueIds = [...new Set(result.map(t => t.responsavel_id).filter((v): v is string => !!v))]
            let profileMap: Record<string, { nome: string; team_id: string | null; fase_slug: string | null; fase_nome: string | null }> = {}
            if (uniqueIds.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select(`
                        id, nome, team_id,
                        team:teams(phase:pipeline_phases(slug, name))
                    `)
                    .in('id', uniqueIds)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                profileMap = Object.fromEntries((profiles || []).map((p: any) => [
                    p.id,
                    {
                        nome: p.nome || '',
                        team_id: p.team_id || null,
                        fase_slug: p.team?.phase?.slug || null,
                        fase_nome: p.team?.phase?.name || null,
                    },
                ]))
            }

            const todayStart = startOfDay(now)

            const mapped: TaskListItem[] = result.map(t => {
                let diff_days: number | null = null
                if (t.data_vencimento) {
                    const due = startOfDay(new Date(t.data_vencimento))
                    diff_days = differenceInDays(due, todayStart)
                }
                const respInfo = t.responsavel_id ? profileMap[t.responsavel_id] : null

                return {
                    id: t.id,
                    titulo: t.titulo,
                    descricao: t.descricao || null,
                    tipo: t.tipo,
                    categoria_outro: t.categoria_outro || null,
                    data_vencimento: t.data_vencimento,
                    concluida: t.concluida,
                    concluida_em: t.concluida_em,
                    started_at: t.started_at,
                    status: t.status,
                    prioridade: t.prioridade,
                    outcome: t.outcome || null,
                    resultado: t.resultado || null,
                    feedback: t.feedback || null,
                    metadata: t.metadata || null,
                    rescheduled_from_id: t.rescheduled_from_id || null,
                    rescheduled_to_id: t.rescheduled_to_id || null,
                    participantes_externos: t.participantes_externos,
                    external_source: t.external_source || null,
                    card_id: t.card?.id || t.card_id,
                    card_titulo: t.card?.titulo || '',
                    card_produto: t.card?.produto || null,
                    card_valor: t.card?.valor_final ?? t.card?.valor_estimado ?? null,
                    card_stage_nome: t.card?.stage?.nome || null,
                    card_pipeline_stage_id: t.card?.pipeline_stage_id || null,
                    contato_id: t.card?.contato?.id || null,
                    contato_nome: t.card?.contato?.nome || null,
                    contato_telefone: t.card?.contato?.telefone || null,
                    contato_email: t.card?.contato?.email || null,
                    responsavel_id: t.responsavel_id,
                    responsavel_nome: respInfo?.nome || null,
                    responsavel_fase_slug: respInfo?.fase_slug || null,
                    responsavel_fase_nome: respInfo?.fase_nome || null,
                    responsavel_team_id: respInfo?.team_id || null,
                    origem: deriveOrigem(t),
                    cadencia_nome: deriveCadenciaNome(t),
                    diff_days,
                }
            })

            let filtered = mapped
            if (filters.origens.length > 0) {
                filtered = filtered.filter(t => filters.origens.includes(t.origem))
            }
            if (filters.fases.length > 0) {
                filtered = filtered.filter(t => t.responsavel_fase_slug && filters.fases.includes(t.responsavel_fase_slug))
            }

            return filtered
        },
        staleTime: 1000 * 60,
        enabled: !!profile?.id,
    })
}
