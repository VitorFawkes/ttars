import { useState, useMemo, useEffect } from 'react'
import { Check, ChevronsUpDown, Plane, Heart, Building2, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { useProductContext } from '../../hooks/useProductContext'
import { useAuth } from '../../contexts/AuthContext'
import type { Database } from '../../database.types'

type Product = Database['public']['Enums']['app_product']

const products: { value: Product; label: string; icon: LucideIcon; color: string }[] = [
    { value: 'TRIPS', label: 'Welcome Trips', icon: Plane, color: 'text-teal-500' },
    { value: 'WEDDING', label: 'Welcome Wedding', icon: Heart, color: 'text-rose-500' },
    { value: 'CORP', label: 'Welcome Corp', icon: Building2, color: 'text-purple-500' },
]

interface ProductSwitcherProps {
    isCollapsed?: boolean
}

export function ProductSwitcher({ isCollapsed = false }: ProductSwitcherProps) {
    const { currentProduct, setProduct } = useProductContext()
    const { profile } = useAuth()
    const [open, setOpen] = useState(false)

    // Filter products based on profile.produtos (admins see all, empty = all)
    const allowedProducts = useMemo(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const profileProdutos = (profile as any)?.produtos as Product[] | null
        if (profile?.is_admin) return products
        if (!profileProdutos?.length) return products
        return products.filter(p => profileProdutos.includes(p.value))
    }, [profile])

    // Auto-select: if user has only 1 product, force it
    useEffect(() => {
        if (allowedProducts.length === 1 && currentProduct !== allowedProducts[0].value) {
            setProduct(allowedProducts[0].value)
        }
    }, [allowedProducts, currentProduct, setProduct])

    const selectedProduct = allowedProducts.find((p) => p.value === currentProduct) || allowedProducts[0] || products[0]

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button
                    role="combobox"
                    aria-expanded={open}
                    title={isCollapsed ? selectedProduct.label : undefined}
                    className={cn(
                        "flex items-center rounded-lg bg-white/10 text-sm font-medium text-white hover:bg-white/20 transition-colors border border-white/10 h-10",
                        isCollapsed
                            ? "w-10 justify-center"
                            : "w-full justify-between px-3"
                    )}
                >
                    {isCollapsed ? (
                        <selectedProduct.icon className={cn("h-5 w-5", selectedProduct.color)} />
                    ) : (
                        <>
                            <div className="flex items-center gap-2 whitespace-nowrap overflow-hidden">
                                <selectedProduct.icon className={cn("h-4 w-4 flex-shrink-0", selectedProduct.color)} />
                                <span className="truncate">{selectedProduct.label}</span>
                            </div>
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </>
                    )}
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[200px] p-0">
                {allowedProducts.map((product) => (
                    <DropdownMenuItem
                        key={product.value}
                        onSelect={() => {
                            setProduct(product.value)
                            setOpen(false)
                            // Force reload to ensure context switch is clean across the app
                            window.location.reload()
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                    >
                        <product.icon className={cn("h-4 w-4", product.color)} />
                        <span className="flex-1">{product.label}</span>
                        {currentProduct === product.value && (
                            <Check className="h-4 w-4 text-primary" />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
