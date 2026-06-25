import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'

// Estoque interno (almoxarifado) — espelha useInventoryProducts, mas isolado em
// tabela própria (internal_inventory_products) e filtrando SEMPRE pelo workspace
// ativo (defesa em profundidade, além da RLS). Ver migration 20260625a.

export interface InternalInventoryProduct {
    id: string
    org_id: string
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

export interface CreateInternalProductInput {
    name: string
    sku: string
    description?: string
    category?: string
    unit_price?: number
    current_stock?: number
    low_stock_threshold?: number
    image_path?: string
}

export function useInternalInventoryProducts(filters?: { search?: string; category?: string; activeOnly?: boolean }) {
    const { org } = useOrg()
    const activeOrgId = org?.id

    const { data: products = [], isLoading, error } = useQuery({
        queryKey: ['internal-inventory-products', activeOrgId, filters],
        queryFn: async () => {
            if (!activeOrgId) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabase as any).from('internal_inventory_products')
                .select('*')
                .eq('org_id', activeOrgId)
                .order('name')

            if (filters?.activeOnly !== false) {
                query = query.eq('active', true)
            }
            if (filters?.category) {
                query = query.eq('category', filters.category)
            }

            const { data, error } = await query
            if (error) throw error

            let result = (data || []) as InternalInventoryProduct[]

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
        enabled: !!activeOrgId,
    })

    return { products, isLoading, error }
}

export function useInternalInventoryProductMutations() {
    const queryClient = useQueryClient()
    const { profile } = useAuth()
    const { org } = useOrg()
    const activeOrgId = org?.id

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: ['internal-inventory-products'] })
        queryClient.invalidateQueries({ queryKey: ['internal-inventory-stats'] })
        queryClient.invalidateQueries({ queryKey: ['internal-inventory-low-stock'] })
    }

    const createProduct = useMutation({
        mutationFn: async (input: CreateInternalProductInput) => {
            if (!activeOrgId) throw new Error('Workspace ativo não encontrado')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('internal_inventory_products')
                .insert({ ...input, org_id: activeOrgId, created_by: profile?.id })
                .select()
                .single()
            if (error) throw error
            return data as InternalInventoryProduct
        },
        onSuccess: invalidate,
    })

    const updateProduct = useMutation({
        mutationFn: async ({ id, ...updates }: Partial<InternalInventoryProduct> & { id: string }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('internal_inventory_products')
                .update(updates)
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: invalidate,
    })

    const deleteProduct = useMutation({
        mutationFn: async (id: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('internal_inventory_products')
                .update({ active: false })
                .eq('id', id)
            if (error) throw error
        },
        onSuccess: invalidate,
    })

    return { createProduct, updateProduct, deleteProduct }
}

export function useInternalCategories() {
    const { org } = useOrg()
    const activeOrgId = org?.id

    return useQuery({
        queryKey: ['internal-inventory-categories', activeOrgId],
        queryFn: async () => {
            if (!activeOrgId) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('internal_inventory_products')
                .select('category')
                .eq('org_id', activeOrgId)
                .eq('active', true)
            if (error) throw error
            const unique = [...new Set((data || []).map((d: { category: string }) => d.category))]
            return unique.sort() as string[]
        },
        enabled: !!activeOrgId,
        staleTime: 1000 * 60 * 5,
    })
}
