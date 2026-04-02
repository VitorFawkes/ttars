import { useState, useMemo, useEffect } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '../../lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { useProductContext, type AppProduct } from '../../hooks/useProductContext'
import { useAuth } from '../../contexts/AuthContext'
import { useProducts } from '../../hooks/useProducts'

interface ProductSwitcherProps {
    isCollapsed?: boolean
}

export function ProductSwitcher({ isCollapsed = false }: ProductSwitcherProps) {
    const { currentProduct, setProduct } = useProductContext()
    const { profile } = useAuth()
    const { products } = useProducts()
    const queryClient = useQueryClient()
    const [open, setOpen] = useState(false)

    // Filter products based on profile.produtos (admins see all, empty = all)
    const allowedProducts = useMemo(() => {
        if (profile?.is_admin) return products
        if (!profile?.produtos?.length) return products
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return products.filter(p => (profile.produtos! as any[]).includes(p.slug))
    }, [profile, products])

    // Auto-select: if user has only 1 product, force it
    useEffect(() => {
        if (allowedProducts.length === 1 && currentProduct !== allowedProducts[0].slug) {
            setProduct(allowedProducts[0].slug as AppProduct)
        }
    }, [allowedProducts, currentProduct, setProduct])

    const selectedProduct = allowedProducts.find((p) => p.slug === currentProduct) || allowedProducts[0] || products[0]

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    role="combobox"
                    aria-expanded={open}
                    title={isCollapsed ? selectedProduct.name : undefined}
                    className={cn(
                        "flex items-center rounded-lg bg-white/10 text-sm font-medium text-white hover:bg-white/20 transition-colors border border-white/10 h-10",
                        isCollapsed
                            ? "w-10 justify-center"
                            : "w-full justify-between px-3"
                    )}
                >
                    {isCollapsed ? (
                        <selectedProduct.icon className={cn("h-5 w-5", selectedProduct.color_class)} />
                    ) : (
                        <>
                            <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                                <selectedProduct.icon className={cn("h-4 w-4 flex-shrink-0", selectedProduct.color_class)} />
                                <span className="truncate">{selectedProduct.name}</span>
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px] p-0">
                {allowedProducts.map((product) => (
                    <DropdownMenuItem
                        key={product.slug}
                        onSelect={() => {
                            setProduct(product.slug as AppProduct)
                            setOpen(false)
                            queryClient.clear()
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                    >
                        <product.icon className={cn("h-4 w-4", product.color_class)} />
                        <span className="flex-1">{product.name}</span>
                        {currentProduct === product.slug && (
                            <Check className="h-4 w-4 text-primary" />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
