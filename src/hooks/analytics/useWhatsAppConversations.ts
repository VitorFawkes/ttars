import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAnalyticsFilters } from './useAnalyticsFilters'

// ── Types ──

export type ConversationStatus = 'waiting' | 'responded' | 'inactive'
export type ConversationSortKey = 'last_message_at' | 'total_messages' | 'hours_since_last' | 'first_response_min'

export interface WaConversationRow {
    contact_id: string
    contact_name: string | null
    contact_phone: string | null
    total_messages: number
    inbound_count: number
    outbound_count: number
    ai_count: number
    human_count: number
    first_message_at: string
    last_message_at: string
    last_direction: string
    hours_since_last: number
    first_response_min: number // -1 = no response
    status: ConversationStatus
    card_id: string | null
    card_titulo: string | null
    stage_name: string | null
    phase_slug: string | null
    phase_label: string | null
    owner_name: string | null
    instance_label: string | null
}

export interface WaPhaseBreakdown {
    phase_slug: string
    phase_label: string
    count: number
}

export interface WaInstanceBreakdown {
    label: string
    count: number
}

export interface WaConversationsSummary {
    total_conversations: number
    active_conversations: number
    waiting_count: number
    responded_count: number
    inactive_count: number
    avg_conversation_hours: number
    with_card_count: number
    by_phase: WaPhaseBreakdown[]
    by_instance: WaInstanceBreakdown[]
    instance_labels: string[]
}

export interface WaConversationsResult {
    summary: WaConversationsSummary
    rows: WaConversationRow[]
    total_count: number
}

// ── Hook ──

const PAGE_SIZE = 25

export function useWhatsAppConversations() {
    const { dateRange, product, ownerIds, tagIds } = useAnalyticsFilters()

    const [statusFilter, setStatusFilter] = useState<ConversationStatus | null>(null)
    const [sortBy, setSortBy] = useState<ConversationSortKey>('last_message_at')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
    const [page, setPage] = useState(0)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [phaseSlug, setPhaseSlug] = useState<string | null>(null)
    const [stageId, setStageId] = useState<string | null>(null)
    const [instance, setInstance] = useState<string | null>(null)

    // Debounce search input (300ms)
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search)
            setPage(0)
        }, 300)
        return () => clearTimeout(timer)
    }, [search])

    const query = useQuery({
        queryKey: [
            'analytics', 'whatsapp-conversations',
            dateRange.start, dateRange.end, product, ownerIds, tagIds,
            statusFilter, sortBy, sortDir, page, debouncedSearch,
            phaseSlug, stageId, instance,
        ],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC nova
            const { data, error } = await (supabase.rpc as any)('analytics_whatsapp_conversations', {
                p_from: dateRange.start,
                p_to: dateRange.end,
                p_produto: product,
                p_owner_ids: ownerIds.length > 0 ? ownerIds : undefined,
                p_tag_ids: tagIds.length > 0 ? tagIds : undefined,
                p_status: statusFilter,
                p_sort_by: sortBy,
                p_sort_dir: sortDir,
                p_limit: PAGE_SIZE,
                p_offset: page * PAGE_SIZE,
                p_search: debouncedSearch || null,
                p_phase_slug: phaseSlug,
                p_stage_id: stageId,
                p_instance: instance,
            })
            if (error) throw error
            return (data as unknown as WaConversationsResult) || null
        },
        staleTime: 3 * 60 * 1000,
        retry: 1,
    })

    const totalPages = Math.ceil((query.data?.total_count ?? 0) / PAGE_SIZE)

    const toggleSort = (key: ConversationSortKey) => {
        if (sortBy === key) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc')
        } else {
            setSortBy(key)
            setSortDir('desc')
        }
        setPage(0)
    }

    const changeStatus = (s: ConversationStatus | null) => {
        setStatusFilter(s)
        setPage(0)
    }

    const changePhase = (slug: string | null) => {
        setPhaseSlug(slug)
        setStageId(null)
        setPage(0)
    }

    const changeStage = (id: string | null) => {
        setStageId(id)
        setPage(0)
    }

    const changeInstance = (label: string | null) => {
        setInstance(label)
        setPage(0)
    }

    return {
        ...query,
        statusFilter,
        setStatusFilter: changeStatus,
        sortBy,
        sortDir,
        toggleSort,
        page,
        setPage,
        totalPages,
        pageSize: PAGE_SIZE,
        search,
        setSearch,
        phaseSlug,
        setPhaseSlug: changePhase,
        stageId,
        setStageId: changeStage,
        instance,
        setInstance: changeInstance,
    }
}
