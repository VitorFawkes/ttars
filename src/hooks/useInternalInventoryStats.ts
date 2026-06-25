import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useOrg } from '@/contexts/OrgContext'
import type { InternalInventoryProduct } from './useInternalInventoryProducts'

// KPIs do estoque interno — sempre filtrando pelo workspace ativo.

export function useInternalInventoryStats() {
    const { org } = useOrg()
    const activeOrgId = org?.id

    return useQuery({
        queryKey: ['internal-inventory-stats', activeOrgId],
        queryFn: async () => {
            if (!activeOrgId) return { totalProducts: 0, totalStockValue: 0, lowStockCount: 0, outOfStockCount: 0 }
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('internal_inventory_products')
                .select('id, current_stock, unit_price, low_stock_threshold, active')
                .eq('org_id', activeOrgId)
                .eq('active', true)
            if (error) throw error

            const products = (data || []) as Pick<InternalInventoryProduct, 'id' | 'current_stock' | 'unit_price' | 'low_stock_threshold' | 'active'>[]
            const totalProducts = products.length
            const totalStockValue = products.reduce((sum, p) => sum + (p.current_stock * p.unit_price), 0)
            const lowStockCount = products.filter(p => p.current_stock > 0 && p.current_stock <= p.low_stock_threshold).length
            const outOfStockCount = products.filter(p => p.current_stock === 0).length

            return { totalProducts, totalStockValue, lowStockCount, outOfStockCount }
        },
        enabled: !!activeOrgId,
        staleTime: 1000 * 30,
    })
}

export function useLowInternalStockProducts() {
    const { org } = useOrg()
    const activeOrgId = org?.id

    return useQuery({
        queryKey: ['internal-inventory-low-stock', activeOrgId],
        queryFn: async () => {
            if (!activeOrgId) return []
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('internal_inventory_products')
                .select('*')
                .eq('org_id', activeOrgId)
                .eq('active', true)
                .order('current_stock')
            if (error) throw error

            return ((data || []) as InternalInventoryProduct[]).filter(
                p => p.current_stock <= p.low_stock_threshold
            )
        },
        enabled: !!activeOrgId,
        staleTime: 1000 * 30,
    })
}
