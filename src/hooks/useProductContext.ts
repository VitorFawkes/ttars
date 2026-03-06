import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Database } from '../database.types'

type Product = Database['public']['Enums']['app_product']

interface ProductState {
    currentProduct: Product
    setProduct: (product: Product) => void
}

const VALID_PRODUCTS = ['TRIPS', 'WEDDING', 'CORP'] as const

export const useProductContext = create<ProductState>()(
    persist(
        (set) => ({
            currentProduct: 'TRIPS',
            setProduct: (product) => set({ currentProduct: product }),
        }),
        {
            name: 'product-storage',
            onRehydrateStorage: () => (state) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if (state && !VALID_PRODUCTS.includes(state.currentProduct as any)) {
                    state.currentProduct = 'TRIPS'
                }
            },
        }
    )
)
