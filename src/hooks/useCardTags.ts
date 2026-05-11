import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useOrg } from '../contexts/OrgContext'

export interface CardTag {
    id: string
    name: string
    color: string
    description: string | null
    produto: string | null
    is_active: boolean
    created_by: string | null
    created_at: string
    updated_at: string
}

// ─── Lista global de tags (cached, para todos os consumers) ────────────────

export function useCardTags(produto?: string) {
    const queryClient = useQueryClient()
    const { org } = useOrg()
    const activeOrgId = org?.id

    const { data: tags = [], isLoading } = useQuery({
        queryKey: ['card-tags', activeOrgId, produto ?? 'all'],
        queryFn: async () => {
            if (!activeOrgId) return []
            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('card_tags')
                .select('*')
                .eq('is_active', true)
                .eq('org_id', activeOrgId)
                .order('name')
            if (error) throw error
            return data as CardTag[]
        },
        staleTime: 5 * 60 * 1000, // 5 min
        enabled: !!activeOrgId,
    })

    const filtered = produto
        ? tags.filter(t => t.produto === null || t.produto === produto)
        : tags

    const createTag = useMutation({
        mutationFn: async (input: { name: string; color: string; description?: string; produto?: string }) => {
            if (!activeOrgId) throw new Error('Workspace ativo não encontrado')
            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('card_tags')
                .insert({ ...input, org_id: activeOrgId })
                .select()
                .single()
            if (error) throw error
            return data as CardTag
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card-tags'] }),
    })

    const updateTag = useMutation({
        mutationFn: async ({ id, ...input }: Partial<CardTag> & { id: string }) => {
            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('card_tags')
                .update(input)
                .eq('id', id)
                .select()
                .single()
            if (error) throw error
            return data as CardTag
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card-tags'] }),
    })

    const deleteTag = useMutation({
        mutationFn: async (id: string) => {
            const { error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('card_tags')
                .delete()
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['card-tags'] }),
    })

    return { tags: filtered, allTags: tags, isLoading, createTag, updateTag, deleteTag }
}

// ─── Tags de um card específico (CRUD no CardDetail) ──────────────────────

export function useCardTagAssignments(cardId: string) {
    const { session } = useAuth()
    const queryClient = useQueryClient()

    const { data: tagIds = [], isLoading } = useQuery({
        queryKey: ['card-tag-assignments', cardId],
        queryFn: async () => {
            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('card_tag_assignments')
                .select('tag_id')
                .eq('card_id', cardId)
            if (error) throw error
            return (data as { tag_id: string }[]).map(r => r.tag_id)
        },
        enabled: !!cardId,
    })

    const assign = useMutation({
        mutationFn: async (tagId: string) => {
            const { error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('card_tag_assignments')
                .insert({
                    card_id: cardId,
                    tag_id: tagId,
                    assigned_by: session?.user?.id,
                })
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-tag-assignments', cardId] })
            queryClient.invalidateQueries({ queryKey: ['leads'] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-cards'] })
        },
    })

    const unassign = useMutation({
        mutationFn: async (tagId: string) => {
            const { error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('card_tag_assignments')
                .delete()
                .eq('card_id', cardId)
                .eq('tag_id', tagId)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['card-tag-assignments', cardId] })
            queryClient.invalidateQueries({ queryKey: ['leads'] })
            queryClient.invalidateQueries({ queryKey: ['pipeline-cards'] })
        },
    })

    return { tagIds, isLoading, assign, unassign }
}

// ─── Contagem de uso por tag (para admin) ─────────────────────────────────

export function useCardTagUsageCounts() {
    return useQuery({
        queryKey: ['card-tag-usage-counts'],
        queryFn: async () => {
            const { data, error } = // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
                .from('card_tag_assignments')
                .select('tag_id')
            if (error) throw error
            const counts: Record<string, number> = {}
            for (const row of (data as { tag_id: string }[])) {
                counts[row.tag_id] = (counts[row.tag_id] ?? 0) + 1
            }
            return counts
        },
        staleTime: 60 * 1000,
    })
}
