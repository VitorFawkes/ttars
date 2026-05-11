import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProductContext } from './useProductContext'
import type { Proposal, ProposalVersion, ProposalStatus } from '@/types/proposals'

// ============================================
// Types
// ============================================
export interface ProposalFilters {
    search?: string
    status?: ProposalStatus | null
    createdBy?: string | null
}

export interface ProposalWithRelations extends Proposal {
    active_version: Pick<ProposalVersion, 'id' | 'title' | 'version_number'> | null
    card: {
        id: string
        titulo: string
        pessoa_principal_id: string | null
        produto: string | null
    } | null
    creator: {
        id: string
        email: string | null
        nome: string | null
    } | null
}

export interface ProposalStats {
    total: number
    draft: number
    sent: number
    viewed: number
    in_progress: number
    accepted: number
    rejected: number
    expired: number
    conversionRate: number
}

// ============================================
// Query Keys
// ============================================
export const proposalsListKeys = {
    all: ['proposals', 'list'] as const,
    filtered: (filters: ProposalFilters) => [...proposalsListKeys.all, filters] as const,
    stats: () => ['proposals', 'stats'] as const,
}

// ============================================
// Fetch All Proposals (with filters)
// ============================================
export function useProposals(filters?: ProposalFilters) {
    const { currentProduct } = useProductContext()

    return useQuery({
        queryKey: [...proposalsListKeys.filtered(filters || {}), currentProduct],
        queryFn: async () => {
            console.log('[useProposals] Starting query...')

            // Step 1: Fetch base proposals
            let query = supabase
                .from('proposals')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100)

            if (filters?.status) {
                query = query.eq('status', filters.status as string)
            }
            if (filters?.createdBy) {
                query = query.eq('created_by', filters.createdBy)
            }

            const { data: proposals, error: proposalsError } = await query

            console.log('[useProposals] Step 1 - Proposals:', {
                count: proposals?.length,
                error: proposalsError
            })

            if (proposalsError) throw proposalsError
            if (!proposals || proposals.length === 0) return []

            // Step 2: Fetch related data in parallel
            const versionIds = proposals.map(p => p.active_version_id).filter((id): id is string => id != null)
            const cardIds = proposals.map(p => p.card_id).filter((id): id is string => id != null)
            const creatorIds = proposals.map(p => p.created_by).filter((id): id is string => id != null)

            const [versionsRes, cardsRes, creatorsRes] = await Promise.all([
                versionIds.length > 0
                    ? supabase.from('proposal_versions').select('id, title, version_number').in('id', versionIds)
                    : { data: [], error: null },
                cardIds.length > 0
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ? supabase.from('cards').select('id, titulo, pessoa_principal_id, produto').in('id', cardIds).eq('produto', currentProduct as any)
                    : { data: [], error: null },
                creatorIds.length > 0
                    ? supabase.from('profiles').select('id, email, nome').in('id', creatorIds)
                    : { data: [], error: null }
            ])

            console.log('[useProposals] Step 2 - Related data:', {
                versions: versionsRes.data?.length,
                cards: cardsRes.data?.length,
                creators: creatorsRes.data?.length
            })

            // Create lookup maps
            const versionsMap = new Map((versionsRes.data || []).map(v => [v.id, v]))
            const cardsMap = new Map((cardsRes.data || []).map(c => [c.id, c]))
            const creatorsMap = new Map((creatorsRes.data || []).map(p => [p.id, p]))

            // Step 3: Merge data — only include proposals whose card matches the current product
            const result: ProposalWithRelations[] = proposals
                .filter(p => {
                    // Exclude proposals with a card_id that doesn't belong to the current product
                    if (p.card_id && !cardsMap.has(p.card_id)) return false
                    return true
                })
                .map(p => ({
                    ...p,
                    active_version: p.active_version_id ? versionsMap.get(p.active_version_id) || null : null,
                    card: p.card_id ? cardsMap.get(p.card_id) || null : null,
                    creator: p.created_by ? creatorsMap.get(p.created_by) || null : null,
                }))

            // Step 4: Client-side search filter
            let filteredResult = result
            if (filters?.search) {
                const searchLower = filters.search.toLowerCase()
                filteredResult = result.filter(p =>
                    p.active_version?.title?.toLowerCase().includes(searchLower) ||
                    p.card?.titulo?.toLowerCase().includes(searchLower)
                )
            }

            console.log('[useProposals] Final result:', filteredResult.length)
            return filteredResult
        },
    })
}

// ============================================
// Fetch Proposal Stats
// ============================================
export function useProposalStats() {
    const { currentProduct } = useProductContext()

    return useQuery({
        queryKey: [...proposalsListKeys.stats(), currentProduct],
        queryFn: async () => {
            // Join with cards to filter by current product
            const { data, error } = await supabase
                .from('proposals')
                .select('status, card:cards!inner!proposals_card_id_fkey(produto)')
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .eq('cards.produto', currentProduct as any)

            if (error) throw error

            const stats: ProposalStats = {
                total: data.length,
                draft: 0,
                sent: 0,
                viewed: 0,
                in_progress: 0,
                accepted: 0,
                rejected: 0,
                expired: 0,
                conversionRate: 0,
            }

            data.forEach(p => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const status = (p as any).status as keyof Omit<ProposalStats, 'total' | 'conversionRate'>
                if (status in stats) {
                    stats[status]++
                }
            })

            // Calculate conversion rate (accepted / sent or viewed)
            const sentOrViewed = stats.sent + stats.viewed + stats.in_progress + stats.accepted + stats.rejected
            stats.conversionRate = sentOrViewed > 0
                ? Math.round((stats.accepted / sentOrViewed) * 100)
                : 0

            return stats
        },
    })
}
