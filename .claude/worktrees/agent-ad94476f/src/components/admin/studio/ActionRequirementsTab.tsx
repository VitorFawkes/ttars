import { createElement } from 'react'
import GovernanceConsole from './GovernanceConsole'
import { useProductContext } from '../../../hooks/useProductContext'
import { useProducts } from '../../../hooks/useProducts'
import { cn } from '@/lib/utils'

export default function ActionRequirementsTab() {
    const { currentProduct } = useProductContext()
    const { products } = useProducts()
    const product = products.find(p => p.slug === currentProduct) || products[0]

    return (
        <div className="p-6">
            <div className="mb-6">
                <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-foreground">Governança de Processos</h2>
                    {product && (
                        <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border",
                            product.slug === 'TRIPS' && "bg-teal-50 text-teal-700 border-teal-200",
                            product.slug === 'WEDDING' && "bg-rose-50 text-rose-700 border-rose-200",
                            product.slug === 'CORP' && "bg-purple-50 text-purple-700 border-purple-200"
                        )}>
                            {createElement(product.icon, { className: "w-3.5 h-3.5" })}
                            {product.name_short}
                        </span>
                    )}
                </div>
                <p className="text-muted-foreground mt-1">
                    Defina regras de bloqueio (Stage Gates) para garantir que processos sejam seguidos.
                </p>
            </div>
            <GovernanceConsole />
        </div>
    )
}
