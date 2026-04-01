import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useProductContext } from './useProductContext'

/**
 * Reads settings from integration_settings with product-scoped resolution.
 * For each key, product-specific value takes precedence over org-global value.
 *
 * NOTE: The 'produto' column is added by migration H3-006. Until database.types.ts
 * is regenerated, we use select('*') and cast to avoid TS errors.
 *
 * @param prefix - Key prefix to filter (e.g., 'date_features')
 * @param product - Product slug override. If not provided, uses current product.
 */
export function useProductScopedSettings(prefix: string, product?: string) {
    const currentProduct = useProductContext(s => s.currentProduct)
    const productSlug = product ?? currentProduct

    return useQuery({
        queryKey: ['product-settings', prefix, productSlug],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('integration_settings')
                .select('*')
                .like('key', `${prefix}.%`)

            if (error) throw error

            // Build a map where product-specific values override global ones
            const settings: Record<string, string> = {}

            for (const row of data ?? []) {
                const shortKey = row.key.replace(`${prefix}.`, '')
                // produto column added by H3-006 migration — may be null (global) or string (product-scoped)
                const rowProduto = (row as Record<string, unknown>).produto as string | null | undefined

                if (!rowProduto) {
                    // Global setting — only set if no product-specific value exists yet
                    if (!(shortKey in settings)) {
                        settings[shortKey] = row.value
                    }
                } else if (rowProduto === productSlug) {
                    // Product-specific — always overrides
                    settings[shortKey] = row.value
                }
            }

            return settings
        },
        staleTime: 5 * 60 * 1000,
    })
}
