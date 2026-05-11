import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useProductContext } from './useProductContext'
import { type LeadsFilterState } from './useLeadsFilters'
import type { Database } from '../database.types'
import { prepareSearchTerms } from '../lib/utils'

export type LeadCard = Database['public']['Views']['view_cards_acoes']['Row']

interface UseLeadsQueryProps {
    filters: LeadsFilterState
    enabled?: boolean
}

interface LeadsQueryResult {
    data: LeadCard[]
    total: number
    page: number
    pageSize: number
    totalPages: number
}

export function useLeadsQuery({ filters, enabled = true }: UseLeadsQueryProps) {
    const { session } = useAuth()
    const isAuthReady = !!session?.user?.id
    const { currentProduct } = useProductContext()

    return useQuery({
        queryKey: ['leads', filters, currentProduct],
        enabled: enabled && isAuthReady,
        placeholderData: keepPreviousData,
        queryFn: async (): Promise<LeadsQueryResult> => {
            const page = filters.page || 1
            const pageSize = filters.pageSize || 50

            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- query builder perde tipo com encadeamento dinâmico
            let query = (supabase.from('view_cards_acoes') as any)
                .select('*', { count: 'exact' })

            // Search filter
            if (filters.search) {
                const { original, normalized, digitsOnly } = prepareSearchTerms(filters.search)

                if (original) {
                    const textFields = [
                        `titulo.ilike.%${original}%`,
                        `pessoa_nome.ilike.%${original}%`,
                        `origem.ilike.%${original}%`,
                        `dono_atual_nome.ilike.%${original}%`,
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

            // Owner filter
            if ((filters.ownerIds?.length ?? 0) > 0) {
                query = query.in('dono_atual_id', filters.ownerIds)
            }

            // Stage filter
            if ((filters.stageIds?.length ?? 0) > 0) {
                query = query.in('pipeline_stage_id', filters.stageIds)
            }

            // Status comercial filter
            if ((filters.statusComercial?.length ?? 0) > 0) {
                query = query.in('status_comercial', filters.statusComercial)
            }

            // Prioridade filter
            if ((filters.prioridade?.length ?? 0) > 0) {
                query = query.in('prioridade', filters.prioridade)
            }

            // Pipeline filter (new)
            if ((filters.pipelineIds?.length ?? 0) > 0) {
                query = query.in('pipeline_id', filters.pipelineIds)
            }

            // Origem filter
            if ((filters.origem?.length ?? 0) > 0) {
                query = query.in('origem', filters.origem)
            }

            // Creation date filter
            if (filters.creationStartDate) {
                query = query.gte('created_at', `${filters.creationStartDate}T00:00:00`)
            }

            if (filters.creationEndDate) {
                query = query.lte('created_at', `${filters.creationEndDate}T23:59:59`)
            }

            // Trip date filter (new)
            if (filters.dataViagemStart) {
                query = query.gte('data_viagem_inicio', filters.dataViagemStart)
            }

            if (filters.dataViagemEnd) {
                query = query.lte('data_viagem_inicio', filters.dataViagemEnd)
            }

            // Value range filter (new)
            if (filters.valorMin !== undefined) {
                query = query.gte('valor_estimado', filters.valorMin)
            }

            if (filters.valorMax !== undefined) {
                query = query.lte('valor_estimado', filters.valorMax)
            }

            // Days without contact filter (new)
            if (filters.diasSemContatoMin !== undefined) {
                query = query.gte('tempo_sem_contato', filters.diasSemContatoMin)
            }

            if (filters.diasSemContatoMax !== undefined) {
                query = query.lte('tempo_sem_contato', filters.diasSemContatoMax)
            }

            // Tag filter — usa overlaps no array tag_ids da view
            if (filters.noTag) {
                query = query.or('tag_ids.is.null,tag_ids.eq.{}')
            } else if ((filters.tagIds?.length ?? 0) > 0) {
                query = (query as ReturnType<typeof query.overlaps>).overlaps('tag_ids', filters.tagIds)
            }

            // Archived filter — por padrão esconde, toggle em LeadsFilters permite mostrar
            if (!filters.showArchived) {
                query = query.is('archived_at', null)
            }

            // Exclude group parents
            query = query.eq('is_group_parent', false)

            // Product filter — always scoped to current product
            if (currentProduct) {
                query = query.eq('produto', currentProduct)
            }

            // Sorting
            if (filters.sortBy) {
                query = query.order(filters.sortBy, {
                    ascending: filters.sortDirection === 'asc',
                    nullsFirst: false
                })
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
                data: data as LeadCard[],
                total,
                page,
                pageSize,
                totalPages
            }
        }
    })
}
