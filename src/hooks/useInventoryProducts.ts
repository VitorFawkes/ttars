import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface InventoryProduct {
    id: string
    name: string
    sku: string
    description: string | null
    category: string
    unit_price: number
    current_stock: number
    low_stock_threshold: number
    image_path: string | null
    active: boolean
    created_by: string | null
    created_at: string
    updated_at: string
}

export interface CreateProductInput {
    name: string
    sku: string
    description?: string
    category?: string
    unit_price?: number
    current_stock?: number
    low_stock_threshold?: number
    image_path?: string
}

export function useInventoryProducts(filters?: { search?: string; category?: string; activeOnly?: boolean }) {
    const queryKey = ['inventory-products', filters]

    const { data: products = [], isLoading, error } = useQuery({
        queryKey,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabase as any).from('inventory_products')
                .select('*')
                .order('name')

            if (filters?.activeOnly !== false) {
                query = query.eq('active', true)
            }
            if (filters?.category) {
                query = query.eq('category', filters.category)
            }

            const { data, error } = await query
            if (error) throw error

            let result = (data || []) as InventoryProduct[]

            if (filters?.search) {
                const s = filters.search.toLowerCase()
                result = result.filter(p =>
                    p.name.toLowerCase().includes(s) ||
                    p.sku.toLowerCase().includes(s) ||
                    (p.description?.toLowerCase().includes(s))
                )
            }

            return result
        },
    })

    return { products, isLoading, error }
}

export function useInventoryProduct(productId: string | null) {
    return useQuery({
        queryKey: ['inventory-product', productId],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('inventory_products')
                .select('*')
                .eq('id', productId!)
                .single()
            if (error) throw error
            return data as InventoryProduct
        },
        enabled: !!productId,
    })
}

export function useInventoryProductMutations() {
    const queryClient = useQueryClient()
    const { profile } = useAuth()

    const createProduct = useMutation({
        mutationFn: async (input: CreateProductInput) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('inventory_products')
                .insert({ ...input, created_by: profile?.id })
                .select()
                .single()
            if (error) throw error
            return data as InventoryProduct
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
        },
    })

    const updateProduct = useMutation({
        mutationFn: async ({ id, ...updates }: Partial<InventoryProduct> & { id: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('inventory_products')
                .update({ ...updates, updated_at: new Date().toISOString() })
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-product'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
        },
    })

    const deleteProduct = useMutation({
        mutationFn: async (id: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('inventory_products')
                .update({ active: false, updated_at: new Date().toISOString() })
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
        },
    })

    return { createProduct, updateProduct, deleteProduct }
}

export function useCategories() {
    return useQuery({
        queryKey: ['inventory-categories'],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('inventory_products')
                .select('category')
                .eq('active', true)
            if (error) throw error
            const unique = [...new Set((data || []).map((d: { category: string }) => d.category))]
            return unique.sort() as string[]
        },
        staleTime: 1000 * 60 * 5,
    })
}
