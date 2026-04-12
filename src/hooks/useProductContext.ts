import { useOrg } from '../contexts/OrgContext'
import { useProducts } from './useProducts'

export type AppProduct = string

interface ProductState {
    currentProduct: string
    setProduct: (product: string) => void
}

// Org slug → default product slug. Usado como fallback enquanto a tabela `products`
// carrega, para evitar um flash do produto errado ao trocar de org.
const ORG_SLUG_PRODUCT_FALLBACK: Record<string, string> = {
    'welcome-trips': 'TRIPS',
    'welcome-weddings': 'WEDDING',
}

const noop = () => {}

/**
 * Pós Fase 5 do Org Split: produto é derivado da org ativa (1 org = 1 produto).
 * Interface mantida (currentProduct / setProduct como no-op) para preservar os
 * ~30 consumidores sem precisar refatorar cada chamada — a troca de produto
 * agora acontece via OrgSwitcher.
 */
export function useProductContext(): ProductState
export function useProductContext<T>(selector: (state: ProductState) => T): T
export function useProductContext<T>(
    selector?: (state: ProductState) => T
): ProductState | T {
    const { org } = useOrg()
    const { products } = useProducts()

    // Preferir o mapa org-slug (determinístico, sem race) sobre products[0],
    // porque useProducts retorna FALLBACK_PRODUCTS com TRIPS em primeiro
    // enquanto os dados reais carregam — o que causava flash de produto errado
    // ao trocar para a Weddings.
    const currentProduct =
        (org?.slug ? ORG_SLUG_PRODUCT_FALLBACK[org.slug] : undefined) ??
        products[0]?.slug ??
        'TRIPS'

    const state: ProductState = { currentProduct, setProduct: noop }
    return selector ? selector(state) : state
}
