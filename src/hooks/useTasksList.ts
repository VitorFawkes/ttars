import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProductContext } from './useProductContext'
import { startOfDay, endOfDay, addDays, differenceInDays, startOfWeek, endOfWeek, startOfMonth, subDays } from 'date-fns'
import type { TaskFilterState, TaskOrigemFilter, TaskPrazo } from './useTaskFilters'

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
    card_phase_slug: string | null
    card_status_comercial: string | null
    contato_id: string | null
    contato_nome: string | null
    contato_telefone: string | null
    contato_email: string | null
    responsavel_id: string | null
    responsavel_nome: string | null
    responsavel_fase_slug: string | null
    responsavel_fase_nome: string | null
    responsavel_team_id: string | null
    created_by: string | null
    created_by_nome: string | null
    concluido_por: string | null
    concluido_por_nome: string | null
    origem: TaskOrigemFilter
    cadencia_nome: string | null
    diff_days: number | null
}

interface UseTasksListOptions {
    filters: TaskFilterState
    enabled?: boolean
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
    created_by: string | null
    concluido_por: string | null
    external_id: string | null
    created_at?: string
    card?: {
        id: string
        titulo: string
        produto: string | null
        valor_estimado: number | null
        valor_final: number | null
        pipeline_stage_id: string | null
        status_comercial: string | null
        stage?: {
            nome: string | null
            phase?: { slug: string | null } | null
        } | null
        contato?: { id: string; nome: string; telefone: string | null; email: string | null } | null
    } | null
}

function deriveOrigem(row: RawTaskRow): TaskOrigemFilter {
    if (row.external_source && row.external_id) return 'integracao'
    const meta = row.metadata
    if (meta && typeof meta === 'object') {
        const m = meta as Record<string, unknown>
        const origin = m.origin
        if (origin === 'cadence' || origin === 'cadencia') return 'cadencia'
        if (origin === 'automation' || origin === 'automacao' || origin === 'event_trigger') return 'automacao'
        if (m.cadence_instance_id) return 'cadencia'
        if (m.automation_rule_id || m.created_by_trigger || m.trigger_name) return 'automacao'
    }
    return 'manual'
}

function deriveCadenciaNome(row: RawTaskRow): string | null {
    const meta = row.metadata
    if (!meta || typeof meta !== 'object') return null
    const m = meta as Record<string, unknown>
    const name = m.cadence_template_name || m.cadencia_nome || m.template_name || m.trigger_name
    return typeof name === 'string' ? name : null
}

const CANCELED_STATUSES = ['cancelada', 'cancelado', 'nao_compareceu']
const NOT_OPEN_STATUSES = '(reagendada,cancelada,cancelado,nao_compareceu)'

/**
 * Hook auxiliar — membros do time do usuário, cacheado em separado pra
 * não disparar a cada filter change.
 */
function useTeamMembers(teamId: string | null | undefined) {
    return useQuery({
        queryKey: ['team-members', teamId],
        enabled: !!teamId,
        staleTime: 5 * 60 * 1000,
        queryFn: async (): Promise<string[]> => {
            const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('team_id', teamId!)
            return (data || []).map(p => p.id)
        },
    })
}

/**
 * Hook auxiliar — perfis de todos os usuários da org com fase derivada.
 * Cache global de 5 min, evita refetch a cada query de tarefas.
 */
function useAllProfiles() {
    return useQuery({
        queryKey: ['profiles-with-phase'],
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const { data } = await supabase
                .from('profiles')
                .select(`
                    id, nome, team_id,
                    team:teams(phase:pipeline_phases(slug, name))
                `)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return Object.fromEntries((data || []).map((p: any) => [
                p.id,
                {
                    nome: p.nome || '',
                    team_id: p.team_id || null,
                    fase_slug: p.team?.phase?.slug || null,
                    fase_nome: p.team?.phase?.name || null,
                },
            ])) as Record<string, { nome: string; team_id: string | null; fase_slug: string | null; fase_nome: string | null }>
        },
    })
}

export function useTasksList({ filters, enabled = true }: UseTasksListOptions) {
    const { profile } = useAuth()
    const { currentProduct } = useProductContext()
    const { data: teamMemberIds } = useTeamMembers(filters.scope === 'meu_time' ? profile?.team_id : null)
    const { data: profileMap } = useAllProfiles()

    return useQuery({
        // profileMap incluído na key pra refazer enrichment quando ele chegar
        queryKey: ['tasks-list', filters, currentProduct, profile?.id, profile?.team_id, !!profileMap, !!teamMemberIds],
        // Tasks rodam ASSIM QUE profile.id existir. Profile/team caches carregam em paralelo
        // e enriquecem quando chegam. Não bloqueamos a lista esperando dados auxiliares.
        enabled: enabled && !!profile?.id,
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false,
        queryFn: async () => {
            const now = new Date()
            const todayStart = startOfDay(now)
            const todayEnd = endOfDay(now)

            let q = supabase
                .from('tarefas')
                .select(`
                    id, titulo, descricao, tipo, categoria_outro, data_vencimento,
                    concluida, concluida_em, started_at, status, prioridade, outcome,
                    resultado, feedback, metadata, rescheduled_from_id, rescheduled_to_id,
                    participantes_externos, external_source, external_id, card_id, responsavel_id,
                    created_by, concluido_por, created_at,
                    card:cards!tarefas_card_id_fkey!inner(
                        id, titulo, produto, valor_estimado, valor_final, pipeline_stage_id, status_comercial,
                        stage:pipeline_stages(nome, phase:pipeline_phases!pipeline_stages_phase_id_fkey(slug)),
                        contato:contatos!cards_pessoa_principal_id_fkey(id, nome, telefone, email)
                    )
                `)
                .is('deleted_at', null)
                .order('data_vencimento', { ascending: true, nullsFirst: false })

            if (currentProduct) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                q = q.eq('card.produto', currentProduct as any)
            }

            // ─── EIXO 1: ESTADO ─────────────────────────────────────────
            switch (filters.estado) {
                case 'pendentes':
                    q = q.eq('concluida', false).not('status', 'in', NOT_OPEN_STATUSES)
                    break
                case 'concluidas':
                    q = q.eq('concluida', true)
                    break
                case 'reagendadas':
                    q = q.in('status', ['reagendada'])
                    break
                case 'canceladas':
                    q = q.in('status', CANCELED_STATUSES)
                    break
                case 'tudo':
                    break
            }

            // ─── EIXO 2: PRAZOS (composição OR entre seleções) ──────────
            if ((filters.estado === 'pendentes' || filters.estado === 'tudo') && filters.prazos.length > 0) {
                const tomorrow = addDays(now, 1)
                const weekStart = startOfWeek(now, { weekStartsOn: 1 })
                const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
                const nextWeekStart = startOfWeek(addDays(now, 7), { weekStartsOn: 1 })
                const nextWeekEnd = endOfWeek(addDays(now, 7), { weekStartsOn: 1 })

                const orParts: string[] = []
                const map: Record<TaskPrazo, () => string> = {
                    atrasadas:      () => `data_vencimento.lt.${todayStart.toISOString()}`,
                    hoje:           () => `and(data_vencimento.gte.${todayStart.toISOString()},data_vencimento.lte.${todayEnd.toISOString()})`,
                    amanha:         () => `and(data_vencimento.gte.${startOfDay(tomorrow).toISOString()},data_vencimento.lte.${endOfDay(tomorrow).toISOString()})`,
                    esta_semana:    () => `and(data_vencimento.gte.${weekStart.toISOString()},data_vencimento.lte.${weekEnd.toISOString()})`,
                    proxima_semana: () => `and(data_vencimento.gte.${nextWeekStart.toISOString()},data_vencimento.lte.${nextWeekEnd.toISOString()})`,
                    sem_prazo:      () => `data_vencimento.is.null`,
                }
                for (const p of filters.prazos) {
                    orParts.push(map[p]())
                }
                if (orParts.length > 0) {
                    q = q.or(orParts.join(','))
                }
            }

            // ─── Janela de conclusão (combina com estado=concluidas) ────
            if (filters.estado === 'concluidas' && !filters.conclusaoFrom && !filters.conclusaoTo) {
                switch (filters.janelaConclusao) {
                    case 'hoje':
                        q = q.gte('concluida_em', todayStart.toISOString())
                        break
                    case 'ontem': {
                        const yesterdayStart = startOfDay(subDays(now, 1))
                        const yesterdayEnd = endOfDay(subDays(now, 1))
                        q = q.gte('concluida_em', yesterdayStart.toISOString())
                            .lte('concluida_em', yesterdayEnd.toISOString())
                        break
                    }
                    case 'esta_semana': {
                        const weekStart = startOfWeek(now, { weekStartsOn: 1 })
                        q = q.gte('concluida_em', weekStart.toISOString())
                        break
                    }
                    case 'este_mes': {
                        const monthStart = startOfMonth(now)
                        q = q.gte('concluida_em', monthStart.toISOString())
                        break
                    }
                    case 'sempre':
                    default:
                        break
                }
            }

            // ─── Períodos personalizados ─────────────────────────────────
            if (filters.conclusaoFrom) {
                q = q.gte('concluida_em', startOfDay(new Date(filters.conclusaoFrom)).toISOString())
            }
            if (filters.conclusaoTo) {
                q = q.lte('concluida_em', endOfDay(new Date(filters.conclusaoTo)).toISOString())
            }
            if (filters.criacaoFrom) {
                q = q.gte('created_at', startOfDay(new Date(filters.criacaoFrom)).toISOString())
            }
            if (filters.criacaoTo) {
                q = q.lte('created_at', endOfDay(new Date(filters.criacaoTo)).toISOString())
            }
            if (filters.vencimentoFrom) {
                q = q.gte('data_vencimento', startOfDay(new Date(filters.vencimentoFrom)).toISOString())
            }
            if (filters.vencimentoTo) {
                q = q.lte('data_vencimento', endOfDay(new Date(filters.vencimentoTo)).toISOString())
            }

            // ─── Escopo ──────────────────────────────────────────────────
            if (filters.scope === 'minhas' && profile?.id) {
                q = q.eq('responsavel_id', profile.id)
            } else if (filters.scope === 'meu_time' && teamMemberIds && teamMemberIds.length > 0) {
                q = q.in('responsavel_id', teamMemberIds)
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
            if (filters.cardStatusComercial.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                q = (q as any).in('card.status_comercial', filters.cardStatusComercial)
            }

            if (filters.search.trim()) {
                const term = filters.search.trim()
                q = q.or(`titulo.ilike.%${term}%,descricao.ilike.%${term}%`)
            }

            const { data, error } = await q.limit(500)
            if (error) throw error

            const result = (data || []) as unknown as RawTaskRow[]

            const mapped: TaskListItem[] = result.map(t => {
                let diff_days: number | null = null
                if (t.data_vencimento) {
                    const due = startOfDay(new Date(t.data_vencimento))
                    diff_days = differenceInDays(due, todayStart)
                }
                const respInfo = t.responsavel_id ? profileMap?.[t.responsavel_id] : null
                const createdByNome = t.created_by ? (profileMap?.[t.created_by]?.nome || null) : null
                const concluidoPorNome = t.concluido_por ? (profileMap?.[t.concluido_por]?.nome || null) : null

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
                    card_phase_slug: t.card?.stage?.phase?.slug || null,
                    card_status_comercial: t.card?.status_comercial || null,
                    contato_id: t.card?.contato?.id || null,
                    contato_nome: t.card?.contato?.nome || null,
                    contato_telefone: t.card?.contato?.telefone || null,
                    contato_email: t.card?.contato?.email || null,
                    responsavel_id: t.responsavel_id,
                    responsavel_nome: respInfo?.nome || null,
                    responsavel_fase_slug: respInfo?.fase_slug || null,
                    responsavel_fase_nome: respInfo?.fase_nome || null,
                    responsavel_team_id: respInfo?.team_id || null,
                    created_by: t.created_by || null,
                    created_by_nome: createdByNome,
                    concluido_por: t.concluido_por || null,
                    concluido_por_nome: concluidoPorNome,
                    origem: deriveOrigem(t),
                    cadencia_nome: deriveCadenciaNome(t),
                    diff_days,
                }
            })

            // ─── Filtros pós-query ───────────────────────────────────────
            let filtered = mapped

            if (filters.origens.length > 0) {
                filtered = filtered.filter(t => filters.origens.includes(t.origem))
            }
            if (filters.fases.length > 0) {
                filtered = filtered.filter(t => t.responsavel_fase_slug && filters.fases.includes(t.responsavel_fase_slug))
            }
            if (filters.cardFases.length > 0) {
                filtered = filtered.filter(t => t.card_phase_slug && filters.cardFases.includes(t.card_phase_slug))
            }
            if (filters.resultados.length > 0) {
                filtered = filtered.filter(t => {
                    const r = t.outcome || t.resultado
                    return r && filters.resultados.includes(r)
                })
            }
            if (filters.urgencia.length > 0) {
                filtered = filtered.filter(t => {
                    if (filters.urgencia.includes('sem_responsavel') && !t.responsavel_id) return true
                    if (filters.urgencia.includes('sem_prazo') && !t.data_vencimento) return true
                    if (filters.urgencia.includes('sem_descricao') && !t.descricao) return true
                    if (filters.urgencia.includes('sem_resultado') && t.concluida && !t.outcome && !t.resultado) return true
                    return false
                })
            }
            if (typeof filters.atrasadaMaisDias === 'number' && filters.atrasadaMaisDias > 0) {
                filtered = filtered.filter(t => t.diff_days !== null && t.diff_days < -filters.atrasadaMaisDias!)
            }

            return filtered
        },
    })
}
