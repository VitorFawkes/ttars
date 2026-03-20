import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { type ViewMode, type SubView, type FilterState, type GroupFilters } from './usePipelineFilters'
import type { Database } from '../database.types'
import { prepareSearchTerms } from '../lib/utils'
import { useTeamFilterMembers } from './useTeamFilterMembers'
import { useMyAssistCardIds } from './useMyAssistCardIds'

type Product = Database['public']['Enums']['app_product']
export type Card = Database['public']['Views']['view_cards_acoes']['Row']

interface UsePipelineListCardsProps {
    productFilter: Product
    viewMode: ViewMode
    subView: SubView
    filters: FilterState
    groupFilters: GroupFilters
    showClosedCards?: boolean
    phaseStageIds?: string[] // Stage IDs filtrados por phaseFilters
    page?: number
    pageSize?: number
}

interface PipelineListResult {
    data: Card[]
    total: number
    page: number
    pageSize: number
    totalPages: number
}

export function usePipelineListCards({
    productFilter,
    viewMode,
    subView,
    filters,
    groupFilters,
    showClosedCards = false,
    phaseStageIds,
    page = 1,
    pageSize = 50
}: UsePipelineListCardsProps) {
    const { session, profile } = useAuth()

    // Fetch Team Members for Team View
    // Users without team_id belong to ALL teams → skip query, show all
    const hasTeam = !!profile?.team_id
    const { data: myTeamMembers } = useQuery({
        queryKey: ['my-team-members', profile?.team_id],
        enabled: hasTeam && viewMode === 'MANAGER' && subView === 'TEAM_VIEW',
        queryFn: async () => {
            if (!profile?.team_id) return []
            const { data, error } = await supabase
                .from('profiles')
                .select('id')
                .eq('team_id', profile.team_id)
                .eq('active', true)

            if (error) throw error
            return data.map(p => p.id)
        }
    })

    // Fetch members for Team Filter (FilterDrawer teamIds)
    const { data: filteredTeamMembers } = useTeamFilterMembers(filters.teamIds)

    // Fetch card IDs where user is a team member (for includeAssists filter)
    const needsAssists = filters.includeAssists && viewMode === 'AGENT' && subView === 'MY_QUEUE'
    const { data: myAssistCardIds } = useMyAssistCardIds(needsAssists || false)

    const needsAuth = (viewMode === 'AGENT' && subView === 'MY_QUEUE') ||
        (viewMode === 'MANAGER' && subView === 'TEAM_VIEW' && hasTeam)
    const isAuthReady = !!session?.user?.id
    const isTeamReady = subView !== 'TEAM_VIEW' || !hasTeam || (myTeamMembers && myTeamMembers.length > 0)
    const isAssistsReady = !needsAssists || myAssistCardIds !== undefined
    // Aguardar RPC retornar (undefined = loading, [] = sem membros, [ids] = com membros)
    const isTeamFilterReady = !(filters.teamIds?.length) || filteredTeamMembers !== undefined

    return useQuery({
        queryKey: ['pipeline-list', productFilter, viewMode, subView, filters, groupFilters, myTeamMembers, filteredTeamMembers, myAssistCardIds, showClosedCards, phaseStageIds, page, pageSize],
        placeholderData: keepPreviousData,
        enabled: (!needsAuth || (isAuthReady && isTeamReady)) && isTeamFilterReady && isAssistsReady,
        queryFn: async (): Promise<PipelineListResult> => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- query builder perde tipo com encadeamento dinâmico
            let query = (supabase.from('view_cards_acoes') as any)
                .select('*', { count: 'exact' })

            query = query.eq('produto', productFilter)

            // Smart View Filters
            if (viewMode === 'AGENT') {
                if (subView === 'MY_QUEUE' && session?.user?.id) {
                    if (needsAssists && myAssistCardIds && myAssistCardIds.length > 0) {
                        query = query.or(`dono_atual_id.eq.${session.user.id},id.in.(${myAssistCardIds.join(',')})`)
                    } else {
                        query = query.eq('dono_atual_id', session.user.id)
                    }
                }
            } else if (viewMode === 'MANAGER') {
                if (subView === 'TEAM_VIEW') {
                    // Filter by team members if user has a team; no team = belongs to all teams
                    if (hasTeam && myTeamMembers && myTeamMembers.length > 0) {
                        query = query.in('dono_atual_id', myTeamMembers)
                    }
                    // !hasTeam → no filter applied (show all)
                }
                if (subView === 'FORECAST') {
                    const startOfMonth = new Date(); startOfMonth.setDate(1)
                    const endOfMonth = new Date(startOfMonth); endOfMonth.setMonth(endOfMonth.getMonth() + 1)
                    query = query.gte('data_fechamento', startOfMonth.toISOString()).lt('data_fechamento', endOfMonth.toISOString())
                }
            }

            // Search
            if (filters.search) {
                const { original, normalized, digitsOnly } = prepareSearchTerms(filters.search)

                if (original) {
                    const textFields = [
                        `titulo.ilike.%${original}%`,
                        `pessoa_nome.ilike.%${original}%`,
                        `origem.ilike.%${original}%`,
                        `dono_atual_nome.ilike.%${original}%`,
                        `sdr_owner_nome.ilike.%${original}%`,
                        `vendas_nome.ilike.%${original}%`,
                        `pessoa_email.ilike.%${original}%`,
                        `external_id.ilike.%${original}%`
                    ]

                    if (normalized) {
                        textFields.push(`pessoa_telefone_normalizado.ilike.%${normalized}%`)
                        textFields.push(`pessoa_telefone.ilike.%${original}%`)
                    } else if (digitsOnly) {
                        textFields.push(`pessoa_telefone_normalizado.ilike.%${digitsOnly}%`)
                        textFields.push(`pessoa_telefone.ilike.%${original}%`)
                    } else {
                        textFields.push(`pessoa_telefone.ilike.%${original}%`)
                    }

                    query = query.or(textFields.join(','))
                }
            }

            if ((filters.ownerIds?.length ?? 0) > 0) {
                query = query.in('dono_atual_id', filters.ownerIds)
            }

            if ((filters.sdrIds?.length ?? 0) > 0) {
                query = query.in('sdr_owner_id', filters.sdrIds)
            }

            if ((filters.plannerIds?.length ?? 0) > 0) {
                query = query.in('vendas_owner_id', filters.plannerIds)
            }

            if ((filters.posIds?.length ?? 0) > 0) {
                query = query.in('pos_owner_id', filters.posIds)
            }

            // Team Filter — resolve teamIds para member IDs via RPC server-side
            if ((filters.teamIds?.length ?? 0) > 0 && filteredTeamMembers !== undefined) {
                if (filteredTeamMembers.length > 0) {
                    query = query.in('dono_atual_id', filteredTeamMembers)
                } else {
                    // Time sem membros ativos — forçar zero resultados
                    query = query.in('dono_atual_id', ['00000000-0000-0000-0000-000000000000'])
                }
            }

            if (filters.startDate) {
                query = query.gte('data_viagem_inicio', filters.startDate)
            }

            if (filters.endDate) {
                query = query.lte('data_viagem_inicio', filters.endDate)
            }

            if (filters.creationStartDate) {
                query = query.gte('created_at', `${filters.creationStartDate}T00:00:00`)
            }

            if (filters.creationEndDate) {
                query = query.lte('created_at', `${filters.creationEndDate}T23:59:59`)
            }

            // Status Comercial Filter — default: só cards ativos
            if ((filters.statusComercial?.length ?? 0) > 0) {
                query = query.in('status_comercial', filters.statusComercial)
            } else if (!showClosedCards) {
                query = query.in('status_comercial', ['aberto', 'pausado'])
            }

            if ((filters.origem?.length ?? 0) > 0) {
                query = query.in('origem', filters.origem)
            }

            if (filters.noTag) {
                query = query.or('tag_ids.is.null,tag_ids.eq.{}')
            } else if ((filters.tagIds?.length ?? 0) > 0) {
                query = query.overlaps('tag_ids', filters.tagIds)
            }

            // Milestone Filter (ganho_sdr, ganho_planner, ganho_pos) — OR logic
            if ((filters.milestones?.length ?? 0) > 0) {
                const milestoneConditions = filters.milestones!.map(m => `${m}.is.true`).join(',')
                query = query.or(milestoneConditions)
            }

            // Archived Filter
            query = query.is('archived_at', null)

            // Phase Filter — filtrar por stages da fase selecionada
            if (phaseStageIds && phaseStageIds.length > 0) {
                query = query.in('pipeline_stage_id', phaseStageIds)
            } else if (phaseStageIds !== undefined && phaseStageIds.length === 0) {
                // Fase sem stages — forçar zero resultados
                query = query.in('pipeline_stage_id', ['00000000-0000-0000-0000-000000000000'])
            }

            // Exclude group parents
            query = query.eq('is_group_parent', false)

            // Group Filters (server-side para paginação correta)
            const { showLinked, showSolo } = groupFilters
            if (showLinked && !showSolo) {
                query = query.not('parent_card_id', 'is', null)
            } else if (showSolo && !showLinked) {
                query = query.is('parent_card_id', null)
            }

            // Sorting
            if (filters.sortBy && filters.sortBy !== 'data_proxima_tarefa') {
                query = query.order(filters.sortBy, { ascending: filters.sortDirection === 'asc', nullsFirst: false })
            } else {
                query = query.order('created_at', { ascending: false })
            }

            // Pagination
            const from = (page - 1) * pageSize
            const to = from + pageSize - 1
            query = query.range(from, to)

            const { data, error, count } = await query
            if (error) throw error

            const total = count || 0
            const totalPages = Math.ceil(total / pageSize)

            return {
                data: data as Card[],
                total,
                page,
                pageSize,
                totalPages
            }
        }
    })
}
