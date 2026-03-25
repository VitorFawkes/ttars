import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface InventoryMovement {
    id: string
    product_id: string
    quantity: number
    movement_type: 'entrada' | 'saida_gift' | 'ajuste' | 'devolucao'
    reason: string | null
    reference_id: string | null
    performed_by: string | null
    created_at: string
    product?: { name: string; sku: string }
    performer?: { full_name: string }
}

export function useInventoryMovements(productId?: string | null) {
    const queryKey = ['inventory-movements', productId ?? 'all']

    const { data: movements = [], isLoading } = useQuery({
        queryKey,
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let query = (supabase as any).from('inventory_movements')
                .select('*, product:inventory_products(name, sku), performer:profiles!inventory_movements_performed_by_fkey(full_name)')
                .order('created_at', { ascending: false })
                .limit(200)

            if (productId) {
                query = query.eq('product_id', productId)
            }

            const { data, error } = await query
            if (error) throw error
            return (data || []) as InventoryMovement[]
        },
    })

    return { movements, isLoading }
}

export function useAddMovement() {
    const queryClient = useQueryClient()
    const { profile } = useAuth()

    return useMutation({
        mutationFn: async (input: {
            product_id: string
            quantity: number
            movement_type: 'entrada' | 'saida_gift' | 'ajuste' | 'devolucao'
            reason?: string
            reference_id?: string
        }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('inventory_movements')
                .insert({ ...input, performed_by: profile?.id })
                .select()
                .single()
            if (error) throw error
            return data as InventoryMovement
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inventory-movements'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-products'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-product'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-stats'] })
        },
    })
}
