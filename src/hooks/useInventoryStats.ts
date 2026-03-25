import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { InventoryProduct } from './useInventoryProducts'

export function useInventoryStats() {
    return useQuery({
        queryKey: ['inventory-stats'],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('inventory_products')
                .select('id, current_stock, unit_price, low_stock_threshold, active')
                .eq('active', true)
            if (error) throw error

            const products = (data || []) as Pick<InventoryProduct, 'id' | 'current_stock' | 'unit_price' | 'low_stock_threshold' | 'active'>[]
            const totalProducts = products.length
            const totalStockValue = products.reduce((sum, p) => sum + (p.current_stock * p.unit_price), 0)
            const lowStockCount = products.filter(p => p.current_stock > 0 && p.current_stock <= p.low_stock_threshold).length
            const outOfStockCount = products.filter(p => p.current_stock === 0).length

            return { totalProducts, totalStockValue, lowStockCount, outOfStockCount }
        },
        staleTime: 1000 * 30,
    })
}

export function useLowStockProducts() {
    return useQuery({
        queryKey: ['inventory-low-stock'],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase as any).from('inventory_products')
                .select('*')
                .eq('active', true)
                .order('current_stock')
            if (error) throw error

            return ((data || []) as InventoryProduct[]).filter(
                p => p.current_stock <= p.low_stock_threshold
            )
        },
        staleTime: 1000 * 30,
    })
}
