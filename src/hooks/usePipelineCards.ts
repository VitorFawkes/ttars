import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { type ViewMode, type SubView, type FilterState, type GroupFilters } from './usePipelineFilters'
import type { Database } from '../database.types'
import { prepareSearchTerms } from '../lib/utils'
import { useTeamFilterMembers } from './useTeamFilterMembers'
import { useMyAssistCardIds } from './useMyAssistCardIds'
import { useAssistedCardIds, cardsAssistedByAny } from './useAssistedCardIds'

export type Card = Database['public']['Views']['view_cards_acoes']['Row']

interface UsePipelineCardsProps {
    productFilter: string
    viewMode: ViewMode
    subView: SubView
    filters: FilterState
    groupFilters: GroupFilters
    showClosedCards?: boolean
    showWonDirect?: boolean
}

export function usePipelineCards({ productFilter, viewMode, subView, filters, groupFilters, showClosedCards, showWonDirect }: UsePipelineCardsProps) {
    const { session, profile } = useAuth()

    // Fetch Team Members for Team View
    // Users without team_id belong to ALL teams → skip query, show all
    const hasTeam = !!profile?.team_id
    const { data: myTeamMembers } = useQuery({
        queryKey: ['my-team-members-peers', profile?.id],
        enabled: hasTeam && viewMode === 'MANAGER' && subView === 'TEAM_VIEW',
        queryFn: async () => {
            // RPC resolve "meu time" na org ativa + colegas (cross-org via team_members)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC types pendentes
            const { data, error } = await (supabase.rpc as any)('get_my_team_peer_ids')
            if (error) throw error
            return (data ?? []) as string[]
        }
    })

    // Fetch members for Team Filter (FilterDrawer teamIds)
    const { data: filteredTeamMembers } = useTeamFilterMembers(filters.teamIds)

    // União de todos os user IDs usados em filtros de pessoa + Team View.
    // Busca card_ids onde essas pessoas participam via card_team_members
    // (apoio/assistente) — expande o filtro para "tudo que a pessoa vê".
    const personFilterUserIds = [
        ...(filters.ownerIds || []),
        ...(filters.sdrIds || []),
        ...(filters.plannerIds || []),
        ...(filters.posIds || []),
        ...((filters.teamIds?.length ?? 0) > 0 ? (filteredTeamMembers || []) : []),
        // Team View: inclui colegas de time para apoio/assistência expand
        ...(viewMode === 'MANAGER' && subView === 'TEAM_VIEW' ? (myTeamMembers || []) : []),
        // MY_QUEUE: próprio usuário (já coberto via useMyAssistCardIds, mas mantém consistência)
    ]
    const { data: assistedMembership } = useAssistedCardIds(personFilterUserIds)

    // Fetch card IDs where user is a team member (assistências sempre visíveis em MY_QUEUE)
    const needsAssists = viewMode === 'AGENT' && subView === 'MY_QUEUE'
    const { data: myAssistCardIds } = useMyAssistCardIds(needsAssists)

    // Fetch stage IDs for user's team phase — garante que agentes veem cards na sua fase
    // mesmo sem atribuição explícita (ex: pós-venda vê todos os cards pós-venda)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const myPhaseId = (profile as any)?.team?.phase_id as string | undefined
    const { data: myPhaseStageIds } = useQuery({
        queryKey: ['my-phase-stages', myPhaseId],
        enabled: !!myPhaseId && viewMode === 'MANAGER' && subView === 'TEAM_VIEW',
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pipeline_stages')
                .select('id')
                .eq('phase_id', myPhaseId!)
                .eq('ativo', true)
            if (error) throw error
            return data.map(s => s.id)
        },
        staleTime: 10 * 60 * 1000,
    })

    // Aguardar auth antes de disparar query para evitar busca sem filtro de dono (timeout)
    const needsAuth = (viewMode === 'AGENT' && subView === 'MY_QUEUE') ||
        (viewMode === 'MANAGER' && subView === 'TEAM_VIEW' && hasTeam)
    const isAuthReady = !!session?.user?.id
    const isTeamReady = subView !== 'TEAM_VIEW' || !hasTeam || (myTeamMembers && myTeamMembers.length > 0)
    const isAssistsReady = !needsAssists || myAssistCardIds !== undefined
    // Aguardar RPC retornar (undefined = loading, [] = sem membros, [ids] = com membros)
    const isTeamFilterReady = !(filters.teamIds?.length) || filteredTeamMembers !== undefined

    const needsPhaseStages = !!myPhaseId && viewMode === 'MANAGER' && subView === 'TEAM_VIEW'
    const isPhaseStagesReady = !needsPhaseStages || myPhaseStageIds !== undefined

    // Aguardar assistencias resolverem quando há filtros de pessoa ou team view
    const needsAssistedMembership = personFilterUserIds.length > 0
    const isAssistedMembershipReady = !needsAssistedMembership || assistedMembership !== undefined

    const query = useQuery({
        queryKey: ['cards', productFilter, viewMode, subView, filters, groupFilters, myTeamMembers, filteredTeamMembers, myAssistCardIds, myPhaseStageIds, showClosedCards, showWonDirect, assistedMembership?.allCardIds.length ?? 0],
        placeholderData: keepPreviousData,
        enabled: (!needsAuth || (isAuthReady && isTeamReady)) && isTeamFilterReady && isAssistsReady && isPhaseStagesReady && isAssistedMembershipReady,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- query builder perde tipo com encadeamento dinâmico
            let query = (supabase.from('view_cards_acoes') as any)
                .select('*')

            query = query.eq('produto', productFilter)

            // Apply Smart View Filters
            if (viewMode === 'AGENT') {
                if (subView === 'MY_QUEUE') {
                    if (session?.user?.id) {
                        // Minha Fila: APENAS cards onde estou nomeado (header OU equipe do card)
                        const ownerConditions = [
                            `dono_atual_id.eq.${session.user.id}`,
                            `sdr_owner_id.eq.${session.user.id}`,
                            `vendas_owner_id.eq.${session.user.id}`,
                            `pos_owner_id.eq.${session.user.id}`,
                            `concierge_owner_id.eq.${session.user.id}`,
                        ]
                        if (myAssistCardIds && myAssistCardIds.length > 0) {
                            ownerConditions.push(`id.in.(${myAssistCardIds.join(',')})`)
                        }
                        query = query.or(ownerConditions.join(','))
                    }
                }
                // 'ATTENTION' logic would go here (e.g. overdue)
            } else if (viewMode === 'MANAGER') {
                if (subView === 'TEAM_VIEW') {
                    // Filter by team members + cards na fase do time + assistências do time
                    if (hasTeam && myTeamMembers && myTeamMembers.length > 0) {
                        const memberList = myTeamMembers.join(',')
                        const teamConditions = [
                            `dono_atual_id.in.(${memberList})`,
                            `sdr_owner_id.in.(${memberList})`,
                            `vendas_owner_id.in.(${memberList})`,
                            `pos_owner_id.in.(${memberList})`,
                            `concierge_owner_id.in.(${memberList})`,
                        ]
                        // Cards na fase do time (visibilidade automática por área)
                        if (myPhaseStageIds && myPhaseStageIds.length > 0) {
                            teamConditions.push(`pipeline_stage_id.in.(${myPhaseStageIds.join(',')})`)
                        }
                        // Cards onde colegas de time são apoio/assistente
                        const teamAssisted = cardsAssistedByAny(assistedMembership, myTeamMembers)
                        if (teamAssisted.length > 0) {
                            teamConditions.push(`id.in.(${teamAssisted.join(',')})`)
                        }
                        query = query.or(teamConditions.join(','))
                    }
                    // !hasTeam → no filter applied (show all, same as belonging to all teams)
                }
                if (subView === 'FORECAST') {
                    // Filter by closing_date this month
                    const startOfMonth = new Date(); startOfMonth.setDate(1);
                    const endOfMonth = new Date(startOfMonth); endOfMonth.setMonth(endOfMonth.getMonth() + 1);
                    query = query.gte('data_fechamento', startOfMonth.toISOString()).lt('data_fechamento', endOfMonth.toISOString())
                }
            }

            // Apply Advanced Filters (from Drawer) - SMART SEARCH
            if (filters.search) {
                const { original, normalized, digitsOnly } = prepareSearchTerms(filters.search)

                if (original) {
                    // Campos de texto padrão
                    const textFields = [
                        `titulo.ilike.%${original}%`,
                        `pessoa_nome.ilike.%${original}%`,
                        `origem.ilike.%${original}%`,
                        `dono_atual_nome.ilike.%${original}%`,
                        `sdr_owner_nome.ilike.%${original}%`,
                        `vendas_nome.ilike.%${original}%`,
                        `concierge_nome.ilike.%${original}%`,
                        `pessoa_email.ilike.%${original}%`,
                        `external_id.ilike.%${original}%`
                    ]

                    // Busca de telefone — usa coluna normalizada (digits-only) para match cross-formato
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

            // Filtros por pessoa: cada filtro matcha owner-column OU apoio (card_team_members).
            // "Tudo que a pessoa vê" = dona/responsável + cards onde ela é apoio/assistente.
            const applyPersonFilter = (userIds: string[], ownerCol: string) => {
                const conds = [`${ownerCol}.in.(${userIds.join(',')})`]
                const assisted = cardsAssistedByAny(assistedMembership, userIds)
                if (assisted.length > 0) conds.push(`id.in.(${assisted.join(',')})`)
                query = query.or(conds.join(','))
            }

            if ((filters.ownerIds?.length ?? 0) > 0) {
                applyPersonFilter(filters.ownerIds!, 'dono_atual_id')
            }
            if ((filters.sdrIds?.length ?? 0) > 0) {
                applyPersonFilter(filters.sdrIds!, 'sdr_owner_id')
            }
            if ((filters.plannerIds?.length ?? 0) > 0) {
                applyPersonFilter(filters.plannerIds!, 'vendas_owner_id')
            }
            if ((filters.posIds?.length ?? 0) > 0) {
                applyPersonFilter(filters.posIds!, 'pos_owner_id')
            }

            // Team Filter — resolve teamIds para member IDs via RPC server-side
            if ((filters.teamIds?.length ?? 0) > 0 && filteredTeamMembers !== undefined) {
                if (filteredTeamMembers.length > 0) {
                    const memberList = filteredTeamMembers.join(',')
                    const assisted = cardsAssistedByAny(assistedMembership, filteredTeamMembers)
                    const conds = [
                        `dono_atual_id.in.(${memberList})`,
                        `sdr_owner_id.in.(${memberList})`,
                        `vendas_owner_id.in.(${memberList})`,
                        `pos_owner_id.in.(${memberList})`,
                        `concierge_owner_id.in.(${memberList})`,
                    ]
                    if (assisted.length > 0) conds.push(`id.in.(${assisted.join(',')})`)
                    query = query.or(conds.join(','))
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

            // NEW: Creation Date Filter (TIMESTAMP)
            if (filters.creationStartDate) {
                query = query.gte('created_at', `${filters.creationStartDate}T00:00:00`)
            }

            if (filters.creationEndDate) {
                query = query.lte('created_at', `${filters.creationEndDate}T23:59:59`)
            }

            // Status Comercial Filter
            // Toggle "Sem Pós" mostra APENAS ganhos diretos (ganho no Planner, sem ir para Pós-venda)
            if (showWonDirect) {
                query = query
                    .eq('status_comercial', 'ganho')
                    .eq('ganho_planner', true)
                    .eq('ganho_pos', false)
                    .neq('phase_slug', 'pos_venda')
            } else if ((filters.statusComercial?.length ?? 0) > 0) {
                query = query.in('status_comercial', filters.statusComercial)
            } else if (!showClosedCards) {
                query = query.in('status_comercial', ['aberto'])
            }

            // Origem Filter
            if ((filters.origem?.length ?? 0) > 0) {
                query = query.in('origem', filters.origem)
            }

            // Tag Filter
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

            // Closing Date Filter
            if (filters.closingStartDate) {
                query = query.gte('data_fechamento', filters.closingStartDate)
            }
            if (filters.closingEndDate) {
                query = query.lte('data_fechamento', filters.closingEndDate)
            }

            // Prioridade Filter
            if ((filters.prioridade?.length ?? 0) > 0) {
                query = query.in('prioridade', filters.prioridade)
            }

            // Status Taxa Filter
            if ((filters.statusTaxa?.length ?? 0) > 0) {
                query = query.in('status_taxa', filters.statusTaxa)
            }

            // Cliente Recorrente Filter
            if (filters.clienteRecorrente === 'sim') {
                query = query.eq('cliente_recorrente', true)
            } else if (filters.clienteRecorrente === 'nao') {
                query = query.or('cliente_recorrente.is.null,cliente_recorrente.eq.false')
            }

            // Smart Field Filters — campos preenchidos (NOT NULL)
            // Campos JSONB (dentro de produto_data) são tratados client-side
            const JSONB_FIELDS = new Set(['numero_venda_monde'])

            if ((filters.filledFields?.length ?? 0) > 0) {
                for (const field of filters.filledFields!) {
                    if (!JSONB_FIELDS.has(field)) {
                        query = query.not(field, 'is', null)
                    }
                }
            }

            // Smart Field Filters — campos vazios (IS NULL)
            if ((filters.emptyFields?.length ?? 0) > 0) {
                for (const field of filters.emptyFields!) {
                    if (!JSONB_FIELDS.has(field)) {
                        query = query.is(field, null)
                    }
                }
            }

            // Archived Filter — esconder cards arquivados do pipeline
            query = query.is('archived_at', null)

            // Apply Sorting
            if (filters.sortBy && filters.sortBy !== 'data_proxima_tarefa') {
                query = query.order(filters.sortBy, { ascending: filters.sortDirection === 'asc', nullsFirst: false })
            } else {
                query = query.order('created_at', { ascending: false })
            }

            const { data, error } = await query
            if (error) throw error

            let filteredData = data as Card[]

            // Apply Group Filters (Client-side for flexibility)
            const { showGroupMembers, showSubCards, showSolo } = groupFilters

            filteredData = filteredData.filter(card => {
                // ALWAYS exclude Group Parents from Kanban/List
                if (card.is_group_parent) return false

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const cardType = (card as any).card_type as string | null
                const isSubCard = cardType === 'sub_card'
                const isGroupMember = !!card.parent_card_id && !isSubCard
                const isSolo = !card.parent_card_id

                if (isGroupMember && showGroupMembers) return true
                if (isSubCard && showSubCards) return true
                if (isSolo && showSolo) return true

                return false
            })

            // Anexos Filter (client-side — usa anexos_count da view)
            if ((filters.docStatus?.length ?? 0) > 0) {
                filteredData = filteredData.filter(card => {
                    const count = Number((card as unknown as Record<string, unknown>).anexos_count) || 0
                    if (count === 0) return filters.docStatus!.includes('sem_anexos')
                    return filters.docStatus!.includes('com_anexos')
                })
            }

            // JSONB Smart Field Filters (client-side — campos dentro de produto_data)
            const jsonbFilled = filters.filledFields?.filter(f => JSONB_FIELDS.has(f)) ?? []
            const jsonbEmpty = filters.emptyFields?.filter(f => JSONB_FIELDS.has(f)) ?? []
            if (jsonbFilled.length > 0 || jsonbEmpty.length > 0) {
                filteredData = filteredData.filter(card => {
                    const pd = card.produto_data as Record<string, unknown> | null
                    for (const field of jsonbFilled) {
                        const val = pd?.[field]
                        if (val == null || val === '') return false
                    }
                    for (const field of jsonbEmpty) {
                        const val = pd?.[field]
                        if (val != null && val !== '') return false
                    }
                    return true
                })
            }

            // Task Status Filter (client-side — usa proxima_tarefa JSON da view)
            if ((filters.taskStatus?.length ?? 0) > 0) {
                const now = new Date()
                now.setHours(0, 0, 0, 0)
                filteredData = filteredData.filter(card => {
                    const tarefa = card.proxima_tarefa as Record<string, unknown> | null
                    if (!tarefa || !tarefa.data_vencimento) {
                        return filters.taskStatus!.includes('sem_tarefa')
                    }
                    const due = new Date(tarefa.data_vencimento as string)
                    due.setHours(0, 0, 0, 0)
                    const isToday = due.getTime() === now.getTime()
                    const isOverdue = due < now
                    if (isOverdue) return filters.taskStatus!.includes('atrasada')
                    if (isToday) return filters.taskStatus!.includes('para_hoje')
                    return filters.taskStatus!.includes('em_dia')
                })
            }

            return filteredData
        }
    })

    return {
        ...query,
        myTeamMembers
    }
}
