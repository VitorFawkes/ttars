import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Database, Json } from '@/database.types'

// ============================================
// Types (Derived from Database)
// ============================================
type TableRow = Database['public']['Tables']['proposal_library']['Row']
type TableInsert = Database['public']['Tables']['proposal_library']['Insert']
type TableUpdate = Database['public']['Tables']['proposal_library']['Update']

export type LibraryItem = TableRow
export type LibraryItemInsert = TableInsert
export type LibraryItemUpdate = TableUpdate

// Category matches the CHECK constraint in the database
export type LibraryCategory = 'hotel' | 'experience' | 'transfer' | 'flight' | 'service' | 'text_block' | 'custom'

export interface LibrarySearchResult extends Omit<LibraryItem, 'name_search' | 'updated_at'> {
    similarity_score: number
    thumbnail_url: string | null  // Extracted from content JSONB by RPC
}

export interface LibraryFilters {
    search?: string
    category?: LibraryCategory
    destination?: string
}

// ============================================
// Category Config
// ============================================
// Categorias disponíveis na biblioteca
// NOTA: "flight" foi removido porque voos são muito voláteis (preços mudam constantemente)
export const LIBRARY_CATEGORY_CONFIG: Record<LibraryCategory, {
    label: string
    icon: string
    color: string
    description?: string
    isAvailable?: boolean  // false = não aparece na UI de criação
}> = {
    hotel: { label: 'Hotel', icon: 'Building2', color: 'text-blue-600', description: 'Hotéis, pousadas, resorts', isAvailable: true },
    experience: { label: 'Experiência', icon: 'Sparkles', color: 'text-purple-600', description: 'Passeios, tours, atividades', isAvailable: true },
    transfer: { label: 'Transfer', icon: 'Car', color: 'text-green-600', description: 'Traslados, transporte', isAvailable: true },
    flight: { label: 'Voo', icon: 'Plane', color: 'text-sky-600', description: 'Voos (não reutilizável)', isAvailable: false },  // Desabilitado - muito volátil
    service: { label: 'Seguro', icon: 'Shield', color: 'text-amber-600', description: 'Seguros viagem', isAvailable: true },
    text_block: { label: 'Texto', icon: 'FileText', color: 'text-gray-600', isAvailable: false },
    custom: { label: 'Personalizado', icon: 'Package', color: 'text-slate-600', isAvailable: false },
}

// Categorias que podem ser criadas na biblioteca (exclui flight, text_block, custom)
export const AVAILABLE_LIBRARY_CATEGORIES = Object.entries(LIBRARY_CATEGORY_CONFIG)
    .filter(([_, config]) => config.isAvailable)
    .map(([key]) => key as LibraryCategory)

// ============================================
// Search Hook
// ============================================
export function useLibrarySearch(filters: LibraryFilters, enabled = true) {
    return useQuery({
        queryKey: ['library', 'search', filters],
        queryFn: async () => {
            const { data, error } = await supabase
                .rpc('search_proposal_library', {
                    search_term: filters.search || '',
                    category_filter: filters.category || undefined,
                    destination_filter: filters.destination || undefined,
                    limit_count: 30,
                })

            if (error) throw error
            return data as unknown as LibrarySearchResult[]
        },
        enabled,
        staleTime: 1000 * 60, // 1 minute
    })
}

// ============================================
// Single Item Hook
// ============================================
export function useLibraryItem(id: string | null) {
    return useQuery({
        queryKey: ['library', 'item', id],
        queryFn: async () => {
            if (!id) return null

            const { data, error } = await supabase
                .from('proposal_library')
                .select('*')
                .eq('id', id)
                .single()

            if (error) throw error
            return data
        },
        enabled: !!id,
    })
}

// ============================================
// My Items Hook
// ============================================
export function useMyLibraryItems(category?: LibraryCategory) {
    const { user } = useAuth()

    return useQuery({
        queryKey: ['library', 'my-items', user?.id, category],
        queryFn: async () => {
            let query = supabase
                .from('proposal_library')
                .select('*')
                .eq('created_by', user!.id)
                .order('updated_at', { ascending: false })

            if (category) {
                query = query.eq('category', category)
            }

            const { data, error } = await query
            if (error) throw error
            return data
        },
        enabled: !!user,
    })
}

// ============================================
// Create Item Mutation
// ============================================
export function useCreateLibraryItem() {
    const queryClient = useQueryClient()
    const { user } = useAuth()

    return useMutation({
        mutationFn: async (item: Omit<LibraryItemInsert, 'created_by'>) => {
            const { data, error } = await supabase
                .from('proposal_library')
                .insert({
                    ...item,
                    created_by: user!.id,
                })
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['library'] })
        },
    })
}

// ============================================
// Update Item Mutation
// ============================================
export function useUpdateLibraryItem() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: LibraryItemUpdate }) => {
            const { data, error } = await supabase
                .from('proposal_library')
                .update(updates)
                .eq('id', id)
                .select()
                .single()

            if (error) throw error
            return data
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['library'] })
            queryClient.setQueryData(['library', 'item', data.id], data)
        },
    })
}

// ============================================
// Delete Item Mutation
// ============================================
export function useDeleteLibraryItem() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from('proposal_library')
                .delete()
                .eq('id', id)

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['library'] })
        },
    })
}

// ============================================
// Increment Usage Mutation
// ============================================
export function useIncrementLibraryUsage() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.rpc('increment_library_usage', {
                library_id: id,
            })

            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['library'] })
        },
    })
}

// ============================================
// Save From Proposal Item (convenience)
// ============================================
export function useSaveToLibrary() {
    const createItem = useCreateLibraryItem()

    return useMutation({
        mutationFn: async (params: {
            name: string
            category: LibraryCategory
            content: Record<string, unknown>
            basePrice?: number
            supplier?: string
            destination?: string
            tags?: string[]
            isShared?: boolean
        }) => {
            return createItem.mutateAsync({
                name: params.name,
                category: params.category,
                content: params.content as Json,
                base_price: params.basePrice || 0,
                currency: 'BRL',
                supplier: params.supplier ?? null,
                destination: params.destination ?? null,
                tags: params.tags || [],
                is_shared: params.isShared ?? true,
            })
        },
    })
}
