import { useProductContext } from './useProductContext'
import { useProducts, type ProductMetadata } from './useProducts'

/**
 * Combines useProductContext (current product slug) with useProducts (DB metadata)
 * to return full metadata for the active product, including pipeline_id.
 *
 * Replaces all PRODUCT_PIPELINE_MAP[currentProduct] usages.
 */
export function useCurrentProductMeta() {
    const currentProduct = useProductContext(s => s.currentProduct)
    const { products } = useProducts()

    const product = products.find(p => p.slug === currentProduct) ?? null

    return {
        product,
        pipelineId: product?.pipeline_id ?? undefined,
        slug: product?.slug ?? currentProduct,
    }
}

/**
 * Utility for components that need pipeline_id from a card's produto field
 * (not the current product context). Used in CardHeader, etc.
 */
export function useProductPipelineId(produto: string | null | undefined): string | undefined {
    const { products } = useProducts()
    if (!produto) return undefined
    return products.find(p => p.slug === produto)?.pipeline_id ?? undefined
}

/**
 * Utility to get full product metadata by slug.
 */
export function useProductBySlug(slug: string | null | undefined): ProductMetadata | null {
    const { products } = useProducts()
    if (!slug) return null
    return products.find(p => p.slug === slug) ?? null
}
