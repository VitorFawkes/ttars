import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AppProduct = string

interface ProductState {
    currentProduct: string
    setProduct: (product: string) => void
}

export const useProductContext = create<ProductState>()(
    persist(
        (set) => ({
            currentProduct: 'TRIPS',
            setProduct: (product) => set({ currentProduct: product }),
        }),
        {
            name: 'product-storage',
            // Rehydration: if stored product is empty, fallback to TRIPS
            onRehydrateStorage: () => (state) => {
                if (state && !state.currentProduct) {
                    state.currentProduct = 'TRIPS'
                }
            },
        }
    )
)
