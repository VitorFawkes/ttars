import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Database, Json } from '@/database.types'

type Row = Database['public']['Tables']['proposal_library']['Row']
type Insert = Database['public']['Tables']['proposal_library']['Insert']
type Update = Database['public']['Tables']['proposal_library']['Update']

export type CatalogCategory =
    | 'hotel'
    | 'experience'
    | 'transfer'
    | 'flight'
    | 'service'
    | 'insurance'
    | 'fee'
    | 'cruise'
    | 'text_block'
    | 'custom'

export type CatalogSort =
    | 'most_used'
    | 'recent'
    | 'az'
    | 'za'
    | 'price_asc'
    | 'price_desc'
    | 'relevance'

export interface CatalogFilters {
    search?: string
    categories?: CatalogCategory[]
    subCategories?: string[]
    region?: string
    tags?: string[]
    profileTags?: string[]
    priceMin?: number
    priceMax?: number
    stars?: number[]
    includeArchived?: boolean
    sort?: CatalogSort
    limit?: number
    offset?: number
}

export interface CatalogItem {
    id: string
    category: string
    sub_category: string | null
    name: string
    region: string | null
    region_country: string | null
    supplier: string | null
    source_provider: string | null
    base_price: number | null
    currency: string | null
    star_rating: number | null
    thumbnail_url: string | null
    gallery_urls: string[] | null
    amenities: string[] | null
    tags: string[] | null
    client_profile_tags: string[] | null
    season_tags: string[] | null
    usage_count: number | null
    last_used_at: string | null
    created_at: string | null
    content: Json
    similarity_score: number
    total_count: number
}

export const CATEGORY_CONFIG: Record<CatalogCategory, { label: string; icon: string; color: string }> = {
    hotel: { label: 'Hotel', icon: 'Building2', color: 'text-blue-600' },
    experience: { label: 'Experiência', icon: 'Sparkles', color: 'text-purple-600' },
    transfer: { label: 'Transfer', icon: 'Car', color: 'text-green-600' },
    flight: { label: 'Voo', icon: 'Plane', color: 'text-sky-600' },
    service: { label: 'Serviço', icon: 'Wrench', color: 'text-slate-600' },
    insurance: { label: 'Seguro', icon: 'Shield', color: 'text-amber-600' },
    fee: { label: 'Taxa', icon: 'Receipt', color: 'text-slate-600' },
    cruise: { label: 'Cruzeiro', icon: 'Ship', color: 'text-cyan-600' },
    text_block: { label: 'Texto', icon: 'FileText', color: 'text-gray-600' },
    custom: { label: 'Personalizado', icon: 'Package', color: 'text-slate-600' },
}

export const SORT_OPTIONS: Array<{ value: CatalogSort; label: string }> = [
    { value: 'most_used', label: 'Mais usados' },
    { value: 'recent', label: 'Mais recentes' },
    { value: 'az', label: 'A — Z' },
    { value: 'za', label: 'Z — A' },
    { value: 'price_asc', label: 'Menor preço' },
    { value: 'price_desc', label: 'Maior preço' },
    { value: 'relevance', label: 'Relevância' },
]

export function useCatalogSearch(filters: CatalogFilters, enabled = true) {
    return useQuery({
        queryKey: ['catalog', 'search', filters],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('search_proposal_library_v2', {
                p_search: filters.search?.trim() || undefined,
                p_categories: filters.categories?.length ? filters.categories : undefined,
                p_sub_categories: filters.subCategories?.length ? filters.subCategories : undefined,
                p_region: filters.region?.trim() || undefined,
                p_tags: filters.tags?.length ? filters.tags : undefined,
                p_profile_tags: filters.profileTags?.length ? filters.profileTags : undefined,
                p_price_min: filters.priceMin ?? undefined,
                p_price_max: filters.priceMax ?? undefined,
                p_stars: filters.stars?.length ? filters.stars : undefined,
                p_include_archived: filters.includeArchived ?? false,
                p_sort: filters.sort ?? 'most_used',
                p_limit: filters.limit ?? 60,
                p_offset: filters.offset ?? 0,
            })
            if (error) throw error
            return (data ?? []) as unknown as CatalogItem[]
        },
        enabled,
        staleTime: 30_000,
    })
}

export function useCatalogTopRegions(limit = 8) {
    return useQuery({
        queryKey: ['catalog', 'top-regions', limit],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('catalog_top_regions', { p_limit: limit })
            if (error) throw error
            return (data ?? []) as Array<{ region: string; item_count: number; total_uses: number }>
        },
        staleTime: 5 * 60_000,
    })
}

export function useCatalogTopTags(limit = 12) {
    return useQuery({
        queryKey: ['catalog', 'top-tags', limit],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('catalog_top_tags', { p_limit: limit })
            if (error) throw error
            return (data ?? []) as Array<{ tag: string; item_count: number }>
        },
        staleTime: 5 * 60_000,
    })
}

export function useCatalogItem(id: string | null) {
    return useQuery({
        queryKey: ['catalog', 'item', id],
        queryFn: async () => {
            if (!id) return null
            const { data, error } = await supabase
                .from('proposal_library')
                .select('*')
                .eq('id', id)
                .single()
            if (error) throw error
            return data as Row
        },
        enabled: !!id,
    })
}

export function useUpdateCatalogItem() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Update }) => {
            const { data, error } = await supabase
                .from('proposal_library')
                .update(updates)
                .eq('id', id)
                .select()
                .single()
            if (error) throw error
            return data as Row
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['catalog'] })
            queryClient.setQueryData(['catalog', 'item', data.id], data)
        },
    })
}

export function useArchiveCatalogItem() {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
            const { error } = await supabase
                .from('proposal_library')
                .update({ is_archived: archived })
                .eq('id', id)
            if (error) throw error
            return { id, archived }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['catalog'] })
        },
    })
}

export function useCreateCatalogItem() {
    const queryClient = useQueryClient()
    const { user } = useAuth()
    return useMutation({
        mutationFn: async (item: Omit<Insert, 'created_by'>) => {
            const { data, error } = await supabase
                .from('proposal_library')
                .insert({ ...item, created_by: user!.id })
                .select()
                .single()
            if (error) throw error
            return data as Row
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['catalog'] })
        },
    })
}
